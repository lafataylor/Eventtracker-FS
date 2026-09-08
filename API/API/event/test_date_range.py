"""Feed date filters: local calendar days, with the end day included.

Two defects these pin:

1. ``date_range_events`` filtered ``start_date__range=(start, end)`` with plain
   ``date`` objects. Under USE_TZ Django reads a bare date as midnight, so the
   upper bound was 00:00 ON the end day and every event later that day was
   missing from the range the visitor asked for.

2. ``date_events`` filtered ``start_date__date=<day>``, which on SQLite runs a
   per-row Python function (``django_datetime_cast_date``) and therefore cannot
   use the ``start_date`` index. A half-open aware range returns the same rows
   and can.

Both feeds must keep answering in the PROJECT timezone, not UTC: an 8 PM event
in Los Angeles is already "tomorrow" in UTC, and it belongs to the local day.
"""
from datetime import datetime, time, timedelta

from django.test import TestCase
from django.utils import timezone

from .models import Event, Venue


class DateFeedFixtureMixin:
    """Events pinned to local calendar days around a fixed reference day."""

    def setUp(self):
        # Far enough ahead that the 25-hour cutoff never hides these.
        self.day = (timezone.localtime(timezone.now()) + timedelta(days=10)).date()
        self.next_day = self.day + timedelta(days=1)
        self.prev_day = self.day - timedelta(days=1)

        # 11 PM local: still the local day, but already the NEXT day in UTC.
        self.late = self._ev('late on the day', self._local(self.day, 23, 0))
        self.morning = self._ev('morning of the day', self._local(self.day, 9, 0))
        self.next_morning = self._ev('next day', self._local(self.next_day, 9, 0))
        self.prev_evening = self._ev('previous day', self._local(self.prev_day, 20, 0))

    @staticmethod
    def _local(day, hour, minute):
        """An aware datetime at a wall-clock time in the project timezone."""
        return timezone.make_aware(datetime.combine(day, time(hour, minute)))

    def _ev(self, name, start, end=None):
        return Event.objects.create(
            name=name, start_date=start, end_date=end,
            is_duplicate=False, suppressed=False, is_event=True,
            venue=Venue.objects.create(address='somewhere'))

    @staticmethod
    def _names(res):
        return {e['name'] for e in (res.json().get('data') or [])}

    def _day_feed(self, day):
        res = self.client.get('/v1/event/date/', {'date': day.strftime('%Y-%m-%d')})
        self.assertEqual(res.status_code, 200)
        return self._names(res)

    def _range_feed(self, start, end):
        res = self.client.get('/v1/event/date/range/',
                              {'start': start.strftime('%Y-%m-%d'),
                               'end': end.strftime('%Y-%m-%d')})
        self.assertEqual(res.status_code, 200)
        return self._names(res)


class DayFeedBoundaryTests(DateFeedFixtureMixin, TestCase):
    def test_day_feed_returns_exactly_that_local_day(self):
        names = self._day_feed(self.day)
        self.assertEqual(names, {'late on the day', 'morning of the day'})

    def test_late_evening_event_is_not_pushed_into_the_next_day(self):
        # The UTC instant of an 11 PM Los Angeles event falls on the next
        # calendar day; the feed must still answer in local time.
        self.assertNotIn('late on the day', self._day_feed(self.next_day))
        self.assertIn('next day', self._day_feed(self.next_day))


class RangeFeedEndDayTests(DateFeedFixtureMixin, TestCase):
    def test_single_day_range_includes_the_whole_day(self):
        # start == end: the entire day belongs to the range, including 11 PM.
        names = self._range_feed(self.day, self.day)
        self.assertEqual(names, {'late on the day', 'morning of the day'})

    def test_range_includes_events_on_the_end_day(self):
        names = self._range_feed(self.prev_day, self.day)
        self.assertIn('previous day', names)
        self.assertIn('morning of the day', names)
        self.assertIn('late on the day', names)
        self.assertNotIn('next day', names)

    def test_range_matches_an_event_by_its_end_date_too(self):
        # A festival that started before the window but runs into it.
        self._ev('spanning festival',
                 self._local(self.prev_day - timedelta(days=2), 18, 0),
                 end=self._local(self.day, 22, 0))
        self.assertIn('spanning festival', self._range_feed(self.day, self.day))

    def test_range_excludes_the_day_after_the_end(self):
        self.assertNotIn('next day', self._range_feed(self.prev_day, self.day))


class FilterEventsDateTests(DateFeedFixtureMixin, TestCase):
    """The public filter UI's date filter is the THIRD date path.

    ``FE/components/Filter/Filter.tsx`` posts {"type": "date", "condition":
    "between", "values": ["MM/DD/YYYY", "MM/DD/YYYY"]}. It carried the same
    plain-date ``__range`` bug the two feeds had, so a visitor filtering
    "between the 1st and the 10th" lost everything on the 10th, and picking
    the same day twice returned nothing at all.
    """

    def _filter(self, condition, *days):
        res = self.client.post(
            '/v1/event/filter/',
            {'filters': [{"type": "date", "condition": condition,
                          "values": [d.strftime('%m/%d/%Y') for d in days]}]},
            content_type='application/json')
        self.assertEqual(res.status_code, 200)
        return self._names(res)

    def test_between_includes_events_on_the_end_day(self):
        names = self._filter('between', self.prev_day, self.day)
        self.assertIn('morning of the day', names)
        self.assertIn('late on the day', names)

    def test_between_the_same_day_twice_returns_that_day(self):
        names = self._filter('between', self.day, self.day)
        self.assertEqual(names, {'morning of the day', 'late on the day'})

    def test_between_still_excludes_the_day_after(self):
        self.assertNotIn('next day', self._filter('between', self.prev_day, self.day))

    def test_equal_returns_that_local_day(self):
        self.assertEqual(self._filter('equal', self.day),
                         {'morning of the day', 'late on the day'})


class RangeFeedEndDateBranchTests(DateFeedFixtureMixin, TestCase):
    """An event may match the window by its END date, not only its start.

    The OR branch for ``end_date`` was unreachable: ``start_date__gte=cutoff``
    was ANDed outside the Q group, so anything that STARTED more than 25 hours
    ago was excluded before the end_date test could apply. Every festival,
    exhibition and residency was therefore missing from the range feed for the
    whole of its run except the first day.
    """

    def test_a_run_that_started_last_week_appears_on_its_end_day(self):
        end = self._local(self.day, 22, 0)
        self._ev('long exhibition',
                 timezone.now() - timedelta(days=7), end=end)
        self.assertIn('long exhibition', self._range_feed(self.day, self.day))

    def test_a_finished_run_stays_out(self):
        # ended well before the 25-hour cutoff: still gone
        self._ev('finished run',
                 timezone.now() - timedelta(days=20),
                 end=timezone.now() - timedelta(days=10))
        names = self._range_feed(self.prev_day, self.next_day)
        self.assertNotIn('finished run', names)


class DayAndRangeAgreeTests(DateFeedFixtureMixin, TestCase):
    def test_one_day_range_equals_the_day_feed(self):
        """The two feeds render the same city page; they must not disagree."""
        for day in (self.prev_day, self.day, self.next_day):
            self.assertEqual(self._day_feed(day), self._range_feed(day, day),
                             f'feeds disagree for {day}')
