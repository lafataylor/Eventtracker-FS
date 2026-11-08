"""Fingerprint new flyers so the wide net can match same artwork, same day.

Does not touch the scraper. ~300 public orig_thumb files a night. Expired
or undecodable images are left NULL and retried on a later run.

Usage:
    manage.py compute_image_hashes              # hash unhashed rows
    manage.py compute_image_hashes --dry-run    # report, write nothing
    manage.py compute_image_hashes --limit 50
"""
import requests
from django.core.management.base import BaseCommand

from event.imagehash import dhash
from event.models import Event

FETCH_TIMEOUT_S = 15


def fetch_thumb(url):
    """Return image bytes for a public flyer URL, or None on failure."""
    try:
        r = requests.get(url, timeout=FETCH_TIMEOUT_S)
        r.raise_for_status()
        return r.content
    except requests.RequestException:
        return None


class Command(BaseCommand):
    help = 'Compute dhash fingerprints for events that have a flyer and no hash yet.'

    def add_arguments(self, parser):
        parser.add_argument('--dry-run', action='store_true',
                            help='Report counts, write nothing.')
        parser.add_argument('--limit', type=int, default=0,
                            help='Cap events hashed (0 = all).')

    def handle(self, *args, **opts):
        dry = opts['dry_run']
        limit = opts['limit']
        if dry:
            self.stdout.write(self.style.WARNING('DRY RUN — no writes.\n'))

        qs = (Event.objects
              .filter(image_dhash__isnull=True)
              .exclude(orig_thumb__isnull=True)
              .exclude(orig_thumb='')
              .order_by('id'))
        if limit:
            qs = qs[:limit]

        hashed = skipped = 0
        rows = list(qs) if limit else qs.iterator(chunk_size=200)
        for event in rows:
            body = fetch_thumb(event.orig_thumb)
            if not body:
                skipped += 1
                continue
            try:
                digest = dhash(body)
            except ValueError:
                skipped += 1
                continue
            hashed += 1
            if dry:
                continue
            event.image_dhash = digest
            event.save(update_fields=['image_dhash'])

        verb = 'would hash' if dry else 'hashed'
        self.stdout.write(self.style.SUCCESS(
            f'[imagehash] {verb} {hashed} flyers ({skipped} skipped)'))
