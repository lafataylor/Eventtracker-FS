"""Idempotent ingestion helpers (Ticket 1 prevention + Ticket 2 identity).

Background
----------
`AdminEvent.post` historically called `Event.objects.create()` unconditionally,
so every re-scrape of a post inserted another row. In production that produced
23,355 surplus rows across 8,864 posts — 42% of the events table. `Venue` had
the same problem via an unconditional `Venue.objects.create()` per event,
yielding 73,519 venues for 55,385 events.

Design
------
Identity is *positional*: source_key = "{shortcode}__{slide}__{ordinal}".
    - shortcode : the Instagram post
    - slide     : the carousel slide the event came from
    - ordinal   : the event's position among events extracted from that slide
It is deliberately NOT derived from the event's text. 71.9% of production rows
have no name, so a name-based key collapses distinct events into one key and
loses data on upsert. Positional keys are collision-free by construction; two
distinct events always get distinct keys and can never overwrite each other.

Scope: this module only makes *future* ingestion idempotent. The pre-existing
23,355 legacy duplicates (source_key NULL) are handled by the separate
duplicate-detection pass, which surfaces them as EventMatch pairs for review —
never by silently mutating or deleting rows here.
"""

import re
import unicodedata

from django.db import IntegrityError, transaction


def normalize_text(value):
    """Casefold, strip accents, collapse whitespace — for comparison only.

    Accent folding matters because the corpus is largely Spanish and German
    ("Café" vs "cafe"), and SQLite's LIKE only case-folds ASCII.
    """
    if not value:
        return ''
    decomposed = unicodedata.normalize('NFKD', str(value))
    stripped = ''.join(c for c in decomposed if not unicodedata.combining(c))
    return re.sub(r'\s+', ' ', stripped).strip().casefold()


def coerce_int(value, default=0):
    """Best-effort int. Never raises — a bad slide/ordinal must not abort the
    whole ingest batch (it previously propagated a ValueError to the view)."""
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def coerce_slide(value):
    """Slide index for storage, preserving the None vs 0 distinction:
    None = single-image post, 0 = first slide of a carousel. (build_source_key
    uses coerce_int instead, since a key always needs a concrete number.)"""
    return None if value is None else coerce_int(value)


def build_source_key(shortcode, slide_index=None, ordinal=0):
    """Compose the positional identity `{shortcode}__{slide}__{ordinal}`.

    Returns None without a shortcode: a key that the next scrape cannot
    reproduce is worse than no key, because it would defeat the upsert.
    """
    if not shortcode:
        return None
    return f'{shortcode}__{coerce_int(slide_index)}__{coerce_int(ordinal)}'[:300]


def resolve_venue(venue_model, data):
    """Reuse an identical venue instead of creating a new row per event.

    Callers must fold any AccountDetail overrides into `data` first, so a shared
    venue is only reused when it matches the *final* values — this function must
    never mutate an existing venue.
    """
    if not data:
        return None
    lookup = {
        'name': data.get('name'),
        'city': data.get('city'),
        'state': data.get('state'),
        'country': data.get('country'),
        'address': data.get('address'),
    }
    if not any(lookup.values()):
        return None
    return venue_model.objects.filter(**lookup).first() or venue_model.objects.create(**lookup)


def _coalesce_into(instance, defaults):
    """Copy only non-empty incoming values onto instance. Returns True if any
    field changed. A sparse re-scrape (flaky extraction often returns nulls)
    must not clobber previously-good name/venue/price with None."""
    changed = False
    for field, value in defaults.items():
        if value in (None, ''):
            continue
        if getattr(instance, field, None) != value:
            setattr(instance, field, value)
            changed = True
    return changed


def upsert_event(event_model, source_key, shortcode, slide_index, defaults):
    """Create or update a row keyed on source_key. Returns (event, action).

    action is 'created' | 'updated'. Without a source_key, falls back to a plain
    create so callers that cannot yet supply post identity keep working.

    Race-safe: get_or_create is atomic, and a concurrent insert that loses the
    unique-constraint race is caught and converted to an update rather than
    aborting the whole batch with IntegrityError.
    """
    if not source_key:
        return event_model.objects.create(**defaults), 'created'

    create_defaults = dict(
        defaults,
        source_key=source_key,
        shortcode=shortcode,
        source_slide_index=coerce_slide(slide_index),
    )
    try:
        with transaction.atomic():
            obj, created = event_model.objects.get_or_create(
                source_key=source_key, defaults=create_defaults)
    except IntegrityError:
        obj = event_model.objects.filter(source_key=source_key).first()
        if obj is None:
            raise
        created = False

    if created:
        return obj, 'created'

    # Only fill identity fields, never blank them: a re-ingest that omits the
    # shortcode must not wipe the stored one that dedupe relies on.
    if shortcode:
        obj.shortcode = shortcode
    if slide_index is not None:
        obj.source_slide_index = coerce_slide(slide_index)
    _coalesce_into(obj, defaults)
    obj.save()
    return obj, 'updated'
