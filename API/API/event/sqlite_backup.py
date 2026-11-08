"""Verified SQLite copy and a restore that will not clobber newer writes.

Backup uses sqlite3's online backup API (same lesson as purge_past_events,
2026-09-04): a raw cp of a live WAL database can be a torn file.

Restore is allowed only when the live fingerprint still matches the
fingerprint captured immediately after the schema change. If a row landed
in between, we refuse and leave the backup in place for a human.
2026-11-07.
"""
import os
import shutil
import sqlite3
import threading
import time
from pathlib import Path


PREDEPLOY_PREFIX = 'db.sqlite3.predeploy-'
PREDEPLOY_KEEP = 2
MIN_FREE_RATIO = 1.5
MIN_FREE_BYTES = 50 * 1024 * 1024
BACKUP_TIMEOUT_S = 600


class RestoreRefused(Exception):
    """Live database changed after the schema step; automatic restore would
    overwrite those writes."""


def fingerprint(db_path):
    """Counts, max ids, schema_version. Missing tables count as 0."""
    path = str(db_path)
    conn = sqlite3.connect('file:%s?mode=ro' % _uri_path(path), uri=True)
    try:
        def scalar(sql):
            try:
                row = conn.execute(sql).fetchone()
            except sqlite3.OperationalError:
                return 0
            if not row or row[0] is None:
                return 0
            return row[0]

        try:
            sequences = dict(conn.execute(
                'SELECT name, seq FROM sqlite_sequence'))
        except sqlite3.OperationalError:
            sequences = {}
        return {
            'event_count': scalar('SELECT COUNT(*) FROM event_event'),
            'event_max_id': scalar('SELECT MAX(id) FROM event_event'),
            'logs_count': scalar('SELECT COUNT(*) FROM c_admin_logs'),
            'logs_max_id': scalar('SELECT MAX(id) FROM c_admin_logs'),
            'schema_version': scalar('PRAGMA schema_version'),
            'page_count': scalar('PRAGMA page_count'),
            'sequences': sequences,
        }
    finally:
        conn.close()


def take_verified_backup(live_path, backup_dir, timeout_s=BACKUP_TIMEOUT_S):
    """Write a consistent copy next to live, verify quick_check, rotate."""
    d = Path(backup_dir)
    d.mkdir(parents=True, exist_ok=True)
    live = Path(live_path)
    live_name = str(live)
    live_size = live.stat().st_size if live.is_file() else 0

    required = max(int(MIN_FREE_RATIO * live_size), MIN_FREE_BYTES)
    free = shutil.disk_usage(d).free
    if free < required:
        raise RuntimeError(
            'not enough free space for a predeploy copy (%s MB free, need %s MB)'
            % (free // 2 ** 20, required // 2 ** 20))

    for journal in d.glob(PREDEPLOY_PREFIX + '*-journal'):
        Path(str(journal)[:-len('-journal')]).unlink(missing_ok=True)
        journal.unlink(missing_ok=True)

    dest = d / ('%s%s' % (PREDEPLOY_PREFIX, time.strftime('%Y%m%d-%H%M%S')))
    outcome = {}

    def copy():
        try:
            src = sqlite3.connect(live_name, check_same_thread=False)
            dst = sqlite3.connect(str(dest), check_same_thread=False)
            try:
                src.backup(dst, pages=-1)
                outcome['verdict'] = dst.execute(
                    'PRAGMA quick_check').fetchone()[0]
            finally:
                dst.close()
                src.close()
        except Exception as exc:
            outcome['error'] = '%s: %s' % (type(exc).__name__, exc)

    worker = threading.Thread(target=copy, daemon=True)
    worker.start()
    worker.join(timeout_s)

    def discard():
        dest.unlink(missing_ok=True)
        Path(str(dest) + '-journal').unlink(missing_ok=True)

    if worker.is_alive():
        discard()
        raise RuntimeError(
            'predeploy copy did not finish in %ss' % timeout_s)
    if 'error' in outcome:
        discard()
        raise RuntimeError('predeploy copy failed: %s' % outcome['error'])
    verdict = outcome.get('verdict')
    size = dest.stat().st_size if dest.exists() else 0
    if verdict != 'ok' or size == 0 or (live_size and size < 0.9 * live_size):
        discard()
        raise RuntimeError(
            'predeploy copy failed verification (quick_check=%r, size=%s, live=%s)'
            % (verdict, size, live_size))

    copies = sorted(
        (p for p in d.glob(PREDEPLOY_PREFIX + '*')
         if not p.name.endswith('-journal')),
        key=lambda p: p.stat().st_mtime, reverse=True)
    for old in copies[PREDEPLOY_KEEP:]:
        old.unlink()
    return dest


def restore_if_safe(live_path, backup_path, post_change):
    """Replace live with backup only if live still equals post_change.

    post_change is the fingerprint taken immediately after the schema
    step, before any other writer is admitted. A later insert/update
    changes the fingerprint and we refuse rather than drop that row.
    """
    now = fingerprint(live_path)
    if now != post_change:
        raise RestoreRefused(
            'new writes landed after the schema change; automatic restore '
            'refused so they are not overwritten. backup remains at %s'
            % backup_path)
    _replace_with_backup(live_path, backup_path)


def _replace_with_backup(live_path, backup_path):
    live = Path(live_path)
    tmp = Path(str(live) + '.restoring')
    src = sqlite3.connect(str(backup_path), check_same_thread=False)
    dst = sqlite3.connect(str(tmp), check_same_thread=False)
    try:
        src.backup(dst, pages=-1)
        verdict = dst.execute('PRAGMA quick_check').fetchone()[0]
    finally:
        dst.close()
        src.close()
    if verdict != 'ok':
        tmp.unlink(missing_ok=True)
        raise RuntimeError('restored copy failed quick_check: %r' % verdict)
    os.replace(str(tmp), str(live))
    Path(str(live) + '-wal').unlink(missing_ok=True)
    Path(str(live) + '-shm').unlink(missing_ok=True)


def _uri_path(path):
    return os.path.abspath(path).replace('\\', '/')
