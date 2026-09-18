"""Hide the dateless rows already saved as events.

Owner rule (2026-09-18): "if something doesn't have a start or end date, it
should not make it through". New rows are handled at ingestion
(c_admin.post_ingest._hide_undated_events); this applies the same rule to the
rows that are already in the database. Sets is_event=False, which removes the
row from every feed, search and the admin list; deletes nothing, and
purge_past_events retires it after 90 days like every other non-event.

Dry run by default. --apply writes.
"""
from django.core.management.base import BaseCommand
from django.db.models import Q

from event.models import Event


class Command(BaseCommand):
    help = "Classify rows with neither a start nor an end date as not-an-event."

    def add_arguments(self, parser):
        parser.add_argument('--apply', action='store_true', help='Write; default is a dry run.')

    def handle(self, *args, **opts):
        rows = (Event.objects
                .filter(start_date__isnull=True, end_date__isnull=True)
                .filter(Q(is_event=True) | Q(is_event__isnull=True)))
        n = rows.count()
        if not opts['apply']:
            self.stdout.write(f'DRY RUN: {n} dateless rows would be classified not-an-event')
            return
        updated = rows.update(is_event=False)
        self.stdout.write(self.style.SUCCESS(f'{updated} dateless rows classified not-an-event'))
