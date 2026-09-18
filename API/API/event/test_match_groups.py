"""The review page shows GROUPS, not pairs.

Owner, 2026-09-14 and 2026-09-18: "Seeing a ton of events over and over
again in the duplicate section, they should all be grouped together if they
have any similarity especially image, or similar title, or similar date and
location"; "in a case like this the admin should be able to keep all"; "when
you get to the bottom of the page it should load more events".

Measured 2026-09-18: 137 pending pairs connected into 76 groups, 21 of them
with 3 to 6 events, so one event was judged up to five times. And the weekly
expansion repeated the same group for every week of a recurring party (the
Essex Club Thursday, five accounts, judged once per week for ten weeks).

Rules pinned here:
* a group is every pending pair on one local day connected through shared
  events, plus events on that day carrying the identical flyer image;
* the same image on a different day does NOT join (that is the series);
* groups list soonest first and page with offset;
* keep one / keep all / delete all act on the whole group at once;
* a verdict on one date carries to the other dates of the same posts.
"""
from datetime import datetime, time, timedelta

import jwt
from django.test import TestCase
from django.utils import timezone

from c_auth.models import User
from .models import BlacklistedLink, Event, EventMatch, Venue


class GroupFixtureMixin:
    def setUp(self):
        u = User.objects.create(email='g@test.dev', usertype='admin')
        self.tok = jwt.encode({'id': u.id}, 'secret', algorithm='HS256')
        self.day = timezone.localdate() + timedelta(days=3)
        self.next_week = self.day + timedelta(days=7)

    def _ev(self, name, day=None, post=None, thumb=None, **kw):
        day = day or self.day
        post = post or ('P' + name.replace(' ', ''))
        base = dict(name=name, start_date=timezone.make_aware(datetime.combine(day, time(21, 0))),
                    shortcode=post, orig_link='https://www.instagram.com/p/%s/' % post,
                    orig_thumb=thumb or ('https://img/%s.jpg' % post),
                    is_event=True, is_duplicate=False, suppressed=False,
                    venue=Venue.objects.create(address='x'))
        base.update(kw)
        return Event.objects.create(**base)

    def _pair(self, a, b, score=90.0, match_type='fuzzy'):
        lo, hi = sorted((a, b), key=lambda e: e.id)
        return EventMatch.objects.create(event_a=lo, event_b=hi, score=score,
                                         match_type=match_type, status='pending')

    def _groups(self, **params):
        res = self.client.get('/v1/event/matches/groups/', params,
                              HTTP_AUTHORIZATION='Token ' + self.tok)
        self.assertEqual(res.status_code, 200, res.content[:300])
        return res.json()   # Success(dict) answers with the dict itself, like the pairs view

    def _resolve_group(self, match_ids, action, keep_id=None):
        body = {'match_ids': match_ids, 'action': action}
        if keep_id is not None:
            body['keep_id'] = keep_id
        return self.client.post('/v1/event/matches/groups/resolve/', body,
                                content_type='application/json',
                                HTTP_AUTHORIZATION='Token ' + self.tok)

    def _resolve_pair(self, match, action):
        return self.client.post('/v1/event/matches/resolve/',
                                {'match_id': match.id, 'action': action},
                                content_type='application/json',
                                HTTP_AUTHORIZATION='Token ' + self.tok)


class GroupingTests(GroupFixtureMixin, TestCase):
    def test_pairs_sharing_an_event_form_one_group(self):
        a, b, c = self._ev('Kinshasa Vibes'), self._ev('Kinshasa Nights'), self._ev('Nights at Kinshasa')
        p1, p2 = self._pair(a, b), self._pair(b, c)
        data = self._groups()
        self.assertEqual(data['total_groups'], 1)
        g = data['groups'][0]
        self.assertEqual({e['id'] for e in g['events']}, {a.id, b.id, c.id})
        self.assertEqual({p['match_id'] for p in g['pairs']}, {p1.id, p2.id})

    def test_the_same_flyer_on_the_same_day_joins_two_pairs(self):
        a = self._ev('Thu Thu', thumb='https://img/same.jpg')
        b = self._ev('Essex Thursday')
        c = self._ev('Long Weekend', thumb='https://img/same.jpg')
        d = self._ev('Thu Thu at Essex')
        self._pair(a, b); self._pair(c, d)
        data = self._groups()
        self.assertEqual(data['total_groups'], 1)
        self.assertEqual({e['id'] for e in data['groups'][0]['events']}, {a.id, b.id, c.id, d.id})

    def test_the_same_flyer_on_another_day_does_not_join(self):
        # That is the series, handled elsewhere; two Thursdays are two groups.
        a = self._ev('Thu Thu', thumb='https://img/same.jpg')
        b = self._ev('Essex Thursday')
        c = self._ev('Thu Thu', day=self.next_week, post='PThuThu2', thumb='https://img/same.jpg')
        d = self._ev('Essex Thursday', day=self.next_week, post='PEssex2')
        self._pair(a, b); self._pair(c, d)
        self.assertEqual(self._groups()['total_groups'], 2)

    def test_groups_list_soonest_first_and_page_by_offset(self):
        a, b = self._ev('later A', day=self.next_week), self._ev('later B', day=self.next_week)
        c, d = self._ev('soon C'), self._ev('soon D')
        self._pair(a, b); self._pair(c, d)
        first = self._groups(limit=1, offset=0)
        second = self._groups(limit=1, offset=1)
        self.assertEqual(first['total_groups'], 2)
        self.assertEqual({e['name'] for e in first['groups'][0]['events']}, {'soon C', 'soon D'})
        self.assertEqual({e['name'] for e in second['groups'][0]['events']}, {'later A', 'later B'})

    def test_a_pair_with_a_hidden_or_finished_side_is_left_out(self):
        a, b = self._ev('shown'), self._ev('hidden', suppressed=True)
        self._pair(a, b)
        c = self._ev('old A', day=timezone.localdate() - timedelta(days=5))
        d = self._ev('old B', day=timezone.localdate() - timedelta(days=5))
        self._pair(c, d)
        keep = self._pair(self._ev('live A'), self._ev('live B'))
        data = self._groups()
        self.assertEqual(data['total_groups'], 1)
        self.assertEqual({p['match_id'] for p in data['groups'][0]['pairs']}, {keep.id})


class GroupVerdictTests(GroupFixtureMixin, TestCase):
    def setUp(self):
        super().setUp()
        self.a, self.b, self.c = self._ev('A'), self._ev('B'), self._ev('C')
        self.p1, self.p2 = self._pair(self.a, self.b), self._pair(self.b, self.c)
        self.ids = [self.p1.id, self.p2.id]

    def _fresh(self, e):
        return Event.objects.get(id=e.id)

    def test_keep_one_hides_the_others_and_confirms_every_pair(self):
        r = self._resolve_group(self.ids, 'keep', keep_id=self.c.id)
        self.assertEqual(r.status_code, 200)
        self.assertFalse(self._fresh(self.c).suppressed)
        for loser in (self.a, self.b):
            fresh = self._fresh(loser)
            self.assertTrue(fresh.suppressed and fresh.is_duplicate)
            self.assertEqual(fresh.canonical_id, self.c.id)
        self.assertEqual(set(EventMatch.objects.filter(id__in=self.ids)
                             .values_list('status', flat=True)), {'confirmed'})

    def test_keep_all_rejects_every_pair_and_hides_nothing(self):
        r = self._resolve_group(self.ids, 'keep_all')
        self.assertEqual(r.status_code, 200)
        self.assertEqual(Event.objects.filter(suppressed=True).count(), 0)
        self.assertEqual(set(EventMatch.objects.filter(id__in=self.ids)
                             .values_list('status', flat=True)), {'rejected'})

    def test_delete_all_removes_the_events_and_blacklists_their_posts(self):
        r = self._resolve_group(self.ids, 'delete_all')
        self.assertEqual(r.status_code, 200)
        self.assertFalse(Event.objects.filter(id__in=[self.a.id, self.b.id, self.c.id]).exists())
        self.assertEqual(BlacklistedLink.objects.count(), 3)
        self.assertFalse(EventMatch.objects.filter(id__in=self.ids).exists())

    def test_keep_needs_a_member_of_the_group(self):
        stranger = self._ev('stranger')
        r = self._resolve_group(self.ids, 'keep', keep_id=stranger.id)
        self.assertEqual(r.status_code, 400)
        self.assertEqual(Event.objects.filter(suppressed=True).count(), 0)

    def test_an_already_decided_pair_is_not_redone(self):
        self.p2.status = 'rejected'; self.p2.save()
        self._resolve_group(self.ids, 'keep', keep_id=self.a.id)
        self.assertEqual(EventMatch.objects.get(id=self.p2.id).status, 'rejected')


class SeriesVerdictPropagationTests(GroupFixtureMixin, TestCase):
    """The Essex Club Thursday: five accounts, one party, expanded weekly.
    Judging it once must cover every week."""

    def setUp(self):
        super().setUp()
        self.a1 = self._ev('Thu Thu', post='PA')
        self.b1 = self._ev('Essex Thursday', post='PB')
        self.a2 = self._ev('Thu Thu', day=self.next_week, post='PA')
        self.b2 = self._ev('Essex Thursday', day=self.next_week, post='PB')
        self.this_week = self._pair(self.a1, self.b1)
        self.next_pair = self._pair(self.a2, self.b2)

    def test_keeping_one_side_carries_to_next_week(self):
        self._resolve_pair(self.this_week, 'keep_a' if self.this_week.event_a_id == self.a1.id else 'keep_b')
        nxt = EventMatch.objects.get(id=self.next_pair.id)
        self.assertEqual(nxt.status, 'confirmed')
        self.assertTrue(Event.objects.get(id=self.b2.id).suppressed)
        self.assertFalse(Event.objects.get(id=self.a2.id).suppressed)
        self.assertEqual(Event.objects.get(id=self.b2.id).canonical_id, self.a2.id)

    def test_not_duplicates_carries_to_next_week(self):
        self._resolve_pair(self.this_week, 'not_duplicate')
        self.assertEqual(EventMatch.objects.get(id=self.next_pair.id).status, 'rejected')
        self.assertEqual(Event.objects.filter(suppressed=True).count(), 0)

    def test_a_group_verdict_carries_too(self):
        self._resolve_group([self.this_week.id], 'keep', keep_id=self.b1.id)
        self.assertTrue(Event.objects.get(id=self.a2.id).suppressed)
        self.assertEqual(Event.objects.get(id=self.a2.id).canonical_id, self.b2.id)

    def test_an_unrelated_pair_next_week_is_untouched(self):
        c2 = self._ev('Other Party', day=self.next_week, post='PC')
        other = self._pair(self.a2, c2)
        self._resolve_pair(self.this_week, 'not_duplicate')
        self.assertEqual(EventMatch.objects.get(id=other.id).status, 'pending')

    def test_deleting_does_not_carry(self):
        # Deletion is irreversible; other dates stay for the owner to judge
        # (or to delete as a series from the events page).
        self._resolve_pair(self.this_week, 'delete_both')
        self.assertTrue(Event.objects.filter(id__in=[self.a2.id, self.b2.id]).count() == 2)
        self.assertEqual(EventMatch.objects.get(id=self.next_pair.id).status, 'pending')


class SameSeriesPairTests(GroupFixtureMixin, TestCase):
    """Both sides of a pair can belong to ONE series: two rows of one post
    with one title (a same-post pair). Carrying a verdict "to the other dates
    of the same two posts" has nothing to carry there, and a naive key lookup
    maps both sides to one event, which would hide that event behind itself.
    """

    def setUp(self):
        super().setUp()
        self.a = self._ev('Klubnacht', post='PSAME')
        self.b = self._ev('Klubnacht', post='PSAME')
        self.c = self._ev('Klubnacht', post='PSAME')
        self.ab = self._pair(self.a, self.b, score=0.0, match_type='exact_link')
        self.ac = self._pair(self.a, self.c, score=0.0, match_type='exact_link')

    def test_keeping_one_never_hides_an_event_behind_itself(self):
        self._resolve_pair(self.ab, 'keep_a' if self.ab.event_a_id == self.a.id else 'keep_b')
        for e in Event.objects.all():
            self.assertNotEqual(e.canonical_id, e.id, f'{e.id} is its own keeper')
        self.assertTrue(Event.objects.get(id=self.b.id).suppressed)
        self.assertFalse(Event.objects.get(id=self.c.id).suppressed)
        self.assertEqual(EventMatch.objects.get(id=self.ac.id).status, 'pending')

    def test_not_duplicates_does_not_spread_inside_one_post(self):
        self._resolve_pair(self.ab, 'not_duplicate')
        self.assertEqual(EventMatch.objects.get(id=self.ac.id).status, 'pending')

    def test_the_nightly_lookup_ignores_a_same_series_pair(self):
        from event.verdicts import decided_sibling_verdict
        self.ab.status = 'rejected'; self.ab.reviewed_at = timezone.now(); self.ab.save()
        self.assertIsNone(decided_sibling_verdict(self.a, self.c))
