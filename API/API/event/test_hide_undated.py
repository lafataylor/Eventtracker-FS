"""One-off cleanup for the dateless rows already saved as events.

The ingestion rule (c_admin.post_ingest._hide_undated_events) stops new ones;
this command applies the same rule to rows that are already in the database.
Dry run by default; --apply writes. Hides (is_event=False), never deletes.
"""
from datetime import timedelta
from io import StringIO

from django.core.management import call_command
from django.test import TestCase
from django.utils import timezone

from .models import Event


class HideUndatedEventsTests(TestCase):
    def setUp(self):
        self.undated = Event.objects.create(name='no dates', is_event=True)
        self.unclassified_undated = Event.objects.create(name='never classified', is_event=None)
        self.ends_only = Event.objects.create(name='ends only', is_event=True,
                                              end_date=timezone.now() + timedelta(days=3))
        self.dated = Event.objects.create(name='dated', is_event=True,
                                          start_date=timezone.now() + timedelta(days=1))

    def _flags(self):
        return {e.name: Event.objects.get(id=e.id).is_event
                for e in (self.undated, self.unclassified_undated, self.ends_only, self.dated)}

    def test_dry_run_reports_and_writes_nothing(self):
        out = StringIO()
        call_command('hide_undated_events', stdout=out)
        self.assertIn('2', out.getvalue())
        self.assertEqual(self._flags(), {'no dates': True, 'never classified': None,
                                         'ends only': True, 'dated': True})

    def test_apply_hides_only_rows_with_neither_date(self):
        call_command('hide_undated_events', '--apply', stdout=StringIO())
        self.assertEqual(self._flags(), {'no dates': False, 'never classified': False,
                                         'ends only': True, 'dated': True})

    def test_apply_is_idempotent(self):
        call_command('hide_undated_events', '--apply', stdout=StringIO())
        out = StringIO()
        call_command('hide_undated_events', '--apply', stdout=out)
        self.assertIn('0', out.getvalue())
