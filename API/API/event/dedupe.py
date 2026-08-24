"""Duplicate detection (Ticket 1).

Two kinds of duplicate exist in the data:

1. Exact re-scrapes — many rows sharing one Instagram ``shortcode`` because the
   old ingestion had no upsert. 8,864 such groups, 23,361 surplus rows. These
   are certainly the same post, so they are grouped, not fuzzily compared.

2. Cross-post duplicates — the same real event promoted by different posts
   (different shortcodes), e.g. a venue and a promoter both posting it. These
   need fuzzy matching across title / artist / venue with a ±1 day date gate
   (nightlife events cross midnight), which is what the contract asks for.

Design choices learned from the old, broken ``is_similar``:
- It returned True on ANY single field matching >= 40 (OR logic), so two
  unrelated events at the same venue were "duplicates". Here matching is a
  weighted score with a HARD date gate and a required title signal.
- Accent/'case fold first (the corpus is Spanish/German; "DISFRUTÓN" vs
  "disfruton" must match). rapidfuzz ``token_set_ratio`` handles word reorder.

Perceptual image hashing (pHash) was considered but deferred: the flyer image
URLs are Firebase signed URLs that largely expired in 2025, so hashing the
backlog is not feasible. Text matching fully satisfies the contract; pHash can
be added for freshly-ingested events later.
"""

from rapidfuzz import fuzz

from .ingest import normalize_text

def is_sentinel_date(value):
    """True for the GPT extractor's fallback dates (see the prompt's
    "default to Jan 1" rule). Any Jan 1 counts, not an enumerated year list —
    the old hardcoded {2025-01-01, 2026-01-01} set was already one year behind
    the data once, and 2025-01-01 alone holds 3,319 production rows."""
    return value is not None and value.month == 1 and value.day == 1

# Field weights for the fused score. Title dominates; venue/artist corroborate.
WEIGHTS = {'name': 0.55, 'artist': 0.20, 'venue': 0.25}

# A pair is a fuzzy candidate when the fused score clears this AND the titles
# themselves are similar (guards against venue/artist-only false positives).
FUZZY_THRESHOLD = 82.0
MIN_TITLE_SIM = 70.0


def venue_text(venue):
    if not venue:
        return ''
    return ' '.join(p for p in (venue.name, venue.address, venue.city) if p)


def event_signature(event):
    """Normalised comparison fields for one event (venue must be preloaded)."""
    d = event.start_date.date() if event.start_date else None
    return {
        'id': event.id,
        'name': normalize_text(event.name),
        'artist': normalize_text(event.artist),
        'venue': normalize_text(venue_text(event.venue)),
        'date': d,
    }


def score_pair(a, b):
    """Fused 0-100 similarity, or 0 if the pair fails a hard gate.

    Gates:
      - both dates present and more than 1 day apart -> 0 (nightlife ±1 day)
      - titles present but dissimilar                -> 0 (no venue-only matches)
      - no title on either side                      -> 0 (too weak to assert)
    """
    if a['date'] and b['date'] and abs((a['date'] - b['date']).days) > 1:
        return 0.0

    if not (a['name'] and b['name']):
        return 0.0
    title_sim = fuzz.token_set_ratio(a['name'], b['name'])
    if title_sim < MIN_TITLE_SIM:
        return 0.0

    weighted, total = 0.0, 0.0
    for key in ('name', 'artist', 'venue'):
        if a[key] and b[key]:
            weighted += fuzz.token_set_ratio(a[key], b[key]) * WEIGHTS[key]
            total += WEIGHTS[key]
    return weighted / total if total else 0.0


def same_post_is_redundant(a, b):
    """For two rows that share one Instagram post: is B a re-scrape of A?

    Different question from score_pair, which compares events across posts and
    needs a title to assert anything. Here the shared shortcode already says
    "same post", so the only thing that can make them DISTINCT events is
    positive evidence: two different titles, or two different dates (a roundup
    carousel, or a recurring series). Absent that evidence they are the same
    event scraped twice, which is what 23,355 of the production rows are.

    Deliberately asymmetric: a false "distinct" only sends a pair to review,
    while a false "redundant" hides a real event.
    """
    if a['name'] and b['name']:
        if fuzz.token_set_ratio(a['name'], b['name']) < MIN_TITLE_SIM:
            return False        # two different named events in one post
    if a['date'] and b['date'] and abs((a['date'] - b['date']).days) > 1:
        return False            # same post, different dates -> distinct dates
    return True


def find_fuzzy_pairs(signatures):
    """Yield (id_a, id_b, score) for cross-shortcode fuzzy duplicates.

    Blocks by real date so comparison is bounded: each event is only compared
    against events on the same or the next day. Sentinel-dated and undated
    events are skipped here (no reliable blocking key); exact-shortcode grouping
    already covers their re-scrapes.
    """
    by_date = {}
    for sig in signatures:
        if sig['date'] is None or is_sentinel_date(sig['date']):
            continue
        by_date.setdefault(sig['date'], []).append(sig)

    from datetime import timedelta
    seen_days = sorted(by_date)
    for day in seen_days:
        bucket = by_date[day]
        neighbours = bucket + by_date.get(day + timedelta(days=1), [])
        # Each bucket event pairs with later same-day events and every
        # next-day event; j starting at i+1 over the concatenated list gives
        # exactly that without double-counting. (Ids can never collide: an
        # event lives in exactly one date bucket.)
        for i in range(len(bucket)):
            for j in range(i + 1, len(neighbours)):
                a, b = bucket[i], neighbours[j]
                s = score_pair(a, b)
                if s >= FUZZY_THRESHOLD:
                    lo, hi = sorted((a['id'], b['id']))
                    yield lo, hi, round(s, 1)
