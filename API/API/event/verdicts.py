"""The two verdicts a human (or a decided sibling) can give a pair, in one
place, so the review page, the group view and the nightly pass agree.
"""
from django.utils import timezone

from .models import EventMatch
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
        old_keeper = m.event_a if m.event_b.suppressed else m.event_b
        keeper = a if series_key(old_keeper) == a_key else b
        loser = b if keeper is a else a
        return ('keep', keeper, loser)
    return None
