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
from django.test import TransactionTestCase
from django.utils import timezone

from event.models import BlacklistedLink, Event, EventMatch, Feedback, Venue


def _fresh_backup_dir():
    return tempfile.mkdtemp()


class PurgeSelectionTests(TransactionTestCase):
    # TransactionTestCase on purpose: TestCase wraps each test in an open
    # write transaction, and sqlite3's backup API waits forever behind one.
    # These tests must run the way the cron does - autocommit.
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

    def test_apply_writes_a_verified_copy_that_still_holds_the_purged_row(self):
        # the copy is taken BEFORE deletion, so it is the undo for this run
        import sqlite3
        gone = self._ev('about to be purged', days_past=45)
        d = _fresh_backup_dir()
        self._run(apply=True, backup_dir=d)
        copies = sorted(Path(d).glob('db.sqlite3.prepurge-*'))
        self.assertEqual(len(copies), 1)
        self.assertFalse(Event.objects.filter(id=gone.id).exists())
        con = sqlite3.connect(str(copies[0]))
        try:
            self.assertEqual(con.execute('PRAGMA quick_check').fetchone()[0], 'ok')
            held = con.execute('SELECT COUNT(*) FROM event_event WHERE id=?',
                               (gone.id,)).fetchone()[0]
        finally:
            con.close()
        self.assertEqual(held, 1, 'the pre-purge copy must contain the row '
                                  'that was then deleted')

    def test_apply_refuses_when_disk_is_short_and_deletes_nothing(self):
        import collections
        from unittest import mock
        self._ev('purgeable', days_past=45)
        Usage = collections.namedtuple('usage', 'total used free')
        with mock.patch('shutil.disk_usage',
                        return_value=Usage(10**12, 10**12 - 2**20, 2**20)):
            with self.assertRaises(SystemExit):
                call_command('purge_past_events', '--apply',
                             backup_dir=_fresh_backup_dir(), stdout=StringIO())
        self.assertTrue(Event.objects.filter(name='purgeable').exists())

    def test_prepurge_copies_rotate_to_two(self):
        import os
        d = _fresh_backup_dir()
        for i, name in enumerate(('db.sqlite3.prepurge-20260101-000000',
                                  'db.sqlite3.prepurge-20260102-000000')):
            p = Path(d, name); p.write_bytes(b'old')
            t = time.time() - (10 - i) * 86400
            os.utime(p, (t, t))
        self._ev('purgeable', days_past=45)
        self._run(apply=True, backup_dir=d)
        remaining = sorted(Path(d).glob('db.sqlite3.prepurge-*'))
        # yesterday's copy must survive today's run: the undo window for the
        # 41k-row first run is not one day
        self.assertEqual(len(remaining), 2)
        self.assertFalse(any('20260101' in p.name for p in remaining))

    def test_a_stray_file_in_the_backup_dir_is_not_mistaken_for_a_backup(self):
        # review finding: the previous check accepted ANY newest file as proof
        # of a backup; now the command always writes and verifies its own
        d = _fresh_backup_dir()
        Path(d, 'README').write_bytes(b'')
        self._ev('purgeable', days_past=45)
        self._run(apply=True, backup_dir=d)
        self.assertEqual(len(list(Path(d).glob('db.sqlite3.prepurge-*'))), 1)

    def test_twins_are_deleted_before_keepers_so_a_crash_leaves_no_husk(self):
        # review finding: ids were deleted in id order, so a keeper could die
        # in an earlier batch than its twin; SET_NULL then left the twin a
        # `suppressed, canonical=NULL` husk that a re-run cannot recognise.
        from unittest import mock
        from event.management.commands.purge_past_events import Command
        keeper = self._ev('old keeper', days_past=40)          # lower id
        twin = self._ev('hidden twin', created_days_ago=5,     # higher id
                        suppressed=True, is_duplicate=True, canonical=keeper)
        self.assertLess(keeper.id, twin.id)

        def die_after_first_batch(self_, index):
            if index == 0:
                raise RuntimeError('simulated crash between batches')
        with mock.patch.object(Command, '_after_batch', die_after_first_batch):
            with self.assertRaises(RuntimeError):
                self._run(apply=True, batch_size=1)
        # batch 0 was the twin, not the keeper; nothing is orphaned
        self.assertFalse(Event.objects.filter(id=twin.id).exists())
        self.assertTrue(Event.objects.filter(id=keeper.id).exists())
        self.assertEqual(Event.objects.filter(suppressed=True,
                                              canonical__isnull=True).count(), 0)
        # and a re-run finishes the job
        self._run(apply=True)
        self.assertFalse(Event.objects.filter(id=keeper.id).exists())

    def test_twin_chains_are_pulled_in_to_any_depth(self):
        keeper = self._ev('old keeper', days_past=40)
        mid = self._ev('mid twin', created_days_ago=3, suppressed=True,
                       is_duplicate=True, canonical=keeper)
        leaf = self._ev('leaf twin', created_days_ago=3, suppressed=True,
                        is_duplicate=True, canonical=mid)
        self._run(apply=True)
        for e in (keeper, mid, leaf):
            self.assertFalse(Event.objects.filter(id=e.id).exists())
        self.assertEqual(Event.objects.filter(suppressed=True,
                                              canonical__isnull=True).count(), 0)

    def test_refuses_while_the_pipeline_is_writing(self):
        from c_admin.models import Logs
        Logs.objects.create(status='Step Completed',
                            scraped_at=timezone.now().strftime('%Y-%m-%d %H:%M:%S'))
        self._ev('purgeable', days_past=45)
        with self.assertRaises(SystemExit):
            call_command('purge_past_events', '--apply',
                         backup_dir=_fresh_backup_dir(), stdout=StringIO())
        self.assertTrue(Event.objects.filter(name='purgeable').exists())

    def test_runs_once_the_pipeline_has_been_idle(self):
        from c_admin.models import Logs
        old = timezone.now() - timedelta(hours=3)
        Logs.objects.create(status='Completed',
                            scraped_at=old.strftime('%Y-%m-%d %H:%M:%S'))
        gone = self._ev('purgeable', days_past=45)
        self._run(apply=True)
        self.assertFalse(Event.objects.filter(id=gone.id).exists())

    def test_backup_timeout_refuses_and_leaves_no_partial_file(self):
        from unittest import mock
        from event.management.commands import purge_past_events as mod
        d = _fresh_backup_dir()
        self._ev('purgeable', days_past=45)
        def slow(self_, src, dst):
            time.sleep(1.0)
        with mock.patch.object(mod, 'BACKUP_TIMEOUT_S', 0.05), \
             mock.patch.object(mod.Command, '_run_backup', slow):
            with self.assertRaises(SystemExit):
                call_command('purge_past_events', '--apply', backup_dir=d,
                             stdout=StringIO())
        self.assertEqual(list(Path(d).glob('db.sqlite3.prepurge-*')), [])
        self.assertTrue(Event.objects.filter(name='purgeable').exists())

    def test_refuses_when_free_disk_is_under_1_5x_the_database(self):
        # exercised against a real FILE database: in the suite the live DB
        # is in-memory, so live_size is 0 and only the 50 MB floor fires
        import collections, sqlite3
        from unittest import mock
        from event.management.commands.purge_past_events import Command
        big = Path(tempfile.mkdtemp(), 'live.sqlite3')
        con = sqlite3.connect(str(big))
        con.execute('CREATE TABLE t(x)')
        con.executemany('INSERT INTO t VALUES (?)', [('x' * 1000,)] * 2000)
        con.commit(); con.close()
        live_size = big.stat().st_size
        Usage = collections.namedtuple('usage', 'total used free')
        self._ev('purgeable', days_past=45)
        from event.management.commands import purge_past_events as mod
        # zero the absolute floor so the RATIO is the binding constraint; the
        # floor has its own test
        with mock.patch.object(Command, '_live_db_path', lambda self_: str(big)), \
             mock.patch.object(mod, 'MIN_FREE_BYTES', 0), \
             mock.patch('shutil.disk_usage',
                        return_value=Usage(10**12, 0, int(1.2 * live_size))):
            with self.assertRaises(SystemExit):
                call_command('purge_past_events', '--apply',
                             backup_dir=_fresh_backup_dir(), stdout=StringIO())
        self.assertTrue(Event.objects.filter(name='purgeable').exists())

    def test_sentinel_is_judged_on_the_local_calendar_date(self):
        # a Jan-1 evening in LA is Jan 2 in UTC; judging on the UTC date would
        # miss the sentinel branch and purge the row 30 days after Jan 1
        import zoneinfo
        la = zoneinfo.ZoneInfo('America/Los_Angeles')
        jan1_evening = timezone.datetime(self.now.year, 1, 1, 20, 0, tzinfo=la)
        kept = Event.objects.create(name='sentinel evening', start_date=jan1_evening,
                                    is_event=True, is_duplicate=False,
                                    suppressed=False)
        self._run(apply=True)
        self.assertTrue(Event.objects.filter(id=kept.id).exists())

    def test_refuses_inside_a_transaction_instead_of_hanging(self):
        # the failure mode that hung this suite: an open write transaction on
        # the source makes sqlite3.backup() retry BUSY forever
        from django.core.management import CommandError
        from django.db import transaction
        self._ev('purgeable', days_past=45)
        with self.assertRaises(CommandError):
            with transaction.atomic():
                call_command('purge_past_events', '--apply',
                             backup_dir=_fresh_backup_dir(), stdout=StringIO())
        self.assertTrue(Event.objects.filter(name='purgeable').exists())

    def test_batching_deletes_everything(self):
        for i in range(7):
            self._ev(f'old {i}', days_past=35)
        self._run(apply=True, batch_size=3)
        self.assertEqual(Event.objects.filter(name__startswith='old ').count(), 0)
