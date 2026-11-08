"""Backup/restore checks that only ever write a temp copy of a snapshot.

Used by the Django skipped tests and by the standalone runner. Stdlib plus
sqlite_backup; importing this module does not load Django.
2026-11-07.
"""
import hashlib
import os
import shutil
import sqlite3
import sys
import tempfile
from pathlib import Path

from event.sqlite_backup import (
    RestoreRefused,
    fingerprint,
    restore_if_safe,
    take_verified_backup,
)


DEFAULT_LIVE_DB = '/home/ubuntu/EventTracker-API/API/db.sqlite3'
PROBE_NAME = 'probe-row-from-safe-migrate-test'
_BLOCKED_MODULES = (
    'django', 'dotenv', 'openai', 'apify', 'apify_client',
    'firebase_admin', 'pyrebase',
)


def _refuse(msg):
    raise SystemExit('REFUSED: ' + msg)


def _sha256(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b''):
            h.update(chunk)
    return h.hexdigest()


def _assert_isolated():
    for name in sys.modules:
        root = name.split('.')[0]
        if root in _BLOCKED_MODULES:
            _refuse('loaded %s; this runner must stay isolated' % root)


def _same_file(a, b):
    try:
        return os.path.samefile(a, b)
    except OSError:
        return os.path.realpath(a) == os.path.realpath(b)


def refuse_if_live(snapshot, live_db=DEFAULT_LIVE_DB):
    snap = Path(snapshot)
    if not snap.is_file():
        _refuse('snapshot is not a file: %s' % snapshot)
    if _same_file(snap, live_db):
        _refuse('snapshot path is the live database')
    if _same_file(snap, DEFAULT_LIVE_DB):
        _refuse('snapshot path is the live database')


def copy_snapshot_for_test(snapshot, dest_dir):
    """Read the snapshot, write a working copy. Never open the snapshot for write."""
    dest_dir = Path(dest_dir)
    dest_dir.mkdir(parents=True, exist_ok=True)
    dest = dest_dir / 'prod-copy.sqlite3'
    shutil.copy2(snapshot, dest)
    dest.chmod(0o644)
    if _same_file(dest, snapshot) or _same_file(dest, DEFAULT_LIVE_DB):
        _refuse('working copy resolved to the snapshot or the live database')
    return dest


def run_backup_restore_roundtrip(copy):
    copy = Path(copy)
    backups = copy.parent / 'backups-roundtrip'
    backups.mkdir(exist_ok=True)
    before = fingerprint(copy)
    bak = take_verified_backup(copy, backups)
    if fingerprint(copy) != before:
        raise AssertionError('backup changed counts on the working copy')
    restore_if_safe(copy, bak, post_change=fingerprint(copy))
    if fingerprint(copy)['event_count'] != before['event_count']:
        raise AssertionError('restore changed event_count on the working copy')


def run_write_blocks_restore(copy):
    copy = Path(copy)
    backups = copy.parent / 'backups-write'
    backups.mkdir(exist_ok=True)
    bak = take_verified_backup(copy, backups)
    post = fingerprint(copy)
    conn = sqlite3.connect(str(copy))
    conn.execute(
        "INSERT INTO event_event (name, is_event, is_duplicate, suppressed) "
        "VALUES (?, 1, 0, 0)",
        (PROBE_NAME,))
    conn.commit()
    conn.close()
    try:
        restore_if_safe(copy, bak, post_change=post)
    except RestoreRefused:
        pass
    else:
        raise AssertionError('expected RestoreRefused after a write on the copy')
    still = sqlite3.connect(str(copy)).execute(
        'SELECT COUNT(*) FROM event_event WHERE name=?',
        (PROBE_NAME,)).fetchone()[0]
    if still != 1:
        raise AssertionError('probe row missing after refused restore')


def run_all(snapshot, live_db=DEFAULT_LIVE_DB):
    """Run both copy-only checks. Returns 0. Refuses the live database path."""
    _assert_isolated()
    refuse_if_live(snapshot, live_db=live_db)
    before_hash = _sha256(snapshot)
    work = tempfile.mkdtemp(prefix='prod-copy-safety-')
    try:
        run_backup_restore_roundtrip(copy_snapshot_for_test(
            snapshot, Path(work) / 't1'))
        print('PASS test_backup_restore_roundtrip_on_the_copy')
        run_write_blocks_restore(copy_snapshot_for_test(
            snapshot, Path(work) / 't2'))
        print('PASS test_a_write_on_the_copy_blocks_restore')
        print('OK: 2 tests passed')
    finally:
        shutil.rmtree(work, ignore_errors=True)
    if _sha256(snapshot) != before_hash:
        _refuse('snapshot bytes changed; aborting')
    _assert_isolated()
    return 0
