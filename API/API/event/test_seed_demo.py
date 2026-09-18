"""`seed_demo_events` gives a fresh local checkout something to show.

A new clone starts with an empty database, so the site renders "No Events
Found" on every page and there is nothing to click on. The owner's first
session with an AI agent (2026-09-18) needs a site that looks like the real
one. The rows are made up, clearly labelled, and only ever go into a local
sqlite file.
"""
import os
from unittest import mock

from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import TestCase
from django.utils import timezone

from .models import Event


@mock.patch.dict(os.environ, {'EVENT_API_HOST': 'http://127.0.0.1:8009/'})
class SeedDemoEventsTests(TestCase):
    def test_refuses_unless_the_api_host_is_this_machine(self):
        # The production server never sets EVENT_API_HOST; a dev checkout
        # always does (scripts/dev_setup.sh). That is the whole guard.
        with mock.patch.dict(os.environ, {}, clear=True):
            with self.assertRaises(CommandError):
                call_command('seed_demo_events')
        self.assertEqual(Event.objects.count(), 0)

    def test_creates_upcoming_visible_events_in_every_city(self):
        call_command('seed_demo_events')
        demo = Event.objects.filter(shortcode__startswith='DEMO')
        self.assertGreaterEqual(demo.count(), 8)
        for e in demo:
            self.assertGreater(e.start_date, timezone.now())
            self.assertTrue(e.is_event)
            self.assertFalse(e.is_duplicate)
            self.assertFalse(e.suppressed)
        cities = {e.venue.city for e in demo}
        self.assertEqual(cities, {'Mexico City', 'Los Angeles', 'Berlin', 'Bali'})

    def test_running_twice_does_not_duplicate(self):
        call_command('seed_demo_events')
        n = Event.objects.count()
        call_command('seed_demo_events')
        self.assertEqual(Event.objects.count(), n)

    def test_demo_rows_appear_in_the_public_feed(self):
        call_command('seed_demo_events')
        today = timezone.localdate()
        res = self.client.get('/v1/event/date/range/', {
            'start': today.strftime('%Y-%m-%d'),
            'end': (today.replace(day=1) + timezone.timedelta(days=62)).strftime('%Y-%m-%d')})
        names = {r['name'] for r in res.json()['data']}
        self.assertTrue(any(n.startswith('Demo:') for n in names))
