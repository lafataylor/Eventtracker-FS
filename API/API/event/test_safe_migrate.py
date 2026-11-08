"""safe_migrate: verified backup, additive apply, restore that will not
clobber writes that landed after the backup.

These tests use a file-backed SQLite copy shaped like production (same
apps through event.0011, WAL, many rows). They never open the live
server database. If LAFASLIST_PROD_DB_COPY points at a snapshot kept
outside the repo, that file is copied first and the same cases run
against the copy.
"""
import os
import shutil
import sqlite3
import tempfile
from pathlib import Path
from unittest import skipUnless

from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import SimpleTestCase, TransactionTestCase
from django.utils import timezone

from event.models import Event
from event.safe_migrate import run_safe_migrate
from event.sqlite_backup import (
    RestoreRefused,
    fingerprint,
    restore_if_safe,
    take_verified_backup,
)


def _tmp():
    return Path(tempfile.mkdtemp())


def _connect(path):
    conn = sqlite3.connect(str(path))
    conn.execute('PRAGMA journal_mode=WAL')
    return conn


def _make_prod_shaped(path, events=200, logs=400):
    """A stand-alone SQLite file with production table names and WAL.

    Built without Django so the suite does not point settings at it.
    Schema is the live event_event / c_admin_logs shape used by the
    fingerprint (counts + max id), not a byte-for-byte server dump.
    """
    path = Path(path)
    if path.exists():
        path.unlink()
    conn = _connect(path)
    conn.execute(
        'CREATE TABLE event_event ('
        'id INTEGER PRIMARY KEY AUTOINCREMENT,'
        'name TEXT,'
        'is_event INTEGER,'
        'is_duplicate INTEGER DEFAULT 0,'
        'suppressed INTEGER DEFAULT 0)')
    conn.execute(
        'CREATE TABLE c_admin_logs ('
        'id INTEGER PRIMARY KEY AUTOINCREMENT,'
        'scraped_at TEXT,'
        'status TEXT,'
        'message TEXT)')
    conn.execute(
        'CREATE TABLE django_migrations ('
        'id INTEGER PRIMARY KEY AUTOINCREMENT,'
        'app TEXT, name TEXT, applied TEXT)')
    conn.execute(
        "INSERT INTO django_migrations (app, name, applied) "
        "VALUES ('event', '0011_event_start_date_index', '2026-09-05')")
    conn.executemany(
        'INSERT INTO event_event (name, is_event) VALUES (?, 1)',
        [('event-%d' % i,) for i in range(events)])
    conn.executemany(
        'INSERT INTO c_admin_logs (scraped_at, status) VALUES (?, ?)',
        [('2026-11-07 21:01:00', 'Completed') for _ in range(logs)])
    conn.commit()
    conn.close()
    return path


def _maybe_prod_snapshot_copy(dest_dir):
    src = os.environ.get('LAFASLIST_PROD_DB_COPY', '').strip()
    if not src:
        return None
    original = Path(src)
    if not original.is_file():
        raise AssertionError(
            'LAFASLIST_PROD_DB_COPY is set but is not a file: %r' % src)
    dest = Path(dest_dir) / 'prod-copy.sqlite3'
    # Copy only. Never open the original for write.
    shutil.copy2(original, dest)
    dest.chmod(0o644)
    return dest


class FingerprintAndRestoreTests(SimpleTestCase):
    def setUp(self):
        self.dir = _tmp()
        self.live = _make_prod_shaped(self.dir / 'live.sqlite3')
        self.backups = self.dir / 'backups'
        self.backups.mkdir()

    def test_backup_verifies_and_does_not_change_counts(self):
        before = fingerprint(self.live)
        copy = take_verified_backup(self.live, self.backups)
        self.assertTrue(copy.is_file())
        self.assertEqual(fingerprint(self.live), before)
        self.assertEqual(fingerprint(copy)['event_count'], before['event_count'])
        self.assertEqual(fingerprint(copy)['logs_count'], before['logs_count'])

    def test_restore_puts_the_pre_change_rows_back(self):
        copy = take_verified_backup(self.live, self.backups)
        conn = _connect(self.live)
        conn.execute("ALTER TABLE event_event ADD COLUMN image_dhash TEXT")
        conn.execute("INSERT INTO event_event (name, is_event) VALUES ('new', 1)")
        conn.commit()
        conn.close()
        # Simulate: the INSERT is the "migrate window" change we captured
        # as post_change. Restore is safe only if nothing else landed.
        post = fingerprint(self.live)
        restore_if_safe(self.live, copy, post_change=post)
        after = fingerprint(self.live)
        self.assertEqual(after['event_count'], fingerprint(copy)['event_count'])
        cols = [r[1] for r in sqlite3.connect(str(self.live)).execute(
            'PRAGMA table_info(event_event)')]
        self.assertNotIn('image_dhash', cols)

    def test_restore_refuses_when_a_write_landed_after_the_change(self):
        copy = take_verified_backup(self.live, self.backups)
        conn = _connect(self.live)
        conn.execute("ALTER TABLE event_event ADD COLUMN image_dhash TEXT")
        conn.commit()
        conn.close()
        post = fingerprint(self.live)
        conn = _connect(self.live)
        conn.execute("INSERT INTO event_event (name, is_event) VALUES ('late', 1)")
        conn.commit()
        conn.close()
        with self.assertRaises(RestoreRefused) as ctx:
            restore_if_safe(self.live, copy, post_change=post)
        self.assertIn('new writes', str(ctx.exception).lower())
        # The late row is still there: we did not clobber it.
        late = sqlite3.connect(str(self.live)).execute(
            "SELECT COUNT(*) FROM event_event WHERE name='late'").fetchone()[0]
        self.assertEqual(late, 1)
        # The backup file remains for a human.
        self.assertTrue(copy.is_file())


class ProdShapedMigrateRecoveryTests(SimpleTestCase):
    """Full apply / fail / restore cycle on a production-shaped file copy."""

    def setUp(self):
        self.dir = _tmp()
        self.live = _make_prod_shaped(self.dir / 'live.sqlite3',
                                      events=2000, logs=5000)
        self.backups = self.dir / 'backups'
        self.backups.mkdir()

    def _cols(self):
        return [r[1] for r in sqlite3.connect(str(self.live)).execute(
            'PRAGMA table_info(event_event)')]

    def test_successful_addcolumn_keeps_every_row(self):
        before = fingerprint(self.live)

        def apply():
            conn = sqlite3.connect(str(self.live))
            conn.execute('ALTER TABLE event_event ADD COLUMN image_dhash TEXT')
            conn.commit()
            conn.close()

        run_safe_migrate(backup_dir=str(self.backups), writers_fenced=True,
                         apply_fn=apply, live_path=self.live)
        after = fingerprint(self.live)
        self.assertEqual(after['event_count'], before['event_count'])
        self.assertEqual(after['logs_count'], before['logs_count'])
        self.assertIn('image_dhash', self._cols())

    def test_failed_apply_restores_when_no_late_writes(self):
        before = fingerprint(self.live)

        def boom():
            conn = sqlite3.connect(str(self.live))
            conn.execute('ALTER TABLE event_event ADD COLUMN image_dhash TEXT')
            conn.commit()
            conn.close()
            raise RuntimeError('migrate exploded')

        with self.assertRaises(RuntimeError):
            run_safe_migrate(backup_dir=str(self.backups), writers_fenced=True,
                             apply_fn=boom, live_path=self.live)
        self.assertEqual(fingerprint(self.live)['event_count'],
                         before['event_count'])
        self.assertNotIn('image_dhash', self._cols())

    def test_unfenced_apply_is_refused_before_a_backup(self):
        def apply():
            raise AssertionError('must not run')

        with self.assertRaises(CommandError) as ctx:
            run_safe_migrate(backup_dir=str(self.backups), writers_fenced=False,
                             apply_fn=apply, live_path=self.live)
        self.assertIn('fenced', str(ctx.exception))
        self.assertEqual(list(self.backups.glob('db.sqlite3.predeploy-*')), [])


class SafeMigrateCommandTests(TransactionTestCase):
    # TransactionTestCase: sqlite backup waits forever behind TestCase's
    # wrapping transaction (same reason as test_purge.py, 2026-09-04).
    def setUp(self):
        self.dir = _tmp()
        self.backups = self.dir / 'backups'
        self.backups.mkdir()
        Event.objects.create(
            name='keeper', is_event=True, is_duplicate=False,
            suppressed=False, start_date=timezone.now())

    def test_nothing_to_apply_is_a_no_op(self):
        n = Event.objects.count()
        call_command('safe_migrate', backup_dir=str(self.backups),
                     writers_fenced=True)
        self.assertEqual(Event.objects.count(), n)
        self.assertEqual(list(self.backups.glob('db.sqlite3.predeploy-*')), [])

    def test_unapproved_pending_plan_stops_without_a_backup(self):
        # Inject a pending risky migration by asking the command to classify
        # a plan it must refuse. The command exposes --plan-file for tests.
        plan = self.dir / 'risky.py'
        plan.write_text(
            'from django.db import migrations\n'
            'class Migration(migrations.Migration):\n'
            '    AUTO_APPLY = True\n'
            '    operations = [migrations.RemoveField('
            'model_name="event", name="name")]\n')
        n = Event.objects.count()
        with self.assertRaises(CommandError) as ctx:
            call_command('safe_migrate', backup_dir=str(self.backups),
                         writers_fenced=True, plan_file=str(plan))
        self.assertIn('RemoveField', str(ctx.exception))
        self.assertEqual(Event.objects.count(), n)
        self.assertEqual(list(self.backups.glob('db.sqlite3.predeploy-*')), [])


@skipUnless(os.environ.get('LAFASLIST_PROD_DB_COPY'),
            'set LAFASLIST_PROD_DB_COPY to a snapshot kept outside the repo')
class RealProdSnapshotCopyTests(SimpleTestCase):
    """Read-only toward the snapshot: we copy it, then only touch the copy."""

    def setUp(self):
        self.dir = _tmp()
        self.copy = _maybe_prod_snapshot_copy(self.dir)
        self.backups = self.dir / 'backups'
        self.backups.mkdir()

    def test_backup_restore_roundtrip_on_the_copy(self):
        before = fingerprint(self.copy)
        bak = take_verified_backup(self.copy, self.backups)
        self.assertEqual(fingerprint(self.copy), before)
        restore_if_safe(self.copy, bak, post_change=fingerprint(self.copy))
        self.assertEqual(fingerprint(self.copy)['event_count'],
                         before['event_count'])

    def test_a_write_on_the_copy_blocks_restore(self):
        bak = take_verified_backup(self.copy, self.backups)
        post = fingerprint(self.copy)
        conn = sqlite3.connect(str(self.copy))
        conn.execute(
            "INSERT INTO event_event (name, is_event, is_duplicate, suppressed) "
            "VALUES ('probe-row-from-safe-migrate-test', 1, 0, 0)")
        conn.commit()
        conn.close()
        with self.assertRaises(RestoreRefused):
            restore_if_safe(self.copy, bak, post_change=post)
        still = sqlite3.connect(str(self.copy)).execute(
            "SELECT COUNT(*) FROM event_event "
            "WHERE name='probe-row-from-safe-migrate-test'").fetchone()[0]
        self.assertEqual(still, 1)
