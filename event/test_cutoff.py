"""Feed cutoff: an aware, rolling 25-hour window.

The feed views used to build their cutoff from ``datetime.now()`` (the
server's naive wall clock) and truncate it with ``.date()``. With USE_TZ on,
Django re-interprets that naive value in the project timezone and warns on
every request, and the calendar-day truncation let the window drift by up to
a day. These tests pin the intended behaviour - an event stays visible until
it is 25 hours old - and that the requests no longer trigger the warning.
"""
import warnings
from datetime import timedelta

from django.test import TestCase
from django.utils import timezone

from .models import Event, Venue


def _naive_warnings(caught):
    """The RuntimeWarnings Django emits for naive datetimes on aware fields."""
    return [w for w in caught
            if issubclass(w.category, RuntimeWarning)
            and 'naive datetime' in str(w.message)]


class CutoffFixtureMixin:
    """Two events straddling the 25-hour cutoff, whatever time it is now."""

    def setUp(self):
        now = timezone.now()
        # 20 hours old: still inside the window.
        self.recent_start = now - timedelta(hours=20)
        # 30 hours old: past the window, whichever calendar day it lands on.
        self.stale_start = now - timedelta(hours=30)
        self._ev('cutoff recent', self.recent_start)
        self._ev('cutoff stale', self.stale_start)

    def _ev(self, name, start):
        return Event.objects.create(
            name=name, artist='Cutoff Artist', start_date=start,
            is_duplicate=False, suppressed=False, is_event=True,
            venue=Venue.objects.create(address='somewhere'))

    @staticmethod
    def _la_date(dt):
        # __date filters convert to the project timezone (America/Los_Angeles),
        # so the query string has to be derived in LOCAL time or the lookup
        # lands a day off (same pattern as test_queue_hygiene).
        return timezone.localtime(dt).strftime('%Y-%m-%d')

    @staticmethod
    def _names(res):
        return {e['name'] for e in (res.json().get('data') or [])}


class DateFeedCutoffTests(CutoffFixtureMixin, TestCase):
    """event/date/ is what the city pages render."""

    def _feed_for(self, start):
        """GET the feed for start's LA calendar day; returns (names, warnings)."""
        with warnings.catch_warnings(record=True) as caught:
            warnings.simplefilter('always')
            res = self.client.get('/v1/event/date/',
                                  {'date': self._la_date(start)})
        self.assertEqual(res.status_code, 200)
        return self._names(res), _naive_warnings(caught)

    def test_event_20_hours_old_is_still_served(self):
        names, _ = self._feed_for(self.recent_start)
        self.assertIn('cutoff recent', names)

    def test_event_30_hours_old_is_gone(self):
        names, _ = self._feed_for(self.stale_start)
        self.assertNotIn('cutoff stale', names)

    def test_no_naive_datetime_warning(self):
        for start in (self.recent_start, self.stale_start):
            _, naive = self._feed_for(start)
            self.assertEqual(naive, [], [str(w.message) for w in naive])


class SearchAndFilterCutoffTests(CutoffFixtureMixin, TestCase):
    """search_events and filter_events share the same cutoff."""

    def test_search_applies_rolling_window_without_warning(self):
        with warnings.catch_warnings(record=True) as caught:
            warnings.simplefilter('always')
            res = self.client.get('/v1/event/search/', {'query': 'cutoff'})
        self.assertEqual(res.status_code, 200)
        names = self._names(res)
        self.assertIn('cutoff recent', names)
        self.assertNotIn('cutoff stale', names)
        naive = _naive_warnings(caught)
        self.assertEqual(naive, [], [str(w.message) for w in naive])

    def test_filter_applies_rolling_window_without_warning(self):
        with warnings.catch_warnings(record=True) as caught:
            warnings.simplefilter('always')
            res = self.client.post(
                '/v1/event/filter/',
                {'filters': [{"type": "artist", "condition": "equal",
                              "values": ["Cutoff Artist"]}]},
                content_type='application/json')
        self.assertEqual(res.status_code, 200)
        names = self._names(res)
        self.assertIn('cutoff recent', names)
        self.assertNotIn('cutoff stale', names)
        naive = _naive_warnings(caught)
        self.assertEqual(naive, [], [str(w.message) for w in naive])
