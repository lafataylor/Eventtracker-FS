"""Pending duplicate extras stay off the city pages until a verdict.

Owner 2026-09-22: cards already in the review queue were still on the public
feed. Hide the extras, keep one provisional card (the more complete row, same
rule as a merge). Do not set suppressed — the duplicates page drops any pair
where a side is suppressed. Favorites and share links keep the id they saved,
even if that row is the extra.
"""
from datetime import datetime, time, timedelta

import jwt
from django.test import TestCase
from django.utils import timezone

from c_auth.models import User
from event.models import Event, EventMatch, Venue
from event.management.commands.detect_duplicates import completeness


class PendingHideTests(TestCase):
    def setUp(self):
        u = User.objects.create(email='hide@test.dev', usertype='admin')
        self.tok = jwt.encode({'id': u.id}, 'secret', algorithm='HS256')
        self.day = timezone.localdate() + timedelta(days=4)
        self.email = 'fan@test.dev'

    def _ev(self, name, post, artist=None, **kw):
        when = timezone.make_aware(datetime.combine(self.day, time(21, 0)))
        base = dict(
            name=name, shortcode=post, start_date=when, start_time='09:00 PM',
            orig_link='https://www.instagram.com/p/%s/' % post,
            orig_thumb='https://img/%s.jpg' % post,
            is_event=True, is_duplicate=False, suppressed=False,
            timestamp=timezone.now(),
            artist=artist,
            venue=Venue.objects.create(name=post, address='x'))
        base.update(kw)
        return Event.objects.create(**base)

    def _pair(self, a, b):
        lo, hi = sorted((a, b), key=lambda e: e.id)
        return EventMatch.objects.create(
            event_a=lo, event_b=hi, score=85, match_type='fuzzy',
            status='pending')

    def _fmt(self):
        return self.day.strftime('%Y-%m-%d')

    def _date_ids(self):
        res = self.client.get('/v1/event/date/', {'date': self._fmt()})
        self.assertEqual(res.status_code, 200, res.content[:300])
        rows = res.json().get('data') or []
        return [r['id'] for r in rows]

    def _groups(self):
        res = self.client.get('/v1/event/matches/groups/',
                              HTTP_AUTHORIZATION='Token ' + self.tok)
        self.assertEqual(res.status_code, 200, res.content[:300])
        return res.json()

    def test_the_date_feed_shows_only_the_more_complete_card_of_a_pending_group(self):
        thin = self._ev('Workshop', 'THIN')
        full = self._ev('Workshop', 'FULL', artist='A Painter')
        self._pair(thin, full)
        self.assertGreater(completeness(full), completeness(thin))
        self.assertEqual(self._date_ids(), [full.id])

    def test_the_duplicates_page_still_lists_every_member(self):
        a = self._ev('Alpha Night', 'A')
        b = self._ev('Beta Party', 'B', artist='DJ B')
        self._pair(a, b)
        data = self._groups()
        self.assertEqual(data['total_groups'], 1)
        self.assertEqual({e['id'] for e in data['groups'][0]['events']}, {a.id, b.id})

    def test_share_and_favorites_still_return_the_hidden_extra(self):
        thin = self._ev('Workshop', 'THIN')
        full = self._ev('Workshop', 'FULL', artist='A Painter')
        self._pair(thin, full)
        res = self.client.get('/v1/event/', {'id': str(thin.id)})
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()['id'], thin.id)

        self.client.post('/v1/event/favorites/add/',
                         {'email': self.email, 'event_ids': [thin.id]},
                         content_type='application/json')
        fav = self.client.get('/v1/event/favorites/', {'email': self.email})
        self.assertEqual(fav.status_code, 200)
        ids = [e['id'] for e in fav.json()['favorites']]
        self.assertIn(thin.id, ids)

    def test_keep_all_puts_both_cards_back_on_the_date_feed(self):
        a = self._ev('Happy Hour', 'BAR1')
        b = self._ev('Happy Hour', 'BAR2', artist='House Band')
        match = self._pair(a, b)
        self.assertEqual(len(self._date_ids()), 1)
        res = self.client.post(
            '/v1/event/matches/groups/resolve/',
            {'match_ids': [match.id], 'action': 'keep_all'},
            content_type='application/json',
            HTTP_AUTHORIZATION='Token ' + self.tok)
        self.assertEqual(res.status_code, 200, res.content[:300])
        self.assertEqual(set(self._date_ids()), {a.id, b.id})

    def test_keeping_one_leaves_the_loser_off_the_date_feed(self):
        thin = self._ev('Workshop', 'THIN')
        full = self._ev('Workshop', 'FULL', artist='A Painter')
        match = self._pair(thin, full)
        res = self.client.post(
            '/v1/event/matches/groups/resolve/',
            {'match_ids': [match.id], 'action': 'keep', 'keep_id': thin.id},
            content_type='application/json',
            HTTP_AUTHORIZATION='Token ' + self.tok)
        self.assertEqual(res.status_code, 200, res.content[:300])
        self.assertEqual(self._date_ids(), [thin.id])
        full.refresh_from_db()
        self.assertTrue(full.suppressed)

    def test_search_and_range_also_hide_the_extra(self):
        thin = self._ev('Piñata Pop', 'THIN')
        full = self._ev('Piñata Pop', 'FULL', artist='Vol 5')
        self._pair(thin, full)
        day = self._fmt()
        search = self.client.get('/v1/event/search/', {'query': 'Pop'})
        self.assertEqual([r['id'] for r in search.json().get('data') or []],
                         [full.id])
        rng = self.client.get('/v1/event/date/range/',
                              {'start': day, 'end': day})
        self.assertEqual([r['id'] for r in rng.json().get('data') or []],
                         [full.id])
        filt = self.client.post(
            '/v1/event/filter/',
            {'filters': [{'type': 'date', 'condition': 'between',
                          'values': [self.day.strftime('%m/%d/%Y'),
                                     self.day.strftime('%m/%d/%Y')]}]},
            content_type='application/json')
        self.assertEqual([r['id'] for r in filt.json().get('data') or []],
                         [full.id])

    def test_the_admin_event_list_still_shows_both(self):
        a = self._ev('Alpha Night', 'A')
        b = self._ev('Beta Party', 'B', artist='DJ B')
        self._pair(a, b)
        res = self.client.get('/v1/admin/event/',
                              HTTP_AUTHORIZATION='Token ' + self.tok)
        self.assertEqual(res.status_code, 200)
        ids = {r['id'] for r in res.json().get('data') or []}
        self.assertEqual(ids, {a.id, b.id})
