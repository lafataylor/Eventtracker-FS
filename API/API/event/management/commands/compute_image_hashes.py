"""Fingerprint flyers so the wide net can match same artwork, same day.

Does not touch the scraper. Default is upcoming rows only: past and undated
flyers wait for --all. Expired image URLs and undecodable files are left
NULL and retried on a later run.

The first production backfill (2026-11-08) died mid-run with no summary:
an SSH session drop sends SIGHUP, and a flyer URL that dribbled bytes
reset the old 15s read timeout forever. Connect/read timeouts, a size
cap, per-row isolation, progress lines, and a finally-block summary are
what make the next run diagnosable.

Usage:
    manage.py compute_image_hashes              # upcoming, unhashed
    manage.py compute_image_hashes --dry-run
    manage.py compute_image_hashes --limit 50
    manage.py compute_image_hashes --all        # include past and undated
"""
import signal
from datetime import datetime, time

import requests
from django.core.management.base import BaseCommand
from django.db.models import Case, IntegerField, Value, When
from django.utils import timezone

from event.imagehash import dhash
from event.models import Event

# Connect vs read split: DNS+TCP should fail fast; a stalled body should
# not outlive the SSH session. Tuple form is connect, then idle-between-bytes.
CONNECT_TIMEOUT_S = 5
READ_TIMEOUT_S = 10
MAX_BYTES = 8 * 1024 * 1024
PROGRESS_EVERY = 50


def fetch_thumb(url):
    """Return image bytes for a public flyer URL, or None on failure."""
    try:
        with requests.get(
                url, timeout=(CONNECT_TIMEOUT_S, READ_TIMEOUT_S),
                stream=True) as r:
            r.raise_for_status()
            length = r.headers.get('Content-Length')
            if length and int(length) > MAX_BYTES:
                return None
            chunks = []
            got = 0
            for chunk in r.iter_content(chunk_size=64 * 1024):
                if not chunk:
                    continue
                got += len(chunk)
                if got > MAX_BYTES:
                    return None
                chunks.append(chunk)
            return b''.join(chunks)
    except (requests.RequestException, ValueError, OSError):
        return None


def _today_start():
    # Same bound as event.views.local_day_bounds: local calendar midnight,
    # so an event later tonight stays upcoming after 5pm LA.
    today = timezone.localdate()
    return timezone.make_aware(datetime.combine(today, time.min))


class Command(BaseCommand):
    help = 'Compute dhash fingerprints for events that have a flyer and no hash yet.'

    def add_arguments(self, parser):
        parser.add_argument('--dry-run', action='store_true',
                            help='Report counts, write nothing.')
        parser.add_argument('--limit', type=int, default=0,
                            help='Cap events hashed (0 = all in scope).')
        parser.add_argument('--all', action='store_true',
                            help='Include past and undated rows. Upcoming first.')

    def handle(self, *args, **opts):
        dry = opts['dry_run']
        limit = opts['limit']
        include_all = opts['all']
        if dry:
            self.stdout.write(self.style.WARNING('DRY RUN — no writes.\n'))

        today_start = _today_start()
        qs = (Event.objects
              .filter(image_dhash__isnull=True)
              .exclude(orig_thumb__isnull=True)
              .exclude(orig_thumb=''))
        if include_all:
            qs = qs.annotate(
                _batch=Case(
                    When(start_date__gte=today_start, then=Value(0)),
                    default=Value(1),
                    output_field=IntegerField(),
                )
            ).order_by('_batch', 'start_date', 'id')
        else:
            qs = qs.filter(start_date__gte=today_start).order_by(
                'start_date', 'id')
        if limit:
            qs = qs[:limit]

        total = qs.count() if hasattr(qs, 'count') else len(qs)
        scope = 'flyers' if include_all else 'upcoming flyers'
        cap = ' limit=%s' % limit if limit else ''
        self.stdout.write('[imagehash] %s %s to scan%s' % (total, scope, cap))

        hashed = skipped = 0
        seen = 0
        rows = list(qs) if limit else qs.iterator(chunk_size=200)
        previous_signals = {}

        def _stop(signum, _frame):
            raise SystemExit('interrupted (signal %s)' % signum)

        for name in ('SIGTERM', 'SIGHUP'):
            sig = getattr(signal, name, None)
            if sig is not None:
                previous_signals[sig] = signal.getsignal(sig)
                signal.signal(sig, _stop)
        try:
            for event in rows:
                seen += 1
                try:
                    body = fetch_thumb(event.orig_thumb)
                    if not body:
                        skipped += 1
                    else:
                        try:
                            digest = dhash(body)
                        except ValueError:
                            skipped += 1
                        else:
                            hashed += 1
                            if not dry:
                                event.image_dhash = digest
                                event.save(update_fields=['image_dhash'])
                except Exception as exc:
                    skipped += 1
                    self.stderr.write(
                        '[imagehash] skipped id=%s: %s: %s' % (
                            event.id, type(exc).__name__, exc))
                if seen % PROGRESS_EVERY == 0:
                    self.stdout.write(
                        '[imagehash] %s/%s hashed=%s skipped=%s' % (
                            seen, total, hashed, skipped))
                    self.stdout.flush()
        finally:
            for sig, handler in previous_signals.items():
                signal.signal(sig, handler)
            verb = 'would hash' if dry else 'hashed'
            self.stdout.write(self.style.SUCCESS(
                '[imagehash] %s %s flyers (%s skipped)' % (
                    verb, hashed, skipped)))
