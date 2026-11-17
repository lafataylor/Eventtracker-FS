"""One card per recurring series, in every list.

Ingestion expands a recurring post ("every Tuesday") into one row per date
(c_admin.extraction.expand_recurring): the owner wants a date filter to find
the party on each of its nights. But every LIST then showed the same flyer
once per date. Measured on production 2026-09-14: 1,470 of the 2,274 visible
upcoming cards (65%) were later dates of a series already on the page, and
each night's scrape put its expansions in the admin list twelve rows in a
row. Owner: "I'm seeing tons of the same Instagram posts again and again,
from the same web address"; earlier, "a max of one event with the same title".

The rows stay in the database. A list keeps the EARLIEST occurrence of each
series and drops the rest; a single-day view still shows whichever occurrence
falls on that day, because only that one is in the result to begin with. The
keeper carries series_ids (every occurrence that was in the result, soonest
first) so the admin page can act on the whole series at once.

What counts as one series for verdicts (`series_key`): one post, one title.
An UNTITLED post is one listing per flyer image. That key is also what
carry-keep / carry-reject use so a decision on one night of a titled series
spreads correctly.

What the FEED collapses (`collapse_series`) is wider: rows of one post also
merge when they share an identical `orig_thumb` URL or an identical
`image_dhash`, even if titles differ. Owner 2026-11-17 (Lodge Room / "laundry
room" November calendar): the same magenta calendar thumb under Emma Ruth
Rundle / Train Breaks Down / Malibu… must be one card — differing titles no
longer win over identical artwork. Same-title flyer + lineup slides with
different thumbs still collapse via the title key. Union-find joins any
shared identity on the post so both rules hold at once.

Not in the key, on purpose:

* the date - that is the whole point;
* artist, host, start time, venue text, price - they vary per night of a
  series or drift between two extractions, and would split one listing
  into many; a real second event on one post has its own title AND its own
  flyer (different thumb / hash).

A nameless row with no flyer image and no hash is its own listing: there is
nothing to group it by, and hiding it behind another row would be a guess.

Cross-post repeats are the dedupe's job, with its own evidence rules: a title
alone must never collapse two posts.
"""


def _norm(value):
    return (value or '').strip().lower()


def series_key(event):
    """Primary identity for verdicts / carry (one post, one title or flyer).

    Feed collapse uses a wider union — see `_identity_keys` / collapse_series
    — so identical thumbs override title splits without changing how a keep
    or reject travels across nights of a titled series.
    """
    post = event.shortcode or event.orig_link or ('id', event.id)
    name = _norm(event.name)
    if name:
        return (post, 'title', name)
    return (post, 'flyer', event.orig_thumb or ('id', event.id))


def _identity_keys(event):
    """Every way this row can join a feed series on its post.

    Title keeps flyer+lineup slides of one named event together. Thumb and
    dhash collapse Lodge Room-style roundups where extraction named each
    artist but reused one calendar image.
    """
    post = event.shortcode or event.orig_link or ('id', event.id)
    keys = []
    name = _norm(event.name)
    thumb = (event.orig_thumb or '').strip()
    dhash = (getattr(event, 'image_dhash', None) or '').strip().lower()
    if name:
        keys.append((post, 'title', name))
    if thumb:
        keys.append((post, 'thumb', thumb))
    if len(dhash) == 16:
        keys.append((post, 'dhash', dhash))
    if not keys:
        keys.append((post, 'solo', event.id))
    return keys


def _starts_before(a, b):
    if a.start_date is None:
        return False
    return b.start_date is None or a.start_date < b.start_date


def _soonest_first(event):
    # Undated rows last; ties (there should be none) fall back to id.
    return (event.start_date is None,
            event.start_date.timestamp() if event.start_date else 0.0,
            event.id)


def collapse_series(events):
    """Keep one row per series - the earliest by start_date - in input order.

    Every returned row gets `series_ids`: the ids of all its occurrences in
    the input, soonest first, itself included; [id] for a row outside any
    series. The keeper takes the slot where its series first appeared, so a
    feed's own ordering survives.

    Rows of one post that share a title, an identical orig_thumb, or an
    identical image_dhash are one series (union-find), so a roundup calendar
    with many artist titles under one thumb becomes one card.
    """
    events = list(events)
    n = len(events)
    parent = list(range(n))

    def find(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    def union(i, j):
        ri, rj = find(i), find(j)
        if ri != rj:
            parent[rj] = ri

    key_first = {}
    for i, event in enumerate(events):
        for key in _identity_keys(event):
            if key in key_first:
                union(i, key_first[key])
            else:
                key_first[key] = i

    keepers = {}      # root -> keeper row
    members = {}      # root -> every row of the component
    order = []        # roots in first-seen order
    for i, event in enumerate(events):
        root = find(i)
        if root not in keepers:
            keepers[root] = event
            members[root] = []
            order.append(root)
        elif _starts_before(event, keepers[root]):
            keepers[root] = event
        members[root].append(event)

    result = []
    for root in order:
        keeper = keepers[root]
        keeper.series_ids = [e.id for e in sorted(members[root], key=_soonest_first)]
        result.append(keeper)
    return result
