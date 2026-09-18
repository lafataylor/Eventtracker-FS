"""The two verdicts a human (or a decided sibling) can give a pair, in one
place, so the review page, the group view and the nightly pass agree.
"""
from django.db.models import Q
from django.utils import timezone

from .models import Event, EventMatch
from .series import series_key


def keep_over(keep, drop):
    """The owner keeps `keep`; `drop` hides behind it (recoverable)."""
    keep.suppressed = False
    keep.canonical = None
    keep.is_duplicate = False
    keep.duplicate_link = None
    keep.save(update_fields=['suppressed', 'canonical', 'is_duplicate', 'duplicate_link'])
    drop.suppressed = True
    drop.canonical = keep
    drop.is_duplicate = True
    drop.duplicate_link = keep.orig_link or f"event_{keep.id}"
    drop.save(update_fields=['suppressed', 'canonical', 'is_duplicate', 'duplicate_link'])
    # The dropped row may itself be the keeper of earlier duplicates. They
    # follow it to the new keeper, or they would sit hidden behind a hidden
    # row and "Previously flagged" would name a suppressed event as the one
    # kept instead (the same rule the nightly auto-merge applies).
    (Event.objects.filter(canonical=drop).exclude(id=keep.id)
     .update(canonical=keep, duplicate_link=keep.orig_link or f"event_{keep.id}"))


def propagate_series_verdict(keep, drop, verdict):
    """Carry one verdict to the other dates of the same two posts.

    The Essex Club Thursday (five accounts, one party, expanded weekly) was
    queued once per week: the owner judged the same pair ten times. A pending
    pair whose sides are later occurrences of the same two series gets the
    same verdict: 'keep' hides the occurrence matching `drop` behind the one
    matching `keep`; 'reject' marks it not a duplicate. Deletion never
    carries: it is irreversible, and the series delete on the events page is
    the deliberate way to do that.
    """
    keep_key, drop_key = series_key(keep), series_key(drop)
    # Both sides in ONE series (two rows of one post with one title, a
    # same-post pair): there are no "other dates of the same two posts" to
    # carry to, and keying both sides identically would map them to a single
    # event and hide it behind itself. Caught in self-review before deploy.
    if keep_key == drop_key:
        return 0
    posts = [x for x in (keep.shortcode, drop.shortcode) if x]
    if len(posts) < 2:
        return 0
    siblings = (EventMatch.objects.filter(status='pending')
                .filter(event_a__shortcode__in=posts, event_b__shortcode__in=posts)
                .select_related('event_a', 'event_b'))
    done = 0
    for m in siblings:
        pair = {series_key(m.event_a): m.event_a, series_key(m.event_b): m.event_b}
        if len(pair) != 2 or set(pair) != {keep_key, drop_key}:
            continue
        if verdict == 'keep':
            if pair[keep_key].suppressed:
                continue        # the owner hid that occurrence; never un-hide it
            keep_over(pair[keep_key], pair[drop_key])
            m.status = 'confirmed'
        else:
            m.status = 'rejected'
        m.reviewed_at = timezone.now()
        m.save(update_fields=['status', 'reviewed_at'])
        done += 1
    return done




def decided_sibling_verdict(a, b):
    """What the owner already decided for these two posts on another date.

    Returns ('keep', keeper, loser) or ('reject', None, None) or None. Used by
    the nightly pass before queuing a new occurrence pair: the Essex Club
    Thursday came back as a fresh pending pair every week after the owner had
    judged it. reviewed_at set means a human clicked; machine merges (NULL)
    are not copied, so one auto-merge cannot silently spread.
    """
    a_key, b_key = series_key(a), series_key(b)
    if a_key == b_key:          # one series on both sides: nothing to inherit
        return None
    posts = [x for x in (a.shortcode, b.shortcode) if x]
    if len(posts) < 2:
        return None
    decided = (EventMatch.objects.filter(status__in=('confirmed', 'rejected'),
                                         reviewed_at__isnull=False)
               .filter(event_a__shortcode__in=posts, event_b__shortcode__in=posts)
               .select_related('event_a', 'event_b').order_by('-reviewed_at'))
    for m in decided:
        pair = {series_key(m.event_a): m.event_a, series_key(m.event_b): m.event_b}
        if len(pair) != 2 or set(pair) != {a_key, b_key}:
            continue
        if m.status == 'rejected':
            return ('reject', None, None)
        # A keeper can be inferred only when exactly ONE side is hidden. Both
        # hidden is the pair between two LOSERS of a group verdict (keep A
        # over {B, C} confirms B-C with both behind A): reading that as "B
        # was kept" would bring a hidden event back as next week's keeper
        # (review of PR #7, reproduced). Neither hidden means the owner
        # restored the loser. Either way, look at the next decided pair.
        if m.event_a.suppressed == m.event_b.suppressed:
            continue
        old_keeper = m.event_b if m.event_a.suppressed else m.event_a
        keeper = a if series_key(old_keeper) == a_key else b
        loser = b if keeper is a else a
        return ('keep', keeper, loser)
    return None


def _local_day(event):
    return timezone.localtime(event.start_date).date() if event.start_date else None


def _series_occurrences(event):
    """Every row of the series `event` belongs to (same post, same series key)."""
    if not event.shortcode:
        return []
    key = series_key(event)
    return [e for e in Event.objects.filter(shortcode=event.shortcode) if series_key(e) == key]


def carry_keep_to_other_dates(keep, losers):
    """The owner kept `keep` over `losers` on one date: do the same on every
    other date the posts share.

    A recurring post is expanded three months ahead at ingestion, so the
    other weeks already exist as rows. For each day the KEEPER's series has a
    visible occurrence, every loser's occurrence on that day hides behind it,
    whether or not a pair links them: in a group {A, B, C} matched A-B and
    B-C, nothing pairs C with A, and carrying only the keeper's own pairs
    left C on the site as a visible duplicate every week (review of PR #7).
    A hidden occurrence of the keeper is never used (and never un-hidden),
    a week the keeper does not play is left alone, and a loser in the
    keeper's own series is skipped. Recoverable like every other merge.
    """
    keep_key = series_key(keep)
    keepers = {}
    for occ in _series_occurrences(keep):
        if (occ.id == keep.id or occ.suppressed or occ.is_duplicate
                or occ.is_event is False or not occ.start_date):
            continue
        keepers.setdefault(_local_day(occ), occ)
    done = 0
    for loser in losers:
        if series_key(loser) == keep_key:
            continue
        for occ in _series_occurrences(loser):
            if occ.id == loser.id or occ.suppressed or not occ.start_date:
                continue
            keeper = keepers.get(_local_day(occ))
            if not keeper or keeper.id == occ.id:
                continue
            keep_over(keeper, occ)
            (EventMatch.objects.filter(status='pending')
             .filter(Q(event_a=keeper, event_b=occ) | Q(event_a=occ, event_b=keeper))
             .update(status='confirmed', reviewed_at=timezone.now()))
            done += 1
    return done
