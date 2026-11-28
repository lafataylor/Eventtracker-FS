"""Feed cutoff: Pacific calendar day, yesterday until 5 AM.

City pages keep yesterday under Today until 5:00 AM America/Los_Angeles
(FE ``currentTimeHour < 5``). The API used to apply a rolling 25-hour window
on ``start_date``; date-only rows sit at local midnight, so that window
dropped yesterday around 1 AM while the FE still asked for it (owner,
2026-11). The floor is now the start of yesterday before 5 AM local, else
the start of today — timed and date-only prior-night events both survive
until that hour. These tests freeze the clock so the pin does not depend
on when the suite runs.
"""
import warnings
from datetime import datetime, time, timedelta
from unittest import mock
from zoneinfo import ZoneInfo

from django.test import TestCase
from django.utils import timezone

from .models import Event, Venue
from .views import OVERNIGHT_CUTOFF_HOUR, feed_visibility_floor, local_day_bounds

LA = ZoneInfo('America/Los_Angeles')


def _naive_warnings(caught):
    """The RuntimeWarnings Django emits for naive datetimes on aware fields."""
    return [w for w in caught
            if issubclass(w.category, RuntimeWarning)
            and 'naive datetime' in str(w.message)]


def _freeze_la(year, month, day, hour, minute=0):
    """UTC-aware instant for ``timezone.now`` at a Pacific wall clock."""
    local = datetime(year, month, day, hour, minute, tzinfo=LA)
    # django.utils.timezone shadows datetime.timezone; same pattern as
    # test_queue_hygiene.
    return local.astimezone(timezone.timezone.utc)


def _local(day, hour, minute=0):
    return timezone.make_aware(datetime.combine(day, time(hour, minute)))


class FeedVisibilityFloorTests(TestCase):
    """Unit pins for the calendar floor itself."""

    def test_before_5am_floor_is_yesterday_midnight(self):
        frozen = _freeze_la(2026, 11, 18, 3, 0)
        with mock.patch('django.utils.timezone.now', return_value=frozen):
            floor = feed_visibility_floor()
        yesterday = datetime(2026, 11, 17).date()
        expected, _ = local_day_bounds(yesterday)
        self.assertEqual(floor, expected)
        self.assertEqual(OVERNIGHT_CUTOFF_HOUR, 5)

    def test_at_5am_floor_is_today_midnight(self):
        frozen = _freeze_la(2026, 11, 18, 5, 0)
        with mock.patch('django.utils.timezone.now', return_value=frozen):
            floor = feed_visibility_floor()
        today = datetime(2026, 11, 18).date()
        expected, _ = local_day_bounds(today)
        self.assertEqual(floor, expected)

    def test_after_5am_floor_is_today_midnight(self):
        frozen = _freeze_la(2026, 11, 18, 14, 30)
        with mock.patch('django.utils.timezone.now', return_value=frozen):
            floor = feed_visibility_floor()
        today = datetime(2026, 11, 18).date()
        expected, _ = local_day_bounds(today)
        self.assertEqual(floor, expected)


class CutoffFixtureMixin:
    """Yesterday midnight + evening events; clock frozen in each test."""

    # Tuesday 2026-11-17 in Pacific — used as "today" in overnight tests.
    TODAY = datetime(2026, 11, 17).date()
    YESTERDAY = TODAY - timedelta(days=1)

    def _ev(self, name, start):
        return Event.objects.create(
            name=name, artist='Cutoff Artist', start_date=start,
            is_duplicate=False, suppressed=False, is_event=True,
            venue=Venue.objects.create(address='somewhere'))

    def setUp(self):
        # Date-only style: local midnight of yesterday (what ingestion stores
        # for MM-DD-YYYY with no clock). Under the old 25h window this was
        # gone by ~1 AM; under the calendar floor it must last until 5 AM.
        self.yesterday_midnight = self._ev(
            'cutoff yesterday midnight', _local(self.YESTERDAY, 0, 0))
        self.yesterday_evening = self._ev(
            'cutoff yesterday evening', _local(self.YESTERDAY, 22, 0))
        self.today_morning = self._ev(
            'cutoff today morning', _local(self.TODAY, 10, 0))
        # Two calendar days before today: always outside the overnight window.
        self.stale = self._ev(
            'cutoff stale', _local(self.YESTERDAY - timedelta(days=1), 20, 0))

    @staticmethod
    def _names(res):
        return {e['name'] for e in (res.json().get('data') or [])}


class DateFeedCutoffTests(CutoffFixtureMixin, TestCase):
    """event/date/ is what the city pages render for a single day."""

    def _feed(self, day, frozen):
        with warnings.catch_warnings(record=True) as caught:
            warnings.simplefilter('always')
            with mock.patch('django.utils.timezone.now', return_value=frozen):
                res = self.client.get(
                    '/v1/event/date/', {'date': day.strftime('%Y-%m-%d')})
        self.assertEqual(res.status_code, 200)
        return self._names(res), _naive_warnings(caught)

    def test_before_5am_yesterday_date_only_is_still_served(self):
        frozen = _freeze_la(2026, 11, 17, 3, 0)
        names, naive = self._feed(self.YESTERDAY, frozen)
        self.assertIn('cutoff yesterday midnight', names)
        self.assertIn('cutoff yesterday evening', names)
        self.assertEqual(naive, [], [str(w.message) for w in naive])

    def test_before_5am_yesterday_to_today_range_keeps_prior_night(self):
        # Same request the FE makes before 5 AM.
        frozen = _freeze_la(2026, 11, 17, 3, 0)
        with mock.patch('django.utils.timezone.now', return_value=frozen):
            res = self.client.get(
                '/v1/event/date/range/',
                {'start': self.YESTERDAY.strftime('%Y-%m-%d'),
                 'end': self.TODAY.strftime('%Y-%m-%d')})
        self.assertEqual(res.status_code, 200)
        names = self._names(res)
        self.assertIn('cutoff yesterday midnight', names)
        self.assertIn('cutoff yesterday evening', names)
        self.assertIn('cutoff today morning', names)
        self.assertNotIn('cutoff stale', names)

    def test_at_5am_yesterday_is_gone_from_day_feed(self):
        frozen = _freeze_la(2026, 11, 17, 5, 0)
        names, _ = self._feed(self.YESTERDAY, frozen)
        self.assertNotIn('cutoff yesterday midnight', names)
        self.assertNotIn('cutoff yesterday evening', names)

    def test_after_5am_today_is_still_served(self):
        frozen = _freeze_la(2026, 11, 17, 10, 0)
        names, naive = self._feed(self.TODAY, frozen)
        self.assertIn('cutoff today morning', names)
        self.assertNotIn('cutoff yesterday midnight', names)
        self.assertEqual(naive, [], [str(w.message) for w in naive])


class SearchAndFilterCutoffTests(CutoffFixtureMixin, TestCase):
    """search_events and filter_events share the same calendar floor."""

    def test_search_before_5am_includes_yesterday_excludes_older(self):
        frozen = _freeze_la(2026, 11, 17, 3, 0)
        with warnings.catch_warnings(record=True) as caught:
            warnings.simplefilter('always')
            with mock.patch('django.utils.timezone.now', return_value=frozen):
                res = self.client.get('/v1/event/search/', {'query': 'cutoff'})
        self.assertEqual(res.status_code, 200)
        names = self._names(res)
        self.assertIn('cutoff yesterday midnight', names)
        self.assertIn('cutoff yesterday evening', names)
        self.assertIn('cutoff today morning', names)
        self.assertNotIn('cutoff stale', names)
        naive = _naive_warnings(caught)
        self.assertEqual(naive, [], [str(w.message) for w in naive])

    def test_search_after_5am_drops_yesterday(self):
        frozen = _freeze_la(2026, 11, 17, 6, 0)
        with mock.patch('django.utils.timezone.now', return_value=frozen):
            res = self.client.get('/v1/event/search/', {'query': 'cutoff'})
        self.assertEqual(res.status_code, 200)
        names = self._names(res)
        self.assertNotIn('cutoff yesterday midnight', names)
        self.assertNotIn('cutoff yesterday evening', names)
        self.assertIn('cutoff today morning', names)

    def test_filter_before_5am_includes_yesterday(self):
        frozen = _freeze_la(2026, 11, 17, 3, 0)
        with warnings.catch_warnings(record=True) as caught:
            warnings.simplefilter('always')
            with mock.patch('django.utils.timezone.now', return_value=frozen):
                res = self.client.post(
                    '/v1/event/filter/',
                    {'filters': [{"type": "artist", "condition": "equal",
                                  "values": ["Cutoff Artist"]}]},
                    content_type='application/json')
        self.assertEqual(res.status_code, 200)
        names = self._names(res)
        self.assertIn('cutoff yesterday midnight', names)
        self.assertIn('cutoff yesterday evening', names)
        self.assertNotIn('cutoff stale', names)
        naive = _naive_warnings(caught)
        self.assertEqual(naive, [], [str(w.message) for w in naive])
