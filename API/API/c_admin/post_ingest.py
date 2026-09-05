"""Post-level ingestion for the manual add-by-URL path (Ticket 2, phase C).

The manual path (`create_event_from_instagram_link`) previously took only
`post_data["displayUrl"]` — one image — and never checked `type == "Sidecar"`,
so pasting a carousel URL could only ever produce a single event. The batch
path split carousels but then labelled each slide independently, so a slide
listing several events still collapsed into one.

This module does it once, correctly, for both callers:
  1. collect EVERY slide image of the post,
  2. mirror each to Firebase (Instagram CDN URLs expire, and the stored
     orig_thumb has to keep working),
  3. run ONE structured-output vision call over all slides,
  4. return one API payload per extracted event, carrying shortcode +
     source_slide_index so ingestion can upsert on source_key.

`slide_image_urls` is pure and unit-tested; the rest is I/O orchestration.
"""

import logging
import os
import re
import unicodedata

logger = logging.getLogger('django')

# Per-slide network budget for the request path. The scraper's
# @retry(stop_after_attempt(5), wait_fixed(15)) downloader is built for a
# background cron; across 20 carousel slides its worst case is many minutes,
# while the frontend's axios client gives up at 30s.
SLIDE_DOWNLOAD_TIMEOUT = 8


def accept_hosted_url(value):
    """The uploader (saveImage / the Firebase fn) returns the HTTP response
    BODY, which is truthy even for an error page. Only a URL-shaped string may
    be treated as a hosted image URL — anything else would be sent to the
    vision API as an image or stored as orig_thumb. One rule, used by every
    upload loop, so the two ingestion paths can't drift."""
    return value.strip() if isinstance(value, str) and value.strip().startswith('http') else None


def fast_download(url, save_path, timeout=SLIDE_DOWNLOAD_TIMEOUT):
    """Single-attempt slide download, bounded so a request can't hang.

    Raises on failure; mirror_slides skips that slide and keeps the rest.
    """
    import requests

    response = requests.get(url, timeout=timeout)
    response.raise_for_status()
    with open(save_path, 'wb') as handle:
        handle.write(response.content)


def slide_image_urls(post_data):
    """Every image URL of an Apify Instagram post, in slide order.

    Handles the shapes the actor returns:
      * Sidecar (carousel): `images` (URL list) and/or `childPosts` (per-slide
        objects). childPosts is preferred when present because it carries
        per-slide metadata; `images` is the fallback the old scraper used.
      * Image / Video / story-normalised items: a single `displayUrl`.
    Falls back to displayUrl so a malformed carousel still yields one image
    rather than nothing.
    """
    if not isinstance(post_data, dict):
        return []

    urls = []
    for child in post_data.get('childPosts') or []:
        if isinstance(child, dict):
            url = child.get('displayUrl') or child.get('imageUrl')
            if url:
                urls.append(url)

    if not urls:
        for image in post_data.get('images') or []:
            if isinstance(image, str):
                urls.append(image)
            elif isinstance(image, dict):
                url = image.get('url') or image.get('displayUrl')
                if url:
                    urls.append(url)

    if not urls:
        display = post_data.get('displayUrl')
        if display:
            urls.append(display)

    # De-duplicate while preserving slide order.
    seen, ordered = set(), []
    for url in urls:
        if url not in seen:
            seen.add(url)
            ordered.append(url)
    return ordered


import re

# Same pattern migration 0010 uses to backfill shortcodes, so a URL parsed here
# yields the identical shortcode that path produces.
_POST_RE = re.compile(r'/(?:p|reel|tv)/([^/?#]+)')
_STORY_RE = re.compile(r'/stories/[^/]+/(\d+)')


def post_shortcode(post_data):
    """The post's Instagram shortcode under any of the actor's key spellings."""
    if not isinstance(post_data, dict):
        return None
    return (post_data.get('shortCode') or post_data.get('shortcode')
            or post_data.get('code') or None)


def split_child_shortcode(filename):
    """Split the scraper's per-image key into (shortcode, slide_index).

    process_post names carousel slides "{shortcode}__{idx}" (and single-image
    posts just "{shortcode}"), but that identity was only ever used for local
    filenames — it never reached the database, which is why re-scrapes could
    not be deduplicated. Returning it lets the batch path send shortcode +
    sourceSlideIndex so AdminEvent.post upserts instead of inserting.

    Shortcodes themselves can contain "__" (e.g. "DC2LX__qOJ3"), so only a
    trailing all-digit segment counts as a slide index.
    """
    if not filename:
        return None, None
    parent, sep, tail = str(filename).rpartition('__')
    if sep and parent and tail.isdigit():
        return parent, int(tail)
    return str(filename), None


def shortcode_from_url(url):
    """Parse a shortcode out of an Instagram URL.

    Must strip query strings and fragments: share links carry `?igsh=...`, and
    a naive split on '/' would fold that into the shortcode, producing a
    different source_key every time and defeating the upsert.
    """
    if not url:
        return None
    story = _STORY_RE.search(url)
    if story:
        return f'story_{story.group(1)}'[:100]
    post = _POST_RE.search(url)
    return post.group(1)[:100] if post else None


def mirror_slides(urls, *, exec_id, user, output_file_path, downloader, uploader,
                  limit=20):
    """Download each slide and mirror it to durable storage.

    Returns (durable_urls, original_urls) for the slides that succeeded. A slide
    that fails is skipped rather than aborting the post — partial extraction
    beats none. `limit` matches Instagram's 20-slide carousel maximum.

    Callers on a request path should pass a downloader WITHOUT long retries:
    the scraper's retry(5, wait 15s) across 20 slides can block a worker for
    tens of minutes, far past the frontend's 30s timeout.

    A uuid is mixed into the temp path because the caller's name is only
    second-resolution — two concurrent manual adds in the same second would
    otherwise overwrite each other's slide files.
    """
    import uuid
    run_id = uuid.uuid4().hex[:8]

    durable, real_indexes = [], []
    for index, url in enumerate(urls[:limit]):
        local_path = f"/tmp/{output_file_path}_{run_id}_{index}.jpg"
        try:
            downloader(url, local_path)
            hosted = uploader(exec_id, user, f"{output_file_path}_{run_id}_{index}",
                              local_path, url)
            accepted = accept_hosted_url(hosted)
            if accepted:
                durable.append(accepted)
                real_indexes.append(index)
            else:
                logger.warning("[CAROUSEL] upload for slide %s of %s returned "
                               "non-URL (%r)", index, output_file_path,
                               str(hosted)[:120])
        except Exception as exc:  # noqa: BLE001 — one bad slide must not kill the post
            logger.warning("[CAROUSEL] slide %s mirror failed for %s: %s",
                           index, output_file_path, exc)
        finally:
            try:
                if os.path.exists(local_path):
                    os.remove(local_path)
            except OSError:
                pass
    # real_indexes[i] is the ORIGINAL slide number of durable[i]. Callers must
    # remap the model's shown-index back through it before persisting, or a
    # single failed slide shifts every source_key and re-ingest duplicates.
    return durable, real_indexes


def build_payloads(extraction, *, shortcode, post_link, slide_urls,
                   for_location=None, poster=None, real_slide_indexes=None):
    """Map a PostExtraction to AdminEvent.post payloads, one per event.

    Each payload carries shortcode + sourceSlideIndex + sourceOrdinal, from
    which AdminEvent.post derives the positional source_key — except for the
    named events of a multi-event post, which carry an explicit content-derived
    source_key (see the loop below and event/ingest.py). Either way the server
    upserts on that key, so re-scrapes update in place instead of inserting
    duplicates.

    real_slide_indexes: mirror_slides' second return value. The model indexes
    the images it was SHOWN; a slide that failed to mirror is absent from that
    list, so the shown-index must be translated back to the true slide number
    BEFORE it is folded into source_key — otherwise one flaky upload shifts
    every key and the next ingest of the post inserts duplicates. The remap
    lives HERE, not in callers: a caller-side copy already diverged once and
    broke the manual add path with a NameError.
    """
    from .extraction import expand_recurring, to_api_payload

    # Recurring series become one event per date (product owner's requirement).
    #
    # The ordinal is assigned HERE, per slide, before any caller filters the
    # list. It is part of source_key ({shortcode}__{slide}__{ordinal}), so it
    # must be identical no matter which path ingests the post — the manual
    # path drops non-event payloads before POSTing while the nightly path
    # keeps them, and a server-side arrival-order counter would give the same
    # event two different keys across those paths.
    from event.ingest import content_source_key

    payloads = []
    per_slide_counter = {}
    expanded = list(expand_recurring(extraction.events))
    # Identity for MULTI-event posts is content-derived (normalised title +
    # date), not positional. The extractor does not return a roundup's events
    # in a stable order or count: re-extracting "This week at RENATE" gave 4
    # of 9 events, renamed, on a different slide, so ordinal 0 pointed at a
    # different event and the manual refresh overwrote one event with another
    # (2026-08-27). Single-event posts and nameless events keep the positional
    # key, which is stable for them and the only identity they have. So does a
    # single RECURRING series: its per-date rows are expanded deterministically
    # in code from one seed event, so their ordinals never vary — and keying
    # them on the model-inferred anchor date would turn a one-day drift into
    # N duplicate rows. Hence the decision is made on the EXTRACTED events,
    # not the expanded list.
    multi_event = len(extraction.events) > 1
    for event in expanded:
        slide = event.source_slide_index
        slide_key = 0 if slide is None else int(slide)
        ordinal = per_slide_counter.get(slide_key, 0)
        per_slide_counter[slide_key] = ordinal + 1
        if slide is not None and 0 <= slide < len(slide_urls):
            image_url = slide_urls[slide]
        else:
            image_url = slide_urls[0] if slide_urls else None
        real_slide = slide
        if (real_slide_indexes is not None and slide is not None
                and 0 <= slide < len(real_slide_indexes)):
            real_slide = real_slide_indexes[slide]
        payloads.append(to_api_payload(
            event,
            shortcode=shortcode,
            slide_index=real_slide,
            ordinal=ordinal,
            post_link=post_link,
            image_url=image_url,
            for_location=for_location,
            poster=poster,
            # A recurring series keeps positional keys even inside a roundup:
            # its rows are expanded in code from one seed (recurrence is
            # preserved on each copy), so their ordinals are stable and a
            # date-hashed key would turn a one-day anchor drift into N rows.
            source_key=(content_source_key(shortcode, event.event_name,
                                           event.start_date, event.start_time,
                                           ordinal=ordinal)
                        if multi_event and not event.recurrence else None),
        ))
    return _drop_other_metro_events(payloads, expanded, shortcode)


def _drop_other_metro_events(payloads, events, shortcode):
    """Drop event rows the extractor placed in a metro the site does not serve.

    Owner rule (2026-09-01): "when one post grabs events from a whole tour with
    other cities I would like to just drop them unless they are cities that are
    currently on my list", i.e. Berlin, Bali, Los Angeles, Mexico City.

    Only an explicit OTHER drops a row. UNKNOWN, a missing field (older
    extractions replayed through this path) and every served metro are kept:
    measured on 14 days of production rows, deciding on the city STRING instead
    would have deleted ~146 real events whose city is a neighbourhood
    (Roma Norte, Neukoelln, Seminyak, Hollywood), so this fails open by design.

    Non-event payloads are never dropped: they carry no listing but they are
    what marks a post as processed, and dropping them would re-bill the same
    post to OpenAI every night.

    Filtering happens AFTER build_payloads assigned ordinals, so the surviving
    rows keep the same source_key they would have had — both ingestion paths
    stay in agreement and a re-scrape still upserts instead of duplicating.
    """
    kept = []
    for payload, event in zip(payloads, events):
        if payload.get("isEvent") and getattr(event, "metro", None) == "OTHER":
            area_metro = served_metro_for(getattr(event, "city", None)) \
                or served_metro_for(getattr(event, "state", None))
            if area_metro:
                logger.info(
                    "[METRO] keeping %s event %r (city=%r) - the model said "
                    "OTHER but that is a known %s area", shortcode,
                    event.event_name, event.city, area_metro)
                kept.append(payload)
                continue
            logger.info(
                "[METRO] dropping %s event %r (city=%r) - outside the served "
                "cities", shortcode, event.event_name, event.city)
            continue
        kept.append(payload)
    return kept


# Code-level safety net under the metro classifier. The prompt lists these
# areas too, and on 2026-09-05 the model STILL returned OTHER for a Uluwatu
# post (Bali) during validation - which would have dropped a real Bali event.
# A row whose city or state names a known area of a served metro is never
# dropped, whatever the model said. Extend freely: a wrong entry here can only
# keep an event (fail open), never hide one.
SERVED_METRO_AREAS = {
    "Mexico City": (
        "mexico city", "cdmx", "ciudad de mexico", "df", "roma", "roma norte",
        "roma sur", "condesa", "hipodromo", "polanco", "juarez",
        "colonia juarez", "cuauhtemoc", "coyoacan", "centro",
        "centro historico", "narvarte", "del valle", "napoles", "san rafael",
        "santa maria la ribera", "doctores", "escandon", "tlalpan",
        "san angel", "xochimilco", "benito juarez", "miguel hidalgo",
        "azcapotzalco", "santa fe", "lomas de chapultepec", "anzures",
        "tabacalera", "obrera", "portales", "san miguel chapultepec",
        "chapultepec", "tacubaya", "mixcoac", "iztapalapa", "coyoacán"),
    "Berlin": (
        "berlin", "kreuzberg", "neukolln", "neukoelln", "friedrichshain",
        "mitte", "prenzlauer berg", "wedding", "schoneberg", "schoeneberg",
        "charlottenburg", "moabit", "lichtenberg", "treptow", "alt-treptow",
        "kopenick", "koepenick", "pankow", "tempelhof", "tiergarten",
        "gesundbrunnen", "rummelsburg", "oberschoneweide", "marzahn",
        "spandau", "steglitz", "wilmersdorf", "reinickendorf", "xberg"),
    "Los Angeles": (
        "los angeles", "la", "l.a.", "hollywood", "west hollywood",
        "east hollywood", "north hollywood", "dtla", "downtown",
        "downtown la", "downtown los angeles", "silver lake", "silverlake",
        "echo park", "venice", "venice beach", "santa monica", "highland park",
        "koreatown", "k-town", "ktown", "chinatown", "arts district",
        "boyle heights", "culver city", "mid-city", "mid city", "los feliz",
        "frogtown", "glassell park", "eagle rock", "atwater village",
        "westlake", "pico-union", "inglewood", "long beach", "pasadena",
        "glendale", "burbank", "malibu", "el sereno", "lincoln heights",
        "cypress park", "mount washington", "leimert park", "hollywood hills",
        "fairfax", "melrose", "beverly hills", "west adams", "compton",
        "san pedro", "marina del rey", "playa del rey", "el segundo",
        "south la", "south central", "studio city", "sherman oaks",
        "van nuys", "topanga", "altadena", "monterey park", "alhambra",
        "santa ana", "anaheim", "orange county", "hawthorne", "gardena",
        "torrance", "whittier", "pomona", "ontario", "riverside",
        "san fernando valley", "the valley", "westwood", "brentwood",
        "sawtelle", "palms", "mar vista", "hermosa beach", "manhattan beach",
        "redondo beach", "huntington beach", "costa mesa", "irvine",
        "north hills", "sun valley", "sylmar", "pacoima", "reseda",
        "canoga park", "woodland hills", "encino", "tarzana", "chatsworth",
        "northridge", "panorama city", "arleta", "tujunga", "sunland",
        "la crescenta", "montrose", "south pasadena", "san gabriel",
        "rosemead", "el monte", "baldwin park", "covina", "west covina",
        "azusa", "glendora", "claremont", "montclair", "upland",
        "rancho cucamonga", "fontana", "san bernardino", "downey", "norwalk",
        "bellflower", "lakewood", "cerritos", "carson", "wilmington",
        "harbor city", "lomita", "palos verdes", "rolling hills"),
    "Bali": (
        "bali", "canggu", "seminyak", "uluwatu", "ubud", "kuta", "legian",
        "denpasar", "jimbaran", "sanur", "nusa dua", "pererenan", "berawa",
        "bingin", "padang padang", "kerobokan", "umalas", "tabanan", "gianyar",
        "nusa penida", "nusa lembongan", "amed", "lovina", "sidemen", "munduk",
        "kedungu", "balangan", "pecatu", "ungasan", "bukit", "seseh", "cemagi",
        "tibubeneng", "batu bolong", "echo beach", "nyanyi", "tanah lot",
        "sayan", "tegallalang", "keramas", "candidasa", "padangbai", "kintamani",
        "bedugul", "singaraja", "benoa", "tanjung benoa", "petitenget",
        "batu belig", "kayu aya", "oberoi", "mengwi", "badung", "klungkung"),
}

# Aliases this short match only the WHOLE normalized string ("la" must not
# match "La Paz"); longer ones may also appear as a whole phrase inside it
# ("Colonia Roma Norte", "Uluwatu, Bali").
_SHORT_ALIAS_LEN = 3


def _normalize_place(value):
    """casefold, strip accents, collapse punctuation to single spaces."""
    text = unicodedata.normalize("NFKD", str(value))
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    text = re.sub(r"[^a-z0-9]+", " ", text.casefold())
    return text.strip()


def served_metro_for(place):
    """The served metro whose known areas the free-text place names, or None."""
    if not place:
        return None
    text = _normalize_place(place)
    if not text:
        return None
    padded = f" {text} "
    for metro, aliases in SERVED_METRO_AREAS.items():
        for alias in aliases:
            norm = _normalize_place(alias)
            if text == norm:
                return metro
            if len(norm) > _SHORT_ALIAS_LEN and f" {norm} " in padded:
                return metro
    return None


def group_slides_by_post(images_for_account):
    """Group an account's scraped images back into posts.

    The batch scraper flattens a post's carousel into separate entries keyed
    "{shortcode}__{idx}" and then labels each one independently — which is why
    a slide listing several events collapses into one, and why one event shown
    across several slides can become several events.

    Grouping prefers the entry's `link`, which process_post sets to the real
    parent post URL. Filename parsing is only the fallback: an Instagram
    shortcode may itself end in "__<digits>" (the alphabet includes digits and
    underscores), and splitting on that would merge two unrelated posts into a
    single vision call.

    Returns {shortcode: [(filename, image_dict, slide_index), ...]} with each
    post's slides in slide order, so the caller can run ONE extraction over the
    whole post the way the manual add-by-URL path does.
    """
    grouped = {}
    for filename, image in (images_for_account or {}).items():
        parsed, slide = split_child_shortcode(filename)
        from_link = shortcode_from_url((image or {}).get('link'))
        shortcode = from_link or parsed
        if not shortcode:
            continue
        grouped.setdefault(shortcode, []).append((filename, image, slide))
    for slides in grouped.values():
        # None (single-image post) sorts before real slide indexes.
        slides.sort(key=lambda entry: (entry[2] is not None, entry[2] or 0))
    return grouped
