"""Owner feedback 2026-09-02 on the duplicates page:

  "events on the duplicate page should be in chronological order"
  "events that have already happened should not be included on the duplicate
   page nor should they be in the system at all"
  "events that aren't events at all should obviously not be making it through"

Measured on production the same day: 1,532 of 1,676 pending pairs (91%) were
pairs where BOTH events had already happened, and 11 rows with is_event=False
were servable by the date feed, including "Remodeling Closure" and three
"9.12 event placeholder" rows.
"""
from datetime import timedelta

import jwt
from django.test import TestCase
from django.utils import timezone

from event.models import Event, EventMatch, Venue
from c_auth.models import User


class DuplicateQueueTests(TestCase):
    def setUp(self):
        u = User.objects.create(email='q@test.dev', usertype='admin')
        self.tok = jwt.encode({'id': u.id}, 'secret', algorithm='HS256')
        self.now = timezone.now()

    def _ev(self, name, days):
        return Event.objects.create(
            name=name, start_date=self.now + timedelta(days=days),
            is_event=True, is_duplicate=False, suppressed=False)

    def _pair(self, a, b):
        lo, hi = sorted((a, b), key=lambda e: e.id)
        return EventMatch.objects.create(event_a=lo, event_b=hi, score=90.0,
                                         match_type='fuzzy', status='pending')

    def _get(self):
        r = self.client.get('/v1/event/matches/?status=pending&limit=50',
                            HTTP_AUTHORIZATION='Token ' + self.tok)
        return r.json()

    def test_pairs_whose_events_both_passed_are_not_listed(self):
        self._pair(self._ev('Old A', -10), self._ev('Old B', -10))
        keep = self._pair(self._ev('Upcoming A', 5), self._ev('Upcoming B', 5))
        body = self._get()
        ids = [m['match_id'] for m in body['matches']]
        self.assertEqual(ids, [keep.id])
        self.assertEqual(body['pending_total'], 1,
                         'the header count must match the list under it')

    def test_a_pair_with_one_upcoming_side_is_kept(self):
        # only one side needs to still matter
        m = self._pair(self._ev('Old', -10), self._ev('Soon', 3))
        self.assertIn(m.id, [x['match_id'] for x in self._get()['matches']])

    def test_undated_pairs_are_kept(self):
        # undated rows never "pass"; they are exactly what needs reviewing
        a = Event.objects.create(name='Undated A', is_event=True,
                                 is_duplicate=False, suppressed=False)
        b = Event.objects.create(name='Undated B', is_event=True,
                                 is_duplicate=False, suppressed=False)
        m = self._pair(a, b)
        self.assertIn(m.id, [x['match_id'] for x in self._get()['matches']])

    def test_pairs_are_listed_in_chronological_order(self):
        far = self._pair(self._ev('Far A', 30), self._ev('Far B', 30))
        soon = self._pair(self._ev('Soon A', 2), self._ev('Soon B', 2))
        mid = self._pair(self._ev('Mid A', 10), self._ev('Mid B', 10))
        ids = [m['match_id'] for m in self._get()['matches']]
        self.assertEqual(ids, [soon.id, mid.id, far.id])


class FeedExcludesNonEventsTests(TestCase):
    """The city pages call event/date/ and event/date/range/. Both filtered
    is_duplicate only, so rows the extractor had already classified as
    not-an-event were served to the public."""

    def setUp(self):
        # __date filters convert to the project timezone (America/Los_Angeles),
        # so the date string has to be derived in LOCAL time or the lookup
        # lands a day off. Midday local avoids the boundary entirely.
        local = timezone.localtime(timezone.now()) + timedelta(days=3)
        self.day = local.replace(hour=12, minute=0, second=0, microsecond=0)
        self.date_str = self.day.strftime('%Y-%m-%d')

    def _ev(self, name, **kw):
        base = dict(name=name, start_date=self.day, is_duplicate=False,
                    suppressed=False, is_event=True,
                    venue=Venue.objects.create(address='somewhere'))
        base.update(kw)
        return Event.objects.create(**base)

    def _names(self, data):
        return {e['name'] for e in (data.get('data') or [])}

    def test_date_feed_hides_known_non_events(self):
        self._ev('Real Party')
        self._ev('9.12 event placeholder', is_event=False)
        body = self.client.get(f'/v1/event/date/?date={self.date_str}').json()
        self.assertIn('Real Party', self._names(body))
        self.assertNotIn('9.12 event placeholder', self._names(body))

    def test_date_feed_keeps_unclassified_rows(self):
        # is_event NULL means never classified, not "not an event" - the same
        # rule search_events uses, so these stay findable
        self._ev('Unclassified', is_event=None)
        body = self.client.get(f'/v1/event/date/?date={self.date_str}').json()
        self.assertIn('Unclassified', self._names(body))

    def test_date_feed_hides_suppressed_duplicates(self):
        keeper = self._ev('Kept')
        self._ev('Hidden Copy', suppressed=True, canonical=keeper)
        body = self.client.get(f'/v1/event/date/?date={self.date_str}').json()
        self.assertNotIn('Hidden Copy', self._names(body))

    def test_range_feed_applies_the_same_rules(self):
        self._ev('Real In Range')
        self._ev('Placeholder In Range', is_event=False)
        start = (self.day - timedelta(days=1)).strftime('%Y-%m-%d')
        end = (self.day + timedelta(days=1)).strftime('%Y-%m-%d')
        body = self.client.get(
            f'/v1/event/date/range/?start={start}&end={end}').json()
        self.assertIn('Real In Range', self._names(body))
        self.assertNotIn('Placeholder In Range', self._names(body))
