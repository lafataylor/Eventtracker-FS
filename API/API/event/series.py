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

What counts as one series: one post, one title. A titled post that lists
"Sunset Music Sessions" on twelve dates with a different guest each week is
one listing (owner: "a max of one event with the same title"). An UNTITLED
post is one listing per flyer image: the owner's "Familiar Feelings" case was
five nameless rows of one flyer on five dates, and he deleted them by hand.
Two rows of one post with different titles are different events (a roundup)
and are all kept. Not in the key, on purpose:

* the date - that is the whole point;
* the carousel slide for titled rows - a flyer slide and a lineup slide of
  one post can each yield the event, and the list must not show it twice
  while the nightly exact pass catches up;
* artist, host, start time, venue text, price - they vary per night of a
  series or drift between two extractions, and would split one listing
  into many; a real second event on one post has its own title or its own
  flyer.

A nameless row with no flyer image is its own listing: there is nothing to
group it by, and hiding it behind another row would be a guess.

Cross-post repeats are the dedupe's job, with its own evidence rules: a title
alone must never collapse two posts.
"""


def _norm(value):
    return (value or '').strip().lower()


def series_key(event):
    """Identity of the series a row belongs to; a row with no post is its own."""
    post = event.shortcode or event.orig_link or ('id', event.id)
    name = _norm(event.name)
    if name:
        return (post, 'title', name)
    return (post, 'flyer', event.orig_thumb or ('id', event.id))


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
    """
    keepers = {}      # series key -> keeper row
    members = {}      # series key -> every row of the series seen
    order = []        # keys in first-seen order
    for event in events:
        key = series_key(event)
        if key not in keepers:
            keepers[key] = event
            members[key] = []
            order.append(key)
        elif _starts_before(event, keepers[key]):
            keepers[key] = event
        members[key].append(event)

    result = []
    for key in order:
        keeper = keepers[key]
        keeper.series_ids = [e.id for e in sorted(members[key], key=_soonest_first)]
        result.append(keeper)
    return result
