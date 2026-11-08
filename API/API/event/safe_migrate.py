"""Apply pending AUTO_APPLY migrations with a verified backup and a
restore that refuses if newer rows appeared.

Caller must stop writers (gunicorn + the db-maint lock) and pass
writers_fenced=True. The fingerprint is the real guard; the flag only
stops us from migrating while the site is still writing. 2026-11-07.
"""
from pathlib import Path

from django.core.management import call_command
from django.core.management.base import CommandError
from django.db import close_old_connections, connection

from event.migration_safety import classify_source
from event.sqlite_backup import (
    RestoreRefused,
    fingerprint,
    restore_if_safe,
    take_verified_backup,
)


def run_safe_migrate(backup_dir, writers_fenced, plan_file=None,
                     apply_fn=None, live_path=None, stdout=None):
    """Return 'nothing to apply' or 'applied'. Raise CommandError to stop."""
    def say(msg):
        if stdout is not None:
            stdout.write(msg)

    if plan_file:
        text = Path(plan_file).read_text()
        ok, reason = classify_source(text)
        if not ok:
            raise CommandError('pending migration is not auto-applyable: %s' % reason)
        # Tests use --plan-file to prove we refuse before a backup. A real
        # deploy classifies each file from the Django plan instead.
        return 'classified'

    if not writers_fenced:
        raise CommandError(
            'writers are not fenced; refusing to migrate while the site '
            'or nightly jobs may still be writing')

    live = Path(live_path or connection.settings_dict['NAME'])
    pending = _pending_migration_files() if apply_fn is None else []
    for path in pending:
        ok, reason = classify_source(Path(path).read_text())
        if not ok:
            raise CommandError(
                '%s is not auto-applyable: %s' % (path, reason))

    if apply_fn is None and not pending:
        say('nothing to apply')
        return 'nothing to apply'

    before = fingerprint(live)
    backup = take_verified_backup(live, backup_dir)
    say('predeploy copy: %s' % backup)
    try:
        if apply_fn is not None:
            apply_fn()
        else:
            call_command('migrate', '--noinput', stdout=stdout)
        close_old_connections()
        after = fingerprint(live)
        if after['event_count'] < before['event_count']:
            raise CommandError(
                'event count dropped (%s -> %s); treating as a failed migrate'
                % (before['event_count'], after['event_count']))
        _quick_check(live)
        say('applied')
        return 'applied'
    except Exception:
        close_old_connections()
        post = fingerprint(live)
        try:
            restore_if_safe(live, backup, post_change=post)
            say('restored predeploy copy')
        except RestoreRefused as exc:
            raise CommandError(
                'MANUAL RECOVERY: %s. The live database was left as-is.'
                % exc) from exc
        raise


def _pending_migration_files():
    from django.db.migrations.executor import MigrationExecutor
    close_old_connections()
    executor = MigrationExecutor(connection)
    plan = executor.migration_plan(executor.loader.graph.leaf_nodes())
    files = []
    for migration, backwards in plan:
        if backwards:
            raise CommandError(
                'migrate plan would reverse %s.%s; refusing'
                % (migration.app_label, migration.name))
        mod = __import__(migration.__module__, fromlist=['dummy'])
        files.append(mod.__file__)
    return files


def _quick_check(live):
    import sqlite3
    conn = sqlite3.connect(str(live))
    try:
        verdict = conn.execute('PRAGMA quick_check').fetchone()[0]
    finally:
        conn.close()
    if verdict != 'ok':
        raise CommandError('quick_check failed after migrate: %r' % verdict)
