"""Which events a visitor should see.

Public feeds hide extras sitting in a pending duplicate group (owner
2026-09-22) without setting suppressed, so the review page still lists
them. Favorites and share-by-id do not use this filter.
"""
from django.db.models import Q
from django.utils import timezone

from event.management.commands.detect_duplicates import completeness
from event.models import Event, EventMatch


def reviewable_matches(today):
    """Pairs worth a human decision: neither side hidden (suppressed, the
    older is_duplicate flag, or classified not-an-event; NULL is unclassified
    and stays), and at least one side still upcoming or undated. Shared by
    the pair and the group views so their counts can never disagree."""
    still_relevant = (Q(event_a__start_date__date__gte=today)
                      | Q(event_b__start_date__date__gte=today)
                      | Q(event_a__start_date__isnull=True)
                      | Q(event_b__start_date__isnull=True))
    return (EventMatch.objects
            .exclude(event_a__suppressed=True)
            .exclude(event_b__suppressed=True)
            .exclude(event_a__is_duplicate=True)
            .exclude(event_b__is_duplicate=True)
            .exclude(event_a__is_event=False)
            .exclude(event_b__is_event=False)
            .filter(still_relevant))


def _local_day(event):
    return timezone.localtime(event.start_date).date() if event.start_date else None


def pending_duplicate_loser_ids():
    """Ids in a pending review group that are not the provisional keeper.

    Same graph as get_event_match_groups: pending pairs on one local day
    connected through shared events, plus the same flyer on that day.
    Keeper = completeness, then oldest id — the auto-merge sort.
    """
    today = timezone.localdate()
    matches = list(reviewable_matches(today).filter(status='pending')
                   .select_related('event_a', 'event_b'))
    if not matches:
        return set()

    parent = {}

    def find(x):
        parent.setdefault(x, x)
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    def union(a, b):
        parent[find(a)] = find(b)

    events = {}
    for m in matches:
        events[m.event_a_id] = m.event_a
        events[m.event_b_id] = m.event_b
        union(m.event_a_id, m.event_b_id)

    by_flyer = {}
    for e in events.values():
        if e.orig_thumb and e.start_date:
            by_flyer.setdefault((e.orig_thumb, _local_day(e)), []).append(e.id)
    for ids in by_flyer.values():
        for other in ids[1:]:
            union(ids[0], other)

    groups = {}
    for eid in events:
        groups.setdefault(find(eid), set()).add(eid)

    losers = set()
    for members in groups.values():
        if len(members) < 2:
            continue
        rows = [events[i] for i in members]
        rows.sort(key=lambda e: (completeness(e), -e.id), reverse=True)
        losers.update(e.id for e in rows[1:])
    return losers


def hide_pending_duplicate_extras(qs):
    """Drop provisional losers from a public queryset. No-op when none."""
    losers = pending_duplicate_loser_ids()
    return qs.exclude(id__in=losers) if losers else qs
