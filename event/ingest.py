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

import hashlib
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


def normalize_poster_name(value):
    """Return a plain Instagram username, or None if the value is unusable.

    Guards a live corruption: a serialized Account sometimes reaches this field,
    and the old code created a NEW Account named after that blob. The next run
    serialized *that* account and nested it again, so the username grew
    exponentially — production holds 37 such rows, the longest 3,739 characters
    in a CharField(max_length=255) (SQLite does not enforce the limit).

    Accepts a dict (takes its "user") and rejects anything that looks like a
    serialized object, so the chain cannot extend further.
    """
    if value is None:
        return None
    if isinstance(value, dict):
        value = value.get('user')
    if not isinstance(value, str):
        return None
    value = value.strip()
    if not value:
        return None
    # A serialized Account/dict, not a username.
    if value.startswith('{') or ("'user'" in value) or ('"user"' in value):
        return None
    # Instagram usernames are <=30 chars; anything longer is not one.
    return value if len(value) <= 30 else None


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


def content_source_key(shortcode, name, start_date, start_time=None):
    """Compose a content-derived identity `{shortcode}__e{hash}` for one event
    of a MULTI-event post (several DISTINCT events extracted from one post —
    not a recurring series, whose per-date expansion is generated
    deterministically in code and so keeps stable positional keys).

    Positional keys ({shortcode}__{slide}__{ordinal}) are only stable when the
    extractor returns the same events in the same order on every run. For a
    roundup flyer it does not: re-extracting "This week at RENATE" returned 4
    of 9 events, renamed, and on a different slide — so ordinal 0 pointed at a
    different event and the manual refresh wrote one event's data over
    another's (2026-08-27). Keying on what the event IS (normalised title +
    date) makes a re-extraction land on the same row regardless of order,
    count or slide. Wording drift between runs yields at worst a second row
    for the review queue, never an overwrite of the wrong event.

    start_time is part of the basis because a roundup can legitimately list
    two events with the same name on the same night (two slots of one act);
    without it they would share a key and the second would be silently
    merged into the first under the nightly fill-empty upsert.

    Returns None without a shortcode or a title: nameless events keep the
    positional key, which is the only identity they have.
    """
    if not shortcode or not (name or '').strip():
        return None
    basis = '|'.join((normalize_text(name), (start_date or '').strip(),
                      normalize_text(start_time or '')))
    digest = hashlib.sha1(basis.encode('utf-8')).hexdigest()[:12]
    return f'{shortcode}__e{digest}'[:300]


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


# Owner-controlled resolution state. A re-scrape must never overwrite these:
# once the owner hides a duplicate (is_duplicate/suppressed/canonical) the
# nightly ingest of the same source_key would otherwise flip is_duplicate back
# to the payload's False and resurrect the event the owner hid.
_OWNER_RESOLUTION_FIELDS = frozenset(
    {'is_duplicate', 'suppressed', 'canonical', 'canonical_id', 'duplicate_link'})


def _coalesce_into(instance, defaults):
    """Fill only EMPTY fields on instance. Returns True if any field changed.

    Two protections in one rule:
      * a sparse re-scrape (flaky extraction returns nulls) must not clobber
        previously-good values with None, and
      * a re-scrape must not overwrite the owner's manual corrections. The
        dashboard edit flow writes straight to these rows, and the old blind
        INSERT never touched an existing row — so "scraper wins over the
        owner" would be a regression, not a feature. Identity and dedupe need
        the upsert; enrichment fills gaps only.

    Owner-resolution fields (suppressed/canonical/is_duplicate/...) are never
    written here at all."""
    changed = False
    for field, value in defaults.items():
        if value in (None, '') or field in _OWNER_RESOLUTION_FIELDS:
            continue
        current = getattr(instance, field, None)
        if current not in (None, ''):
            continue          # occupied -> owner/state wins over re-scrape
        if current != value:
            setattr(instance, field, value)
            changed = True
    return changed


def upsert_event(event_model, source_key, shortcode, slide_index, defaults,
                 overwrite=False):
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

    if overwrite:
        # Human-initiated refresh (manual re-paste): the new extraction wins
        # over stale scraped values. Owner-resolution fields stay protected.
        changed = False
        for field, value in defaults.items():
            if field in _OWNER_RESOLUTION_FIELDS:
                continue
            if getattr(obj, field, None) != value and value not in (None, ''):
                setattr(obj, field, value)
                changed = True
        if changed:
            obj.save()
        return obj, 'updated'

    # Only fill identity fields, never blank them: a re-ingest that omits the
    # shortcode must not wipe the stored one that dedupe relies on.
    if shortcode:
        obj.shortcode = shortcode
    if slide_index is not None:
        obj.source_slide_index = coerce_slide(slide_index)
    _coalesce_into(obj, defaults)
    obj.save()
    return obj, 'updated'
