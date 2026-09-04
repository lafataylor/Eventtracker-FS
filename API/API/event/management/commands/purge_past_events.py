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
CASCADE; suppressed twins whose canonical is being purged are pulled in (to
any depth) and deleted FIRST, because canonical is SET_NULL and a keeper
deleted before its twin leaves a `suppressed, canonical=NULL` husk — the
artifact class repaired on 2026-09-02 — which a re-run after a mid-run
failure would then never recognise. What it must never touch:
BlacklistedLink — that table doubles as the scraper's "already seen" ledger,
and losing it would re-ingest (and re-bill) every purged post.

DRY RUN by default. --apply first writes its OWN consistent copy of the
database (sqlite3's online backup API, then PRAGMA quick_check) into
--backup-dir and refuses to delete anything if that copy cannot be made and
verified, if free disk is under 1.5x the database size, or if the pipeline
wrote a log row in the last 15 minutes (a scrape or dedupe in flight would
make the copy restart forever — see _take_verified_backup). The real
disaster-recovery backup is the daily EBS snapshot (DLM policy
policy-08449f25f08bb03cd, ~07:52 UTC, verified current 2026-09-04); the
pre-purge copies (two kept) are the fast local undo. An earlier version
inferred "a backup exists" from the newest file in the directory, so a stray
zero-byte README counted — flagged in review, replaced.

Deletes happen in batches so the production SQLite's single write lock is
held for moments, not minutes — the first run clears a ~41k-row backlog.
Deleting does not shrink the file (SQLite reuses freed pages; VACUUM is a
separate, optional step needing free disk equal to the file size).
"""
import shutil
import sqlite3
import sys
import threading
import time
from datetime import datetime, timedelta
from pathlib import Path

from django.core.management.base import BaseCommand, CommandError
from django.db import connection, transaction
from django.utils import timezone

from event.dedupe import is_sentinel_date
from event.models import Event

RETENTION_DAYS = 30
UNDATED_DAYS = 90
PREPURGE_PREFIX = 'db.sqlite3.prepurge-'
PREPURGE_KEEP = 2            # yesterday's copy survives today's run: 2 x 600 MB
MIN_FREE_RATIO = 1.5         # of the live database size
MIN_FREE_BYTES = 50 * 1024 * 1024
BACKUP_TIMEOUT_S = 600       # a 600 MB copy takes seconds; ten minutes = wedged
PIPELINE_IDLE_MINUTES = 15   # same rule as misc/preflight.sh


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

    # ------------------------------------------------------------ selection
    def _select(self, retention_days, undated_days):
        """Return (dated_ids, sentinel_ids, undated_ids, twin_ids).

        Every date comparison is in the project timezone (America/Los_Angeles),
        the same clock every read path uses, so "30 days past" means the
        owner's calendar, not UTC's. Sentinel detection therefore uses the
        LOCAL calendar date too — a UTC date could read Jan 2 for a Jan 1 LA
        evening and dodge the branch.
        """
        now_local = timezone.localtime(timezone.now())
        dated_cutoff = (now_local - timedelta(days=retention_days)).date()
        created_cutoff = now_local - timedelta(days=undated_days)

        dated_ids, sentinel_ids = [], []
        old_dated = (Event.objects.filter(start_date__date__lt=dated_cutoff)
                     .only('id', 'start_date', 'created_at'))
        for e in old_dated.iterator(chunk_size=2000):
            if is_sentinel_date(timezone.localtime(e.start_date).date()):
                if e.created_at and e.created_at < created_cutoff:
                    sentinel_ids.append(e.id)
            else:
                dated_ids.append(e.id)
        undated_ids = list(Event.objects
                           .filter(start_date__isnull=True,
                                   created_at__lt=created_cutoff)
                           .values_list('id', flat=True))
        doomed = set(dated_ids) | set(sentinel_ids) | set(undated_ids)

        # Suppressed twins of anything doomed, to ANY depth, computed in
        # Python: an IN (...) list of ~41k ids trips SQLite's bound-variable
        # limit on stock builds (32,766) — after the backup was written, before
        # a single delete. The suppressed set is a few thousand rows.
        by_canonical = {}
        for row_id, canon_id in (Event.objects
                                 .filter(suppressed=True, canonical__isnull=False)
                                 .values_list('id', 'canonical_id')):
            by_canonical.setdefault(canon_id, []).append(row_id)
        twins, frontier = set(), set(doomed)
        while frontier:
            found = set()
            for canon_id in frontier:
                for row_id in by_canonical.get(canon_id, ()):
                    if row_id not in doomed and row_id not in twins:
                        found.add(row_id)
            twins |= found
            frontier = found
        return dated_ids, sentinel_ids, undated_ids, sorted(twins)

    # ------------------------------------------------------------ handle
    def handle(self, *args, **opts):
        apply = opts['apply']
        if apply:
            self._require_pipeline_idle()
            self._take_verified_backup(opts['backup_dir'])
        else:
            self.stdout.write(self.style.WARNING('DRY RUN — no writes.'))

        dated_ids, sentinel_ids, undated_ids, twins = self._select(
            opts['retention_days'], opts['undated_days'])
        doomed = set(dated_ids) | set(sentinel_ids) | set(undated_ids)

        self.stdout.write(f'dated past {opts["retention_days"]}d: {len(dated_ids)}')
        self.stdout.write(f'sentinel-dated older than {opts["undated_days"]}d: '
                          f'{len(sentinel_ids)}')
        self.stdout.write(f'undated older than {opts["undated_days"]}d: '
                          f'{len(undated_ids)}')
        self.stdout.write(f'suppressed twins of the above: {len(twins)}')
        self.stdout.write(f'TOTAL to delete: {len(doomed) + len(twins)} of '
                          f'{Event.objects.count()} events')
        if not apply:
            return

        # Twins FIRST, then everything else, each batch atomic: a keeper that
        # dies before its twin turns the twin into an orphan husk, and if the
        # run stops there (lock, OOM, SIGTERM) a re-run cannot recognise it.
        ordered = twins + sorted(doomed - set(twins))
        deleted = 0
        size = opts['batch_size']
        for i in range(0, len(ordered), size):
            batch = ordered[i:i + size]
            with transaction.atomic():
                Event.objects.filter(id__in=batch).delete()
            deleted += len(batch)
            self._after_batch(i // size)
        self.stdout.write(self.style.SUCCESS(
            f'deleted {deleted} events (+ cascaded match/feedback rows)'))

    def _after_batch(self, index):
        """Seam for tests that simulate a failure between batches."""

    # ------------------------------------------------------------ guards
    def _require_pipeline_idle(self):
        """Refuse while the scraper/dedupe may be writing.

        The online backup restarts from page zero whenever another PROCESS
        commits between steps; under a steady writer it never finishes.
        The pipeline writes a Logs row at every step, so a row younger than
        PIPELINE_IDLE_MINUTES means "still running" — the same rule the
        deploy preflight uses. No rows at all means nothing ever ran: fine.
        """
        from c_admin.models import Logs
        last = Logs.objects.order_by('-id').first()
        if last is None:
            return
        stamp = (last.scraped_at or '').strip()
        try:
            when = datetime.strptime(stamp, '%Y-%m-%d %H:%M:%S')
        except ValueError:
            self.stderr.write(self.style.ERROR(
                f'REFUSING --apply: cannot parse the newest pipeline log '
                f'timestamp {stamp!r}; will not guess whether a scrape is running.'))
            sys.exit(1)
        age = datetime.utcnow() - when
        if age < timedelta(minutes=PIPELINE_IDLE_MINUTES):
            self.stderr.write(self.style.ERROR(
                f'REFUSING --apply: pipeline wrote a log row '
                f'{int(age.total_seconds() // 60)} min ago; a scrape or dedupe '
                f'may be running and the backup would restart forever.'))
            sys.exit(1)

    def _live_db_path(self):
        return str(connection.settings_dict.get('NAME') or '')

    def _run_backup(self, src, dst):
        # pages=-1: the whole copy in ONE step under one SHARED lock. Chunked
        # steps restart from zero on every external commit and, measured,
        # never finish under a writer committing every 250 ms. The cost is
        # that a concurrent COMMIT waits for the copy (seconds); the idle
        # guard above keeps that window to stray admin writes at 04:00.
        src.backup(dst, pages=-1)

    def _take_verified_backup(self, backup_dir):
        """Write a consistent copy of the live database, verify it, rotate.

        Uses sqlite3's online backup API from a FRESH standalone connection
        (always autocommit), never from Django's: Connection.backup() waits
        forever when its own connection holds an open write transaction,
        which hung the test suite on 2026-09-04 and would hang the cron in
        silence if any caller wrapped this in transaction.atomic(). Hence the
        guard and the wall-clock bound. Refuses (exit 1), cleaning up any
        partial file, rather than deleting anything.
        """
        if connection.in_atomic_block:
            raise CommandError('purge_past_events must run outside a '
                               'transaction: an open write transaction makes '
                               'the backup wait forever')
        d = Path(backup_dir)
        d.mkdir(parents=True, exist_ok=True)
        live_name = self._live_db_path()
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
                src = sqlite3.connect(live_name, uri=live_name.startswith('file:'),
                                      check_same_thread=False)
                dst = sqlite3.connect(str(dest), check_same_thread=False)
                try:
                    self._run_backup(src, dst)
                    outcome['verdict'] = dst.execute('PRAGMA quick_check').fetchone()[0]
                finally:
                    dst.close(); src.close()
            except Exception as exc:          # reported, never swallowed
                outcome['error'] = f'{type(exc).__name__}: {exc}'

        worker = threading.Thread(target=copy, daemon=True)
        worker.start()
        worker.join(BACKUP_TIMEOUT_S)

        def discard():
            dest.unlink(missing_ok=True)
            Path(str(dest) + '-journal').unlink(missing_ok=True)

        if worker.is_alive():
            discard()
            self.stderr.write(self.style.ERROR(
                f'REFUSING --apply: pre-purge copy did not finish in '
                f'{BACKUP_TIMEOUT_S}s — something keeps writing to the database.'))
            sys.exit(1)
        if 'error' in outcome:
            discard()
            self.stderr.write(self.style.ERROR(
                f'REFUSING --apply: pre-purge copy failed: {outcome["error"]}'))
            sys.exit(1)
        verdict = outcome.get('verdict')
        size = dest.stat().st_size if dest.exists() else 0
        if verdict != 'ok' or size == 0 or (live_size and size < 0.9 * live_size):
            discard()
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
