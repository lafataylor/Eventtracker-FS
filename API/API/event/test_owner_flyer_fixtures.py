"""Owner golden flyers for similar-image / duplicate detection.

Crops live under event/testdata/ (split from Project store media/ pairs).
No Apify / OpenAI / network — hashes are computed from the local JPEGs.
"""
import os
from datetime import datetime, time, timedelta

from django.core.management import call_command
from django.test import TestCase
from django.utils import timezone

from c_admin.models import Account
from event.imagehash import dhash, hamming
from event.models import Event, EventMatch, Venue
from event.series import collapse_series

TESTDATA = os.path.join(os.path.dirname(__file__), 'testdata')


def _jpeg_bytes(name):
    with open(os.path.join(TESTDATA, name), 'rb') as f:
        return f.read()


class OwnerFlyerFixtureTests(TestCase):
    def setUp(self):
        self.day = timezone.localdate() + timedelta(days=6)
        self.acct = Account.objects.create(user='fixture_acct', forLocation='LA')

    def _ev(self, name, post, venue, image_dhash, orig_thumb=None, day=None, **kw):
        when = timezone.make_aware(datetime.combine(day or self.day, time(21, 0)))
        return Event.objects.create(
            name=name, shortcode=post, start_date=when,
            orig_link='https://www.instagram.com/p/%s/' % post,
            poster=self.acct, is_event=True, is_duplicate=False, suppressed=False,
            image_dhash=image_dhash,
            orig_thumb=orig_thumb or ('https://img.example/%s.jpg' % post),
            venue=Venue.objects.create(name=venue, address='100 Main', city='LA'),
            **kw)

    def test_jazz_night_crop_hashes_are_near_not_identical(self):
        # Measured 2026-11-17 on similar-jazz-night-pair.png halves: ~34 bits.
        left = dhash(_jpeg_bytes('jazz-left.jpg'))
        right = dhash(_jpeg_bytes('jazz-right.jpg'))
        distance = hamming(left, right)
        self.assertGreater(distance, 6)
        self.assertLessEqual(distance, 34)

    def test_wegood_crop_hashes_are_near_not_identical(self):
        # Measured 2026-11-17 on similar-wegood-pair.png halves: ~28 bits.
        left = dhash(_jpeg_bytes('wegood-left.jpg'))
        right = dhash(_jpeg_bytes('wegood-right.jpg'))
        distance = hamming(left, right)
        self.assertGreater(distance, 6)
        self.assertLessEqual(distance, 34)

    def test_jazz_night_real_hashes_queue_at_one_room(self):
        left = dhash(_jpeg_bytes('jazz-left.jpg'))
        right = dhash(_jpeg_bytes('jazz-right.jpg'))
        a = self._ev('Jazz Nights', 'JAZZ1', 'Zulua', left)
        b = self._ev('Zulua Group, David Cultura', 'JAZZ2', 'Zulua', right)
        call_command('detect_duplicates', '--fuzzy', '--auto-merge-threshold', '95')
        self.assertTrue(
            EventMatch.objects.filter(
                event_a__in=[a, b], event_b__in=[a, b], status='pending').exists())
        self.assertEqual(Event.objects.filter(suppressed=True).count(), 0)

    def test_wegood_real_hashes_queue_without_merging(self):
        left = dhash(_jpeg_bytes('wegood-left.jpg'))
        right = dhash(_jpeg_bytes('wegood-right.jpg'))
        a = self._ev('Care without a cover charge', 'WG1', 'The Walkgood Yard', left)
        b = self._ev('Room to breathe at the yard', 'WG2', 'The Walkgood Yard', right)
        call_command('detect_duplicates', '--fuzzy', '--auto-merge-threshold', '95')
        self.assertTrue(
            EventMatch.objects.filter(
                event_a__in=[a, b], event_b__in=[a, b], status='pending').exists())
        self.assertEqual(Event.objects.filter(suppressed=True).count(), 0)

    def test_lodge_room_identical_thumb_is_one_feed_card(self):
        thumb = 'https://img.example/lodge-room-november-calendar.jpg'
        post = 'LODGECAL'
        rows = [
            self._ev('Emma Ruth Rundle', post, 'Lodge Room', 'aaaaaaaaaaaaaaaa',
                     orig_thumb=thumb, day=self.day),
            self._ev('Train Breaks Down', post, 'Lodge Room', 'aaaaaaaaaaaaaaaa',
                     orig_thumb=thumb, day=self.day + timedelta(days=3)),
            self._ev('Malibu With Two Abyss', post, 'Lodge Room', 'aaaaaaaaaaaaaaaa',
                     orig_thumb=thumb, day=self.day + timedelta(days=7)),
        ]
        kept = collapse_series(rows)
        self.assertEqual(len(kept), 1)
        self.assertEqual(len(kept[0].series_ids), 3)
