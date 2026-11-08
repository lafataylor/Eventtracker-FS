"""The prod-copy safety runner must stay off the live database and Django.

These tests drive scripts/run_prod_copy_safety_tests.py the same way the
owner will on AWS: one process, a snapshot path, no Django settings.
2026-11-07.
"""
import hashlib
import os
import sqlite3
import subprocess
import sys
import tempfile
from pathlib import Path

from django.test import SimpleTestCase

from event.test_safe_migrate import _make_prod_shaped


REPO_ROOT = Path(__file__).resolve().parents[3]
RUNNER = REPO_ROOT / 'scripts' / 'run_prod_copy_safety_tests.py'


def _sha256(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b''):
            h.update(chunk)
    return h.hexdigest()


class ProdCopySafetyRunnerTests(SimpleTestCase):
    def setUp(self):
        self.dir = Path(tempfile.mkdtemp())
        self.snapshot = _make_prod_shaped(self.dir / 'snapshot.sqlite3')
        self.live = self.dir / 'live.sqlite3'
        self.live.write_bytes(b'not-the-snapshot')

    def _run(self, *args, **kwargs):
        env = os.environ.copy()
        env.pop('LAFASLIST_PROD_DB_COPY', None)
        return subprocess.run(
            [sys.executable, str(RUNNER), *args],
            cwd=str(self.dir),
            capture_output=True,
            text=True,
            env=env,
            **kwargs)

    def test_runner_file_exists(self):
        self.assertTrue(RUNNER.is_file(), RUNNER)

    def test_roundtrip_and_restore_guard_pass_on_a_copy(self):
        before = _sha256(self.snapshot)
        result = self._run(
            str(self.snapshot), '--live-db', str(self.live))
        self.assertEqual(result.returncode, 0, result.stderr + result.stdout)
        self.assertIn('PASS test_backup_restore_roundtrip_on_the_copy',
                      result.stdout)
        self.assertIn('PASS test_a_write_on_the_copy_blocks_restore',
                      result.stdout)
        self.assertIn('OK: 2 tests passed', result.stdout)
        self.assertEqual(_sha256(self.snapshot), before)

    def test_refuses_the_live_database_path(self):
        result = self._run(
            str(self.live), '--live-db', str(self.live))
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('REFUSED', result.stderr + result.stdout)
        self.assertEqual(self.live.read_bytes(), b'not-the-snapshot')

    def test_refuses_a_missing_snapshot(self):
        missing = self.dir / 'no-such.sqlite3'
        result = self._run(str(missing), '--live-db', str(self.live))
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('REFUSED', result.stderr + result.stdout)

    def test_runner_does_not_import_django_or_secrets(self):
        text = RUNNER.read_text()
        lowered = text.lower()
        for needle in ('django', 'dotenv', 'openai', 'apify', 'firebase',
                       '.env.local'):
            self.assertNotIn(needle, lowered)

    def test_write_guard_on_schema_with_created_at_not_null(self):
        # Production event_event.created_at is datetime NOT NULL with no DB
        # default (Django auto_now_add). The probe insert must fill it; the
        # restore refusal must still fire. Reproduced 2026-11-07 on AWS.
        path = self.dir / 'created-at.sqlite3'
        conn = sqlite3.connect(str(path))
        conn.execute(
            'CREATE TABLE event_event ('
            'id INTEGER PRIMARY KEY AUTOINCREMENT,'
            'name TEXT,'
            'is_event INTEGER,'
            'is_duplicate INTEGER DEFAULT 0,'
            'suppressed INTEGER NOT NULL DEFAULT 0,'
            'created_at datetime NOT NULL)')
        conn.execute(
            'CREATE TABLE c_admin_logs ('
            'id INTEGER PRIMARY KEY AUTOINCREMENT,'
            'scraped_at TEXT)')
        conn.execute(
            "INSERT INTO event_event (name, is_event, created_at) "
            "VALUES ('event-0', 1, '2026-01-01 00:00:00')")
        conn.commit()
        conn.close()
        before = _sha256(path)
        result = self._run(str(path), '--live-db', str(self.live))
        self.assertEqual(result.returncode, 0, result.stderr + result.stdout)
        self.assertIn('PASS test_a_write_on_the_copy_blocks_restore',
                      result.stdout)
        self.assertEqual(_sha256(path), before)
