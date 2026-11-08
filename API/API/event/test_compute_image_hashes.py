"""Fill image_dhash on events that have a flyer URL and no fingerprint yet.

The scraper is not touched: a nightly command fetches orig_thumb (public
files, ~300 a night) and stores dhash. Tests never hit the network.
"""
from datetime import timedelta
from io import StringIO
from unittest.mock import MagicMock, patch

import requests
from django.core.management import call_command
from django.test import TestCase
from django.utils import timezone

from c_admin.models import Account
from event.imagehash import dhash
from event.management.commands.compute_image_hashes import (
    CONNECT_TIMEOUT_S,
    MAX_BYTES,
    READ_TIMEOUT_S,
    fetch_thumb,
)
from event.models import Event
from event.test_imagehash import image_to_jpeg_bytes, make_flyer_image


class ComputeImageHashesTests(TestCase):
    def setUp(self):
        self.acct = Account.objects.create(user='hash_acct', forLocation='Berlin')
        self.jpeg = image_to_jpeg_bytes(make_flyer_image(seed=42), quality=95)
        self.expected = dhash(self.jpeg)

    def _ev(self, post, thumb='https://img.example/%s.jpg', hashed=None,
            days=3):
        start = None if days is None else timezone.now() + timedelta(days=days)
        return Event.objects.create(
            name=post, shortcode=post, poster=self.acct, is_event=True,
            orig_thumb=(thumb % post) if '%s' in (thumb or '') else thumb,
            image_dhash=hashed, start_date=start)

    def _run(self, *args, **opts):
        out = StringIO()
        call_command('compute_image_hashes', *args, stdout=out, **opts)
        return out.getvalue()

    def test_unhashed_event_gets_a_dhash_from_its_thumb_bytes(self):
        ev = self._ev('NEW1')
        with patch('event.management.commands.compute_image_hashes.fetch_thumb',
                   return_value=self.jpeg):
            self._run()
        ev.refresh_from_db()
        self.assertEqual(ev.image_dhash, self.expected)

    def test_already_hashed_events_are_not_refetched(self):
        ev = self._ev('OLD1', hashed='ffffffffffffffff')
        with patch('event.management.commands.compute_image_hashes.fetch_thumb') as fetch:
            self._run()
            fetch.assert_not_called()
        ev.refresh_from_db()
        self.assertEqual(ev.image_dhash, 'ffffffffffffffff')

    def test_a_missing_thumb_is_skipped(self):
        ev = self._ev('NOTHUMB', thumb=None)
        self._run()
        ev.refresh_from_db()
        self.assertIsNone(ev.image_dhash)

    def test_undecodable_bytes_leave_the_row_unhashed(self):
        ev = self._ev('BAD1')
        with patch('event.management.commands.compute_image_hashes.fetch_thumb',
                   return_value=b'not an image'):
            self._run()
        ev.refresh_from_db()
        self.assertIsNone(ev.image_dhash)

    def test_dry_run_writes_nothing(self):
        ev = self._ev('DRY1')
        with patch('event.management.commands.compute_image_hashes.fetch_thumb',
                   return_value=self.jpeg):
            self._run(dry_run=True)
        ev.refresh_from_db()
        self.assertIsNone(ev.image_dhash)

    def test_past_events_are_skipped_by_default(self):
        past = self._ev('PAST1', days=-10)
        with patch('event.management.commands.compute_image_hashes.fetch_thumb',
                   return_value=self.jpeg) as fetch:
            self._run()
            fetch.assert_not_called()
        past.refresh_from_db()
        self.assertIsNone(past.image_dhash)

    def test_undated_events_are_skipped_by_default(self):
        undated = self._ev('NODATE', days=None)
        with patch('event.management.commands.compute_image_hashes.fetch_thumb',
                   return_value=self.jpeg) as fetch:
            self._run()
            fetch.assert_not_called()
        undated.refresh_from_db()
        self.assertIsNone(undated.image_dhash)

    def test_tonight_still_counts_as_upcoming(self):
        # Same evening-hour trap as the duplicates queue: UTC date != LA date
        # after ~5pm LA. 2026-11-08.
        import zoneinfo
        la = zoneinfo.ZoneInfo('America/Los_Angeles')
        local_evening = timezone.datetime(2026, 11, 8, 18, 30, tzinfo=la)
        frozen = local_evening.astimezone(timezone.timezone.utc)
        tonight = local_evening.replace(hour=23, minute=30)
        ev = Event.objects.create(
            name='TONIGHT', shortcode='TONIGHT', poster=self.acct,
            is_event=True, orig_thumb='https://img.example/tonight.jpg',
            start_date=tonight)
        with patch('django.utils.timezone.now', return_value=frozen), \
             patch('event.management.commands.compute_image_hashes.fetch_thumb',
                   return_value=self.jpeg):
            self._run()
        ev.refresh_from_db()
        self.assertEqual(ev.image_dhash, self.expected)

    def test_all_includes_undated_rows(self):
        undated = self._ev('NODATE2', days=None)
        with patch('event.management.commands.compute_image_hashes.fetch_thumb',
                   return_value=self.jpeg):
            self._run(all=True)
        undated.refresh_from_db()
        self.assertEqual(undated.image_dhash, self.expected)

    def test_all_hashes_past_events_after_upcoming(self):
        past = self._ev('PAST2', days=-20)
        soon = self._ev('SOON2', days=1)
        later = self._ev('LATER2', days=10)
        order = []

        def fetch(url):
            order.append(url)
            return self.jpeg

        with patch('event.management.commands.compute_image_hashes.fetch_thumb',
                   side_effect=fetch):
            self._run(all=True)
        for ev in (past, soon, later):
            ev.refresh_from_db()
            self.assertEqual(ev.image_dhash, self.expected)
        self.assertEqual(order, [
            soon.orig_thumb, later.orig_thumb, past.orig_thumb])

    def test_limit_takes_the_soonest_upcoming_not_the_lowest_id(self):
        later = self._ev('LATER3', days=12)
        soon = self._ev('SOON3', days=1)
        self.assertLess(later.id, soon.id)
        with patch('event.management.commands.compute_image_hashes.fetch_thumb',
                   return_value=self.jpeg):
            self._run(limit=1)
        soon.refresh_from_db()
        later.refresh_from_db()
        self.assertEqual(soon.image_dhash, self.expected)
        self.assertIsNone(later.image_dhash)

    def test_all_with_limit_still_prefers_upcoming(self):
        past = self._ev('PAST3', days=-5)
        soon = self._ev('SOON4', days=2)
        with patch('event.management.commands.compute_image_hashes.fetch_thumb',
                   return_value=self.jpeg):
            self._run(all=True, limit=1)
        soon.refresh_from_db()
        past.refresh_from_db()
        self.assertEqual(soon.image_dhash, self.expected)
        self.assertIsNone(past.image_dhash)

    def test_a_row_error_still_prints_the_final_summary(self):
        self._ev('BOOM')
        self._ev('OK')
        n = {'i': 0}

        def fetch(url):
            n['i'] += 1
            if n['i'] == 1:
                raise RuntimeError('decode exploded')
            return self.jpeg

        with patch('event.management.commands.compute_image_hashes.fetch_thumb',
                   side_effect=fetch):
            out = self._run()
        self.assertIn('[imagehash] hashed', out)
        self.assertIn('skipped', out)

    def test_progress_is_logged_before_the_loop(self):
        self._ev('P1', days=1)
        self._ev('P2', days=2)
        with patch('event.management.commands.compute_image_hashes.fetch_thumb',
                   return_value=self.jpeg):
            out = self._run()
        self.assertIn('2 upcoming flyers to scan', out)

    def test_fetch_uses_connect_and_read_timeouts(self):
        with patch('event.management.commands.compute_image_hashes.requests.get',
                   side_effect=requests.Timeout) as get:
            self.assertIsNone(fetch_thumb('https://img.example/x.jpg'))
        kwargs = get.call_args.kwargs
        self.assertEqual(kwargs['timeout'], (CONNECT_TIMEOUT_S, READ_TIMEOUT_S))
        self.assertTrue(kwargs['stream'])

    def test_fetch_refuses_an_oversize_payload(self):
        body = MagicMock()
        body.headers = {'Content-Length': str(MAX_BYTES + 1)}
        body.raise_for_status = MagicMock()
        body.iter_content = MagicMock(return_value=[b'x'])
        body.__enter__.return_value = body
        body.__exit__.return_value = False
        with patch('event.management.commands.compute_image_hashes.requests.get',
                   return_value=body):
            self.assertIsNone(fetch_thumb('https://img.example/huge.jpg'))
        body.iter_content.assert_not_called()
