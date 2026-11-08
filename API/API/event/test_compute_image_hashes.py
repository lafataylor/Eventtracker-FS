"""Fill image_dhash on events that have a flyer URL and no fingerprint yet.

The scraper is not touched: a nightly command fetches orig_thumb (public
files, ~300 a night) and stores dhash. Tests never hit the network.
"""
from unittest.mock import patch

from django.core.management import call_command
from django.test import TestCase

from c_admin.models import Account
from event.imagehash import dhash
from event.models import Event
from event.test_imagehash import image_to_jpeg_bytes, make_flyer_image


class ComputeImageHashesTests(TestCase):
    def setUp(self):
        self.acct = Account.objects.create(user='hash_acct', forLocation='Berlin')
        self.jpeg = image_to_jpeg_bytes(make_flyer_image(seed=42), quality=95)
        self.expected = dhash(self.jpeg)

    def _ev(self, post, thumb='https://img.example/%s.jpg', hashed=None):
        return Event.objects.create(
            name=post, shortcode=post, poster=self.acct, is_event=True,
            orig_thumb=(thumb % post) if '%s' in (thumb or '') else thumb,
            image_dhash=hashed)

    def test_unhashed_event_gets_a_dhash_from_its_thumb_bytes(self):
        ev = self._ev('NEW1')
        with patch('event.management.commands.compute_image_hashes.fetch_thumb',
                   return_value=self.jpeg):
            call_command('compute_image_hashes')
        ev.refresh_from_db()
        self.assertEqual(ev.image_dhash, self.expected)

    def test_already_hashed_events_are_not_refetched(self):
        ev = self._ev('OLD1', hashed='ffffffffffffffff')
        with patch('event.management.commands.compute_image_hashes.fetch_thumb') as fetch:
            call_command('compute_image_hashes')
            fetch.assert_not_called()
        ev.refresh_from_db()
        self.assertEqual(ev.image_dhash, 'ffffffffffffffff')

    def test_a_missing_thumb_is_skipped(self):
        ev = self._ev('NOTHUMB', thumb=None)
        call_command('compute_image_hashes')
        ev.refresh_from_db()
        self.assertIsNone(ev.image_dhash)

    def test_undecodable_bytes_leave_the_row_unhashed(self):
        ev = self._ev('BAD1')
        with patch('event.management.commands.compute_image_hashes.fetch_thumb',
                   return_value=b'not an image'):
            call_command('compute_image_hashes')
        ev.refresh_from_db()
        self.assertIsNone(ev.image_dhash)

    def test_dry_run_writes_nothing(self):
        ev = self._ev('DRY1')
        with patch('event.management.commands.compute_image_hashes.fetch_thumb',
                   return_value=self.jpeg):
            call_command('compute_image_hashes', dry_run=True)
        ev.refresh_from_db()
        self.assertIsNone(ev.image_dhash)
