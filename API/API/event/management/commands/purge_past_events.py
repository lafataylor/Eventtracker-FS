"""Permanently delete events the owner will never look at again.

Retention chosen by the owner (2026-09-03): out of sight one day after the
event (already true — every read path filters past dates), gone from the
database 30 days after. Rows whose date the extractor could not read get 90
days from creation instead:

  * undated rows — nothing ever "passes" for them;
  * Jan-1 SENTINEL dates — the prompt's could-not-read fallback, i.e. the row
    most likely to be an UPCOMING event wearing a wrong date, which is the
    exact recovery case the owner raised before agreeing to deletion.

What deletion takes with it, deliberately: EventMatch pairs and Feedback rows
CASCADE; suppressed twins whose canonical is being purged are pulled into the
same batch, because canonical is SET_NULL and leaving them would recreate the
orphaned-husk artifact repaired on 2026-09-02. What it must never touch:
BlacklistedLink — that table doubles as the scraper's "already seen" ledger,
and losing it would re-ingest (and re-bill) every purged post.

DRY RUN by default. --apply first writes its OWN consistent copy of the
database (sqlite3's online backup API, then PRAGMA quick_check) into
--backup-dir and refuses to delete anything if that copy cannot be made and
verified, or if free disk is under 1.5x the database size. The real
disaster-recovery backup is the daily EBS snapshot (DLM policy
policy-08449f25f08bb03cd, ~07:52 UTC, verified current 2026-09-04); the
pre-purge copy is the fast local undo. An earlier version instead inferred
"a backup exists" from the newest file in the directory, which meant a stray
zero-byte README counted as a backup — flagged in review, replaced here.
Deletes happen in batches so the production SQLite's single write lock is
held for moments, not minutes — the first run clears a ~41k-row backlog.
"""
import shutil
import sqlite3
import sys
import threading
import time
from datetime import timedelta
from pathlib import Path

from django.core.management.base import BaseCommand, CommandError
from django.db import connection, transaction
from django.utils import timezone

from event.dedupe import is_sentinel_date
from event.models import Event

RETENTION_DAYS = 30
UNDATED_DAYS = 90
PREPURGE_PREFIX = 'db.sqlite3.prepurge-'
PREPURGE_KEEP = 1            # one 600 MB copy is insurance; two is disk pressure
MIN_FREE_RATIO = 1.5         # of the live database size
MIN_FREE_BYTES = 50 * 1024 * 1024
BACKUP_TIMEOUT_S = 600       # a 600 MB copy takes seconds; ten minutes = wedged


class Command(BaseCommand):
    help = 'Delete events 30 days past their date (90 days for undated/sentinel).'

    def add_arguments(self, parser):
        parser.add_argument('--apply', action='store_true',
                            help='Actually delete. Default is a dry run.')
        parser.add_argument('--retention-days', type=int, default=RETENTION_DAYS)
        parser.add_argument('--undated-days', type=int, default=UNDATED_DAYS)
        parser.add_argument('--batch-size', type=int, default=500)
        parser.add_argument('--backup-dir', default='/home/ubuntu/dbBackups',
                            help='--apply writes a verified pre-purge copy here first.')

    def handle(self, *args, **opts):
        apply = opts['apply']
        now_local = timezone.localtime(timezone.now())
        dated_cutoff = (now_local - timedelta(days=opts['retention_days'])).date()
        created_cutoff = now_local - timedelta(days=opts['undated_days'])

        if apply:
            self._take_verified_backup(opts['backup_dir'])
        else:
            self.stdout.write(self.style.WARNING('DRY RUN — no writes.'))

        # Selection. Sentinel-dated rows are pulled OUT of the dated bucket
        # and judged by age like undated ones (see module docstring); the
        # date filter is deliberately on __date in local time, matching every
        # read path, so "30 days past" means the owner's calendar, not UTC's.
        dated = (Event.objects
                 .filter(start_date__date__lt=dated_cutoff)
                 .only('id', 'start_date', 'created_at'))
        dated_ids, sentinel_ids = [], []
        for e in dated.iterator(chunk_size=2000):
            if is_sentinel_date(e.start_date.date()):
                if e.created_at and e.created_at < created_cutoff:
                    sentinel_ids.append(e.id)
            else:
                dated_ids.append(e.id)
        undated_ids = list(Event.objects
                           .filter(start_date__isnull=True,
                                   created_at__lt=created_cutoff)
                           .values_list('id', flat=True))

        doomed = set(dated_ids) | set(sentinel_ids) | set(undated_ids)
        # Hidden twins whose keeper is leaving go with it (canonical is
        # SET_NULL; orphaning them recreates a repaired artifact class).
        dependents = list(Event.objects
                          .filter(suppressed=True, canonical_id__in=doomed)
                          .exclude(id__in=doomed)
                          .values_list('id', flat=True))
        doomed |= set(dependents)

        self.stdout.write(f'dated past {opts["retention_days"]}d: {len(dated_ids)}')
        self.stdout.write(f'sentinel-dated older than {opts["undated_days"]}d: '
                          f'{len(sentinel_ids)}')
        self.stdout.write(f'undated older than {opts["undated_days"]}d: '
                          f'{len(undated_ids)}')
        self.stdout.write(f'suppressed twins of the above: {len(dependents)}')
        self.stdout.write(f'TOTAL to delete: {len(doomed)} of '
                          f'{Event.objects.count()} events')
        if not apply:
            return

        deleted = 0
        ids = sorted(doomed)
        for i in range(0, len(ids), opts['batch_size']):
            batch = ids[i:i + opts['batch_size']]
            with transaction.atomic():
                # order matters inside a batch too: twins before keepers is
                # not needed (SET_NULL only fires for rows NOT in the batch,
                # and dependents were pulled in above), but keep each batch
                # atomic so a crash mid-run never half-deletes a keeper group.
                n, _ = Event.objects.filter(id__in=batch).delete()
            deleted += len(batch)
        self.stdout.write(self.style.SUCCESS(
            f'deleted {deleted} events (+ cascaded match/feedback rows)'))

    def _take_verified_backup(self, backup_dir):
        """Write a consistent copy of the live database, verify it, rotate.

        Uses sqlite3's online backup API from a FRESH standalone connection
        (always autocommit), so the copy is transactionally consistent even
        with gunicorn writing, and never from Django's connection: measured
        2026-09-04, Connection.backup() retries BUSY forever when its own
        connection holds an open write transaction, which hung the test
        suite and would have hung the nightly cron in silence if any caller
        ever wrapped this in transaction.atomic(). Hence the guard, and a
        wall-clock bound around the copy. Refuses (exit 1) rather than
        deleting anything if disk is short, the copy stalls, is implausibly
        small, or quick_check is unhappy - each is a reason to stop.
        """
        if connection.in_atomic_block:
            raise CommandError('purge_past_events must run outside a '
                               'transaction: an open write transaction makes '
                               'the backup wait forever')
        d = Path(backup_dir)
        d.mkdir(parents=True, exist_ok=True)
        live_name = str(connection.settings_dict.get('NAME') or '')
        live = Path(live_name)
        live_size = live.stat().st_size if live.is_file() else 0

        required = max(int(MIN_FREE_RATIO * live_size), MIN_FREE_BYTES)
        free = shutil.disk_usage(d).free
        if free < required:
            self.stderr.write(self.style.ERROR(
                f'REFUSING --apply: {free // 2**20} MB free in {d}, need '
                f'{required // 2**20} MB for a pre-purge copy of a '
                f'{live_size // 2**20} MB database.'))
            sys.exit(1)

        dest = d / f"{PREPURGE_PREFIX}{time.strftime('%Y%m%d-%H%M%S')}"
        outcome = {}

        def copy():
            try:
                # uri=True only for Django's in-memory test database name;
                # production is a plain path.
                src = sqlite3.connect(live_name, uri=live_name.startswith('file:'),
                                      check_same_thread=False)
                dst = sqlite3.connect(str(dest), check_same_thread=False)
                try:
                    src.backup(dst, pages=4096)
                    outcome['verdict'] = dst.execute('PRAGMA quick_check').fetchone()[0]
                finally:
                    dst.close(); src.close()
            except Exception as exc:          # reported, never swallowed
                outcome['error'] = f'{type(exc).__name__}: {exc}'

        worker = threading.Thread(target=copy, daemon=True)
        worker.start()
        worker.join(BACKUP_TIMEOUT_S)
        if worker.is_alive():
            self.stderr.write(self.style.ERROR(
                f'REFUSING --apply: pre-purge copy did not finish in '
                f'{BACKUP_TIMEOUT_S}s - something holds the database.'))
            sys.exit(1)
        if 'error' in outcome:
            dest.unlink(missing_ok=True)
            self.stderr.write(self.style.ERROR(
                f'REFUSING --apply: pre-purge copy failed: {outcome["error"]}'))
            sys.exit(1)
        verdict = outcome.get('verdict')
        size = dest.stat().st_size if dest.exists() else 0
        if verdict != 'ok' or size == 0 or (live_size and size < 0.9 * live_size):
            dest.unlink(missing_ok=True)
            self.stderr.write(self.style.ERROR(
                f'REFUSING --apply: pre-purge copy failed verification '
                f'(quick_check={verdict!r}, size={size}, live={live_size}).'))
            sys.exit(1)

        copies = sorted(d.glob(PREPURGE_PREFIX + '*'),
                        key=lambda p: p.stat().st_mtime, reverse=True)
        for old in copies[PREPURGE_KEEP:]:
            old.unlink()
        self.stdout.write(f'pre-purge copy: {dest} ({size // 2**20} MB, '
                          f'quick_check ok); kept {min(len(copies), PREPURGE_KEEP)}')
        return dest
