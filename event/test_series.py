"""One card per recurring series.

Ingestion expands a recurring post ("every Tuesday") into one row per date so
that a date filter finds the event on each of its nights. Every LIST then
showed the same flyer once per date: measured on production 2026-09-14,
1,470 of the 2,274 visible upcoming cards (65%) were later dates of a series
already on the page, and the admin list showed each night's expansions twelve
rows in a row. Owner: "I'm seeing tons of the same Instagram posts again and
again, from the same web address" and, earlier, "a max of one event with the
same title".

The rule these tests pin: a list shows the EARLIEST occurrence of a series and
carries the ids of the rest (series_ids) so the admin page can act on the
whole series; a single-day view still shows whichever occurrence falls on
that day, because the rows stay in the database.
"""
from datetime import datetime, time, timedelta

import jwt
from django.test import TestCase
from django.utils import timezone

from c_auth.models import User
from .models import Event, Venue
from .series import collapse_series


def _local(day, hour):
    return timezone.make_aware(datetime.combine(day, time(hour, 0)))


class SeriesFixtureMixin:
    def setUp(self):
        # Far enough ahead that the 25-hour cutoff never hides these.
        self.day = (timezone.localtime(timezone.now()) + timedelta(days=10)).date()
        self.week_later = self.day + timedelta(days=7)

    def _ev(self, name, day, shortcode='TONAL1', slide=0, **kw):
        base = dict(
            name=name, start_date=_local(day, 21), start_time='09:00 PM',
            shortcode=shortcode, source_slide_index=slide,
            orig_link='https://www.instagram.com/p/%s/' % shortcode,
            is_duplicate=False, suppressed=False, is_event=True,
            timestamp=timezone.now(),
            venue=Venue.objects.create(address='somewhere'))
        base.update(kw)
        return Event.objects.create(**base)

    def _series(self, name='Wednesday Night at Tonal', **kw):
        """Two expansions of one post: the same event a week apart."""
        first = self._ev(name, self.day, **kw)
        second = self._ev(name, self.week_later, **kw)
        return first, second

    @staticmethod
    def _rows(res):
        return res.json().get('data') or []


class CollapseSeriesTests(SeriesFixtureMixin, TestCase):
    def test_keeps_the_earliest_occurrence_only(self):
        first, second = self._series()
        third = self._ev('Wednesday Night at Tonal', self.day + timedelta(days=14))
        kept = collapse_series([third, second, first])
        self.assertEqual([e.id for e in kept], [first.id])

    def test_keeper_carries_every_occurrence_in_date_order(self):
        first, second = self._series()
        third = self._ev('Wednesday Night at Tonal', self.day + timedelta(days=14))
        kept = collapse_series([third, second, first])
        self.assertEqual(kept[0].series_ids, [first.id, second.id, third.id])

    def test_a_row_outside_any_series_lists_only_itself(self):
        solo = self._ev('One Night Only', self.day)
        self.assertEqual(collapse_series([solo])[0].series_ids, [solo.id])

    def test_roundup_events_of_one_post_are_all_kept(self):
        # Same post, different titles: several events, by design (Ticket 2).
        a = self._ev('Sound Bath', self.day)
        b = self._ev('Breathwork', self.week_later)
        self.assertEqual({e.id for e in collapse_series([a, b])}, {a.id, b.id})

    def test_nameless_rows_with_different_artists_are_all_kept(self):
        # A programme post with no titles: one artist per night.
        a = self._ev(None, self.day, artist='PHASE:ONE')
        b = self._ev(None, self.week_later, artist='SIGNALS')
        self.assertEqual({e.id for e in collapse_series([a, b])}, {a.id, b.id})

    def test_same_title_from_different_posts_is_not_collapsed(self):
        # Cross-post duplicates are the dedupe's job, with its own evidence
        # rules; collapsing on title alone would hide real events.
        a = self._ev('Sunset Music Sessions', self.day, shortcode='POST_A')
        b = self._ev('Sunset Music Sessions', self.week_later, shortcode='POST_B')
        self.assertEqual({e.id for e in collapse_series([a, b])}, {a.id, b.id})

    def test_rows_with_no_post_at_all_never_collapse_with_each_other(self):
        # Manually added events have neither shortcode nor orig_link.
        a = self._ev('Open Mic', self.day, shortcode=None, orig_link=None)
        b = self._ev('Open Mic', self.week_later, shortcode=None, orig_link=None)
        self.assertEqual({e.id for e in collapse_series([a, b])}, {a.id, b.id})

    def test_keeps_the_order_of_the_input(self):
        # Feeds are ordered by the query; collapsing must not reshuffle them.
        z = self._ev('Zebra', self.day, shortcode='Z')
        first, second = self._series()
        a = self._ev('Alpha', self.day, shortcode='A')
        kept = collapse_series([z, second, a, first])
        self.assertEqual([e.name for e in kept], ['Zebra', 'Wednesday Night at Tonal', 'Alpha'])

    def test_two_slides_of_one_post_describing_one_event_collapse(self):
        # A flyer slide and a lineup slide of one carousel can each yield the
        # same event. The exact pass hides one overnight; the list must not
        # wait for it (owner screenshot 2026-09-14: two identical "September
        # Nights at Attika" cards side by side, one post).
        a = self._ev('September Nights at Attika', self.day, slide=0)
        b = self._ev('September Nights at Attika', self.day, slide=1)
        self.assertEqual([e.id for e in collapse_series([a, b])], [a.id])


class SeriesInFeedsTests(SeriesFixtureMixin, TestCase):
    def setUp(self):
        super().setUp()
        self.first, self.second = self._series()
        u = User.objects.create(email='s@test.dev', usertype='admin')
        self.tok = jwt.encode({'id': u.id}, 'secret', algorithm='HS256')

    def _fmt(self, day):
        return day.strftime('%Y-%m-%d')

    def test_range_feed_shows_the_series_once(self):
        res = self.client.get('/v1/event/date/range/',
                              {'start': self._fmt(self.day), 'end': self._fmt(self.week_later)})
        rows = self._rows(res)
        self.assertEqual([r['id'] for r in rows], [self.first.id])
        self.assertEqual(rows[0]['series_ids'], [self.first.id, self.second.id])

    def test_single_day_feed_still_finds_the_later_occurrence(self):
        # The rows stay in the database: on the second Wednesday the party is
        # on, and asking for that day must say so.
        res = self.client.get('/v1/event/date/', {'date': self._fmt(self.week_later)})
        self.assertEqual([r['id'] for r in self._rows(res)], [self.second.id])

    def test_search_shows_the_series_once(self):
        res = self.client.get('/v1/event/search/', {'query': 'tonal'})
        self.assertEqual([r['id'] for r in self._rows(res)], [self.first.id])

    def test_filter_shows_the_series_once(self):
        res = self.client.post(
            '/v1/event/filter/',
            {'filters': [{'type': 'date', 'condition': 'between',
                          'values': [self.day.strftime('%m/%d/%Y'),
                                     self.week_later.strftime('%m/%d/%Y')]}]},
            content_type='application/json')
        self.assertEqual([r['id'] for r in self._rows(res)], [self.first.id])

    def test_admin_list_shows_the_series_once_with_every_id(self):
        res = self.client.get('/v1/admin/event/', HTTP_AUTHORIZATION='Token ' + self.tok)
        rows = self._rows(res)
        self.assertEqual([r['id'] for r in rows], [self.first.id])
        self.assertEqual(rows[0]['series_ids'], [self.first.id, self.second.id])

    def test_a_single_event_serializes_with_its_own_id(self):
        # This endpoint answers with the bare row, not the {status, data} wrapper.
        res = self.client.get('/v1/event/', {'id': str(self.second.id)})
        self.assertEqual(res.json()['series_ids'], [self.second.id])


class SeriesAndResultCapTests(SeriesFixtureMixin, TestCase):
    """The result cap must count CARDS, not rows. Applied to rows before the
    collapse, a couple of recurring series could fill it with their copies
    and push distinct matching events out of the response entirely."""

    def setUp(self):
        super().setUp()
        self.first, self.second = self._series()
        self.other = self._ev('Tonal Records Showcase', self.day + timedelta(days=2),
                              shortcode='OTHER')
        # The series copies are the newest rows (ingested last); the distinct
        # event is older, so a row-level cap of 2 would take the two copies.
        Event.objects.filter(id__in=[self.first.id, self.second.id]).update(
            timestamp=timezone.now() + timedelta(minutes=5))
        Event.objects.filter(id=self.other.id).update(
            timestamp=timezone.now() - timedelta(days=1))

    def test_search_fills_the_cap_with_distinct_cards(self):
        from unittest import mock
        with mock.patch('event.views.SEARCH_RESULT_LIMIT', 2):
            res = self.client.get('/v1/event/search/', {'query': 'tonal'})
        self.assertEqual({r['name'] for r in self._rows(res)},
                         {'Wednesday Night at Tonal', 'Tonal Records Showcase'})

    def test_filter_fills_the_cap_with_distinct_cards(self):
        from unittest import mock
        with mock.patch('event.views.SEARCH_RESULT_LIMIT', 2):
            res = self.client.post(
                '/v1/event/filter/',
                {'filters': [{'type': 'date', 'condition': 'between',
                              'values': [self.day.strftime('%m/%d/%Y'),
                                         self.week_later.strftime('%m/%d/%Y')]}]},
                content_type='application/json')
        self.assertEqual({r['name'] for r in self._rows(res)},
                         {'Wednesday Night at Tonal', 'Tonal Records Showcase'})
