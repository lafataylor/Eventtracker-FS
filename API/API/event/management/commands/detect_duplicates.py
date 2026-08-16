"""Populate EventMatch with duplicate candidates (Ticket 1).

Usage:
    manage.py detect_duplicates --exact --fuzzy --dry-run   # report, write nothing
    manage.py detect_duplicates --exact                     # collapse re-scrapes
    manage.py detect_duplicates --fuzzy                     # queue cross-post pairs

--exact  groups rows that share an Instagram shortcode (certain re-scrapes),
         keeps the most complete row as canonical, and suppresses the rest
         (recoverable: suppressed=True + canonical set, never deleted).
--fuzzy  finds same-event/different-post pairs and queues them as pending
         EventMatch rows for side-by-side owner review — nothing is suppressed
         automatically, because these are uncertain by nature.

Always safe to re-run: exact suppression is idempotent, and fuzzy pairs are
de-duplicated by EventMatch's unique (event_a, event_b) constraint.
"""

from django.core.management.base import BaseCommand
from django.db import transaction
from django.db.models import Count

from event.models import Event, EventMatch
from event.dedupe import event_signature, find_fuzzy_pairs

COMPLETENESS_FIELDS = ('name', 'artist', 'start_date', 'start_time', 'price',
                       'genres', 'ticket_link', 'orig_thumb', 'venue_id')


def completeness(event):
    return sum(1 for f in COMPLETENESS_FIELDS if getattr(event, f, None))


class Command(BaseCommand):
    help = 'Detect duplicate events and populate EventMatch (Ticket 1).'

    def add_arguments(self, parser):
        parser.add_argument('--exact', action='store_true',
                            help='Collapse same-shortcode re-scrapes.')
        parser.add_argument('--fuzzy', action='store_true',
                            help='Queue cross-post fuzzy pairs for review.')
        parser.add_argument('--dry-run', action='store_true',
                            help='Report counts, write nothing.')
        parser.add_argument('--limit', type=int, default=0,
                            help='Cap events scanned (0 = all), for testing.')

    def handle(self, *args, **opts):
        if not (opts['exact'] or opts['fuzzy']):
            self.stderr.write('Nothing to do: pass --exact and/or --fuzzy.')
            return
        dry = opts['dry_run']
        if dry:
            self.stdout.write(self.style.WARNING('DRY RUN — no writes.\n'))

        if opts['exact']:
            self._exact(dry, opts['limit'])
        if opts['fuzzy']:
            self._fuzzy(dry, opts['limit'])

    # --- pass 1: exact re-scrapes sharing a shortcode ---------------------
    def _exact(self, dry, limit):
        groups = (Event.objects.filter(shortcode__isnull=False, suppressed=False)
                  .values('shortcode').annotate(n=Count('id')).filter(n__gt=1)
                  .order_by('-n'))
        if limit:
            groups = groups[:limit]
        groups = list(groups)
        self.stdout.write(f'[exact] {len(groups)} shortcode groups with duplicates')

        suppressed = pairs = 0
        for g in groups:
            rows = list(Event.objects.filter(
                shortcode=g['shortcode'], suppressed=False).select_related('venue'))
            if len(rows) < 2:
                continue
            canonical = max(rows, key=completeness)
            for row in rows:
                if row.id == canonical.id:
                    continue
                lo, hi = sorted((canonical.id, row.id))
                if not dry:
                    with transaction.atomic():
                        row.suppressed = True
                        row.canonical = canonical
                        # Also set is_duplicate so existing read paths hide it.
                        row.is_duplicate = True
                        row.duplicate_link = canonical.orig_link or f"event_{canonical.id}"
                        row.save(update_fields=['suppressed', 'canonical',
                                                'is_duplicate', 'duplicate_link'])
                        EventMatch.objects.update_or_create(
                            event_a_id=lo, event_b_id=hi,
                            defaults=dict(score=100.0, match_type='exact_link',
                                          status='confirmed'))
                suppressed += 1
                pairs += 1
        verb = 'would suppress' if dry else 'suppressed'
        self.stdout.write(self.style.SUCCESS(
            f'[exact] {verb} {suppressed} rows across {len(groups)} posts '
            f'({pairs} EventMatch pairs)'))

    # --- pass 2: fuzzy cross-post duplicates ------------------------------
    def _fuzzy(self, dry, limit):
        qs = (Event.objects.filter(is_event=True, suppressed=False,
                                   start_date__isnull=False)
              .select_related('venue'))
        if limit:
            qs = qs[:limit]
        signatures = [event_signature(e) for e in qs.iterator(chunk_size=2000)]
        self.stdout.write(f'[fuzzy] scanning {len(signatures)} dated events')

        # shortcode per id, to skip same-post pairs (those are exact's job)
        sc = dict(Event.objects.filter(id__in=[s['id'] for s in signatures])
                  .values_list('id', 'shortcode'))

        created = examined = 0
        for lo, hi, score in find_fuzzy_pairs(signatures):
            examined += 1
            if sc.get(lo) and sc.get(lo) == sc.get(hi):
                continue  # same post — handled by --exact
            if not dry:
                _, was_created = EventMatch.objects.get_or_create(
                    event_a_id=lo, event_b_id=hi,
                    defaults=dict(score=score, match_type='fuzzy', status='pending'))
                created += int(was_created)
            else:
                created += 1
        verb = 'would queue' if dry else 'queued'
        self.stdout.write(self.style.SUCCESS(
            f'[fuzzy] {verb} {created} pending pairs ({examined} above threshold)'))
