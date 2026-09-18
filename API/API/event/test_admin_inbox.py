"""The admin events list is an inbox of what is coming up, not a dump.

Owner, 2026-09-18: "I'm seeing events from yesterday still showing in the
admin panel... events should automatically stop showing as soon as they
ended", "if something doesn't have a start or end date, it should not make it
through", and "the backend is slower and laggier than I've ever seen it".

Measured that day: the list served 3,235 rows in 8.5 s (3.8 MB) because it
filtered on `timestamp` (49 hours back, so every future row plus two past
days), hid nothing (521 rows already hidden as duplicates, 25 classified
not-an-event, 31 undated), listed every date of a recurring series as its own
row, and ran one query per venue and one per poster. These tests pin the new
definition: upcoming, visible, classified, one card per series, and a bounded
number of queries.
"""
from datetime import datetime, time, timedelta

import jwt
from django.db import connection
from django.test import TestCase
from django.test.utils import CaptureQueriesContext
from django.utils import timezone

from c_auth.models import User
from .models import Event, Venue


class AdminInboxTests(TestCase):
    def setUp(self):
        u = User.objects.create(email='inbox@test.dev', usertype='admin')
        self.tok = jwt.encode({'id': u.id}, 'secret', algorithm='HS256')
        self.today = timezone.localdate()

    def _local(self, day, hour):
        return timezone.make_aware(datetime.combine(day, time(hour, 0)))

    def _ev(self, name, days, **kw):
        day = self.today + timedelta(days=days)
        base = dict(name=name, start_date=self._local(day, 21), start_time='09:00 PM',
                    is_event=True, is_duplicate=False, suppressed=False,
                    timestamp=timezone.now(),
                    shortcode='P%s' % name.replace(' ', ''), 
                    orig_link='https://www.instagram.com/p/P%s/' % name.replace(' ', ''),
                    venue=Venue.objects.create(address='somewhere'))
        base.update(kw)
        if 'start_date' in kw and kw['start_date'] is None:
            base['start_date'] = None
        return Event.objects.create(**base)

    def _list(self):
        res = self.client.get('/v1/admin/event/', HTTP_AUTHORIZATION='Token ' + self.tok)
        self.assertEqual(res.status_code, 200)
        return res.json()['data']

    def _names(self):
        return {r['name'] for r in self._list()}

    def test_yesterdays_event_is_gone_and_todays_is_listed(self):
        self._ev('yesterday', -1)
        self._ev('today', 0)
        self._ev('next week', 7)
        self.assertEqual(self._names(), {'today', 'next week'})

    def test_an_event_earlier_today_still_counts_as_today(self):
        # Day granularity: the owner's "as soon as they ended" is met at
        # midnight, not mid-evening, so a 9 PM party is still listed at 11 PM.
        self._ev('this morning', 0, start_date=self._local(self.today, 9))
        self.assertEqual(self._names(), {'this morning'})

    def test_hidden_duplicates_and_non_events_are_not_listed(self):
        self._ev('shown', 1)
        self._ev('hidden by the old flag', 1, is_duplicate=True)
        self._ev('hidden by the dedupe', 1, suppressed=True)
        self._ev('a menu photo', 1, is_event=False)
        self.assertEqual(self._names(), {'shown'})

    def test_an_unclassified_row_is_listed(self):
        # is_event NULL means never classified, not "not an event".
        self._ev('unclassified', 1, is_event=None)
        self.assertEqual(self._names(), {'unclassified'})

    def test_undated_rows_are_not_listed(self):
        self._ev('no date', 0, start_date=None)
        self._ev('dated', 1)
        self.assertEqual(self._names(), {'dated'})

    def test_a_festival_that_started_two_days_ago_and_ends_tomorrow_is_listed(self):
        self._ev('festival', -2, end_date=self._local(self.today + timedelta(days=1), 23))
        self.assertEqual(self._names(), {'festival'})

    def test_a_month_long_span_that_started_weeks_ago_is_not_listed(self):
        # Extraction mistake, not a festival: "Lightning in a Bottle" stored
        # as Aug 21 to Sep 18 sat in the list for a month.
        self._ev('four week span', -28, end_date=self._local(self.today, 23))
        self.assertEqual(self._names(), set())

    def test_a_recurring_series_is_one_row_with_every_date(self):
        first = self._ev('weekly', 1, shortcode='W', orig_link='https://www.instagram.com/p/W/')
        second = self._ev('weekly', 8, shortcode='W', orig_link='https://www.instagram.com/p/W/')
        rows = self._list()
        self.assertEqual([r['id'] for r in rows], [first.id])
        self.assertEqual(rows[0]['series_ids'], [first.id, second.id])

    def test_the_list_does_not_run_a_query_per_event(self):
        for i in range(30):
            self._ev('event %d' % i, 1 + i % 5)
        with CaptureQueriesContext(connection) as ctx:
            rows = self._list()
        self.assertEqual(len(rows), 30)
        self.assertLessEqual(len(ctx), 6, 'venue and poster must be joined, not fetched per row')
