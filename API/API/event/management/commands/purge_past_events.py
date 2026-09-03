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

DRY RUN by default. --apply refuses unless the newest file in --backup-dir is
under 26 hours old: if the nightly backup stopped, the purge stops too.
Deletes happen in batches so the production SQLite's single write lock is
held for moments, not minutes — the first run clears a ~40k-row backlog.
"""
import sys
import time
from datetime import timedelta
from pathlib import Path

from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

from event.dedupe import is_sentinel_date
from event.models import Event

RETENTION_DAYS = 30
UNDATED_DAYS = 90
BACKUP_MAX_AGE_HOURS = 26


class Command(BaseCommand):
    help = 'Delete events 30 days past their date (90 days for undated/sentinel).'

    def add_arguments(self, parser):
        parser.add_argument('--apply', action='store_true',
                            help='Actually delete. Default is a dry run.')
        parser.add_argument('--retention-days', type=int, default=RETENTION_DAYS)
        parser.add_argument('--undated-days', type=int, default=UNDATED_DAYS)
        parser.add_argument('--batch-size', type=int, default=500)
        parser.add_argument('--backup-dir', default='/home/ubuntu/dbBackups',
                            help='--apply refuses without a fresh backup here.')

    def handle(self, *args, **opts):
        apply = opts['apply']
        now_local = timezone.localtime(timezone.now())
        dated_cutoff = (now_local - timedelta(days=opts['retention_days'])).date()
        created_cutoff = now_local - timedelta(days=opts['undated_days'])

        if apply:
            self._require_fresh_backup(opts['backup_dir'])
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

    def _require_fresh_backup(self, backup_dir):
        d = Path(backup_dir)
        newest = max((f.stat().st_mtime for f in d.glob('*') if f.is_file()),
                     default=0)
        age_h = (time.time() - newest) / 3600 if newest else float('inf')
        if age_h > BACKUP_MAX_AGE_HOURS:
            self.stderr.write(self.style.ERROR(
                f'REFUSING --apply: newest backup in {backup_dir} is '
                f'{age_h:.0f}h old (limit {BACKUP_MAX_AGE_HOURS}h). If the '
                f'nightly backup stopped, deletion stops too.'))
            sys.exit(1)
