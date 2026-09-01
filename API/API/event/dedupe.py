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

import re

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

# For pairs with no title on at least one side (see score_pair): how alike two
# venue strings must be to count as one place, how alike their venue NAMES must
# be, and the score such a pair gets.
#
# The score deliberately sits BELOW the auto-merge bar (95) so anchored pairs
# are QUEUED for review rather than hidden unattended. Review of the first
# version (2026-09-01) measured it on production: of 453 pairs the anchor
# found, 183 (40%) were rows sharing one account, date and address with
# SEVERAL mutually different titled events — e.g. Zinco Jazz Club at
# Motolinía 20 ran six distinct concerts on 2025-02-01 and one untitled row
# anchored equally to all six. Which one it would have merged into was
# decided by id order. An untitled row is exactly the row we know least
# about, so it earns a human glance, not an automatic hide.
VENUE_ANCHOR_SIM = 80.0
VENUE_ANCHOR_NAME_SIM = 75.0
VENUE_ANCHOR_SCORE = 90.0


def street_numbers(venue_text_value):
    """Plausible street numbers in a venue string: 'tonala 308 roma sur' -> {'308'}.

    Similarity ALONE cannot identify a venue, measured 2026-09-01:
      'tonala 308, roma sur, mexico' vs 'tonala 250, roma sur, mexico' -> 92.9
      'tonala 308 eoma sur'          vs 'tonala 308, roma sur, mexico' -> 80.9
    so two different buildings on one street score HIGHER than one building
    spelled two ways, and a pair of rows whose address degraded to just
    'berlin, germany' scores a perfect 100. The street number is the token
    that actually identifies the place.

    Not every digit run IS a street number, though, and each wrong one is a
    way for two unrelated venues to look identical: Berlin postcodes (10245,
    10439) sit in most German addresses, and a year in a venue's NAME
    ('Studio 2026', 'Bar 1984') collides with any address carrying the same
    digits. So 5+ digit runs and year-shaped tokens are dropped, and leading
    zeros normalised so '08' and '8' are one number.

    Callers compare by INTERSECTION, not equality: one side keeping a postcode
    ('Alt-Stralau 70, 10245 Berlin' vs 'Alt-Stralau 70, Berlin') must not
    block a true match. Venues whose address carries no number never anchor at
    all — that misses some duplicates, which is the safe direction: a false
    'distinct' costs a review, a false 'redundant' hides a real event.
    """
    out = set()
    for token in re.findall(r'\d+', venue_text_value or ''):
        if len(token) >= 5:                      # postcode / phone fragment
            continue
        if re.fullmatch(r'(19|20)\d\d', token):  # a year, not a house number
            continue
        out.add(token.lstrip('0') or '0')
    return out


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
        # Which Instagram account posted it. Only used by the nameless-pair
        # anchor in score_pair, where "the same account said it twice" is the
        # evidence a missing title cannot provide.
        'poster': event.poster_id,
        # The venue's NAME on its own, not fused into `venue` with the address
        # and city. One address can hold several venues — production has
        # 'Departamento' and 'PB' at Álvaro Obregón 154, and 'ESSEX CLUB' and
        # 'NightClub' at Londres 195 — and once the shared address is folded
        # into one string it drags the whole comparison over any threshold.
        'venue_name': normalize_text(event.venue.name if event.venue else ''),
    }


def venue_anchor_applies(a, b):
    """True when an untitled pair may be treated as one event on venue evidence.

    A title is normally the only thing strong enough to assert "same event",
    but one account re-promoting one event across several posts is the
    commonest duplicate that gate misses — measured on production 2026-09-01,
    39 of the 129 redundant visible rows, including the owner's four-card
    bazaar screenshot (four posts, one Tonalá 308 bazaar, every row untitled).

    So anchor on an identity that needs no title: the SAME posting account,
    the SAME exact date, a house number shared by both addresses, agreeing
    venue names where both are given, and similar venue text. Deliberately
    stricter than the titled path, which tolerates ±1 day and matches across
    accounts — with no title there is nothing to fall back on if the anchor is
    wrong. Venue spellings drift for one place ("Tonalá 308 Eoma Sur" vs
    "Tonalá 308, Roma Sur, Mexico"), so compare, never equate; and see
    street_numbers() for why a bare digit run is not a house number.

    Lives on its own so score_pair and the detect_duplicates command share ONE
    definition of "anchored" — the command must decide ambiguity by asking
    this, never by comparing a float against VENUE_ANCHOR_SCORE.
    """
    if a['name'] and b['name']:
        return False                     # titled pairs use the fused score
    # When BOTH rows name their venue, that name has to agree. A shared street
    # number means one building, not one venue: 'Departamento' and 'PB' share
    # Álvaro Obregón 154 and are different rooms.
    name_a, name_b = a.get('venue_name'), b.get('venue_name')
    if (name_a and name_b
            and fuzz.token_set_ratio(name_a, name_b) < VENUE_ANCHOR_NAME_SIM):
        return False
    nums_a, nums_b = street_numbers(a['venue']), street_numbers(b['venue'])
    return bool(
        a['poster'] and a['poster'] == b['poster']
        and a['date'] and a['date'] == b['date']
        and nums_a and nums_b and (nums_a & nums_b)
        and fuzz.token_set_ratio(a['venue'], b['venue']) >= VENUE_ANCHOR_SIM)


def score_pair(a, b):
    """Fused 0-100 similarity, or 0 if the pair fails a hard gate.

    Gates:
      - both dates present and more than 1 day apart -> 0 (nightlife ±1 day)
      - titles present but dissimilar                -> 0 (no venue-only matches)
      - a title missing on either side               -> 0, UNLESS
        venue_anchor_applies(); such a pair scores below the auto-merge bar so
        it is QUEUED, and only detect_duplicates may promote an unambiguous
        one to a merge.
    """
    if a['date'] and b['date'] and abs((a['date'] - b['date']).days) > 1:
        return 0.0

    if not (a['name'] and b['name']):
        return VENUE_ANCHOR_SCORE if venue_anchor_applies(a, b) else 0.0
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
    elif (a['name'] or b['name']) and a['date'] and b['date'] \
            and a['date'] != b['date']:
        # Only one side has a name AND the dates differ: plausibly a roundup
        # where extraction named one slide and not the other (72% of rows are
        # nameless). Not enough certainty to auto-hide — queue for review.
        return False
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
