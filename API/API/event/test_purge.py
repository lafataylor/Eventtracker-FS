"""The retention policy the owner chose (2026-09-03): events vanish from
sight the day after they happen (already true via the feed filters) and are
PERMANENTLY deleted 30 days after their date. Undated rows and Jan-1
sentinel-dated rows get 90 days from creation instead - a sentinel date IS
the extractor saying "I could not read the date", which is exactly the
misread-and-actually-upcoming case the owner wanted a recovery window for.
"""
import tempfile
import time
from datetime import timedelta
from io import StringIO
from pathlib import Path

from django.core.management import call_command
from django.test import TestCase
from django.utils import timezone

from event.models import BlacklistedLink, Event, EventMatch, Feedback, Venue


def _fresh_backup_dir():
    d = tempfile.mkdtemp()
    Path(d, 'db-backup-now.sqlite3.gz').write_bytes(b'x')
    return d


class PurgeSelectionTests(TestCase):
    def setUp(self):
        self.now = timezone.localtime(timezone.now())

    def _ev(self, name, days_past=None, created_days_ago=0, **kw):
        base = dict(name=name, is_event=True, is_duplicate=False,
                    suppressed=False)
        if days_past is not None:
            base['start_date'] = self.now - timedelta(days=days_past)
        base.update(kw)
        e = Event.objects.create(**base)
        if created_days_ago:
            Event.objects.filter(id=e.id).update(
                created_at=self.now - timedelta(days=created_days_ago))
        return e

    def _run(self, apply=False, **kw):
        out = StringIO()
        args = ['purge_past_events']
        if apply:
            kw.setdefault('backup_dir', _fresh_backup_dir())
            args.append('--apply')
        call_command(*args, stdout=out, **kw)
        return out.getvalue()

    def test_dated_events_delete_at_30_days_not_29(self):
        gone = self._ev('31 days past', days_past=31)
        kept = self._ev('29 days past', days_past=29)
        future = self._ev('upcoming', days_past=-5)
        self._run(apply=True)
        self.assertFalse(Event.objects.filter(id=gone.id).exists())
        self.assertTrue(Event.objects.filter(id=kept.id).exists())
        self.assertTrue(Event.objects.filter(id=future.id).exists())

    def test_undated_rows_get_90_days_from_creation(self):
        gone = self._ev('old undated', created_days_ago=91)
        kept = self._ev('recent undated', created_days_ago=89)
        self._run(apply=True)
        self.assertFalse(Event.objects.filter(id=gone.id).exists())
        self.assertTrue(Event.objects.filter(id=kept.id).exists())

    def test_sentinel_jan_first_dates_are_treated_as_undated(self):
        # Jan 1 is the extractor's could-not-read-the-date fallback: possibly
        # an UPCOMING event with a misread date - the owner's own edge case -
        # so it gets the 90-day-from-creation clock, not the dated one.
        jan1 = timezone.datetime(self.now.year, 1, 1, 12, 0,
                                 tzinfo=self.now.tzinfo)
        kept = Event.objects.create(name='sentinel recent', start_date=jan1,
                                    is_event=True, is_duplicate=False,
                                    suppressed=False)
        gone = Event.objects.create(name='sentinel ancient', start_date=jan1,
                                    is_event=True, is_duplicate=False,
                                    suppressed=False)
        Event.objects.filter(id=gone.id).update(
            created_at=self.now - timedelta(days=91))
        self._run(apply=True)
        self.assertTrue(Event.objects.filter(id=kept.id).exists())
        self.assertFalse(Event.objects.filter(id=gone.id).exists())

    def test_suppressed_dependents_leave_with_their_keeper(self):
        # canonical is SET_NULL: deleting a keeper alone would orphan its
        # hidden twins - the artifact class repaired on 2026-09-02. They are
        # invisible husks whose anchor is going away; they go together.
        keeper = self._ev('old keeper', days_past=40)
        dependent = self._ev('young hidden twin', created_days_ago=5,
                             suppressed=True, is_duplicate=True,
                             canonical=keeper)
        self._run(apply=True)
        self.assertFalse(Event.objects.filter(id=keeper.id).exists())
        self.assertFalse(Event.objects.filter(id=dependent.id).exists())
        self.assertEqual(
            Event.objects.filter(suppressed=True,
                                 canonical__isnull=True).count(), 0)

    def test_dry_run_deletes_nothing_and_reports_counts(self):
        self._ev('purgeable', days_past=45)
        before = Event.objects.count()
        out = self._run(apply=False)
        self.assertEqual(Event.objects.count(), before)
        self.assertIn('DRY RUN', out)
        self.assertIn('dated past 30d: 1', out)

    def test_related_rows_cascade_and_blacklist_survives(self):
        gone = self._ev('with baggage', days_past=40,
                        orig_link='https://ig/p/GONE/')
        kept = self._ev('staying', days_past=-3)
        EventMatch.objects.create(event_a=gone, event_b=kept, score=90,
                                  match_type='fuzzy', status='pending')
        Feedback.objects.create(event=gone, changes='name: x -> y')
        BlacklistedLink.objects.create(url='https://ig/p/GONE/',
                                       reason='ledger row')
        self._run(apply=True)
        self.assertFalse(EventMatch.objects.filter(event_a_id=gone.id).exists())
        self.assertFalse(Feedback.objects.filter(event_id=gone.id).exists())
        self.assertTrue(BlacklistedLink.objects.filter(
            url='https://ig/p/GONE/').exists(),
            'the already-seen ledger must outlive the event or the scraper '
            're-ingests the post')
        self.assertTrue(Event.objects.filter(id=kept.id).exists())

    def test_apply_refuses_without_a_fresh_backup(self):
        self._ev('purgeable', days_past=45)
        stale_dir = tempfile.mkdtemp()
        p = Path(stale_dir, 'db-old.gz'); p.write_bytes(b'x')
        two_days_ago = time.time() - 2 * 86400
        import os
        os.utime(p, (two_days_ago, two_days_ago))
        out = StringIO()
        with self.assertRaises(SystemExit):
            call_command('purge_past_events', '--apply',
                         backup_dir=stale_dir, stdout=out)
        self.assertTrue(Event.objects.filter(name='purgeable').exists())

    def test_batching_deletes_everything(self):
        for i in range(7):
            self._ev(f'old {i}', days_past=35)
        self._run(apply=True, batch_size=3)
        self.assertEqual(Event.objects.filter(name__startswith='old ').count(), 0)
