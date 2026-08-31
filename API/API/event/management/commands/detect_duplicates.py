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
from event.dedupe import (event_signature, find_fuzzy_pairs,
                          same_post_is_redundant)

COMPLETENESS_FIELDS = ('name', 'artist', 'start_date', 'start_time', 'price',
                       'genres', 'ticket_link', 'orig_thumb', 'venue_id')

# A title and a date IDENTIFY an event; the other fields only describe it.
IDENTIFYING_FIELDS = ('name', 'start_date')

# Everything the extractor can put on a review card as text. Excludes
# ticket_link and orig_thumb on purpose: every row has a thumbnail and most
# carry the post URL, so their presence says nothing about whether the row
# is a real listing.
TEXT_FIELDS = ('name', 'start_date', 'start_time', 'artist', 'genres',
               'price', 'venue_id')


def has_extracted_text(event):
    return any(getattr(event, f, None) for f in TEXT_FIELDS)


def cluster_same_post_rows(rows):
    """Split one post's rows into clusters that are the SAME event.

    One keeper per post is right for a single-event post and wrong for a
    roundup, whose rows are N distinct events: comparing every row to a
    single keeper queued each distinct event as a "same-post pair" for the
    owner and compared a re-extraction twin of event B against keeper A
    (measured 2026-08-27: 3 of 4 drift twins queued instead of collapsed).

    A row joins the first cluster whose REPRESENTATIVE (its most complete
    member so far) same_post_is_redundant says is the same event — similar
    title, or no contradicting name/date evidence; otherwise it seeds a new
    cluster. Greedy in id order, so re-runs are stable.

    Rows with neither a title nor a date are placed LAST and never seed a
    cluster while an informative cluster exists: same_post_is_redundant
    cannot contradict an empty signature, so such a row seeding first would
    absorb every distinct titled event of a roundup into one cluster and
    re-queue them all (caught in review, 2026-08-28). Attached last, they
    simply hide behind the first event's keeper, as they always did.
    """
    def informative(row):
        return bool((row.name or '').strip()) or row.start_date is not None

    ordered = ([r for r in rows if informative(r)]
               + [r for r in rows if not informative(r)])
    clusters = []
    for row in ordered:
        sig = event_signature(row)
        for cluster in clusters:
            if same_post_is_redundant(cluster['sig'], sig):
                cluster['rows'].append(row)
                if completeness(row) > completeness(cluster['rep']):
                    cluster['rep'], cluster['sig'] = row, sig
                break
        else:
            clusters.append({'rep': row, 'sig': sig, 'rows': [row]})
    # Restore id order inside each cluster so ties still favour the oldest.
    return [sorted(c['rows'], key=lambda r: r.id) for c in clusters]


def completeness(event):
    """Sort key for choosing a group's keeper, in strict tiers:

      1. identifying fields (title, date) — a row with more always wins;
      2. other extracted text (time, artist, genre, price, venue);
      3. thumbnail / post link — present on nearly every row, so only a
         last-resort tie-break.

    A flat count let an undated, untitled row with several descriptive
    fields beat the post's only dated row — verified on production
    (2026-08-26): 5 of 25,192 collapses did exactly that. Tier 3 is kept
    below tier 2 so a row that is only a thumbnail can never outrank a row
    carrying real extracted text (the same rule has_extracted_text() applies
    when deciding whether a pair is reviewable). Remaining ties fall to the
    caller, which orders rows by id so the oldest row wins deterministically.
    """
    identifying = sum(1 for f in IDENTIFYING_FIELDS if getattr(event, f, None))
    text = sum(1 for f in TEXT_FIELDS
               if f not in IDENTIFYING_FIELDS and getattr(event, f, None))
    media = sum(1 for f in COMPLETENESS_FIELDS
                if f not in TEXT_FIELDS and getattr(event, f, None))
    return (identifying, text, media)


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
        parser.add_argument('--auto-merge-threshold', type=float, default=0.0,
                            help='With --fuzzy: pairs scoring at or above this'
                                 ' AND dated the SAME day are merged without'
                                 ' review (loser suppressed behind the more'
                                 ' complete row). 0 (default) = queue only.')

    def handle(self, *args, **opts):
        if not (opts['exact'] or opts['fuzzy']):
            self.stderr.write('Nothing to do: pass --exact and/or --fuzzy.')
            return
        dry = opts['dry_run']
        if dry:
            self.stdout.write(self.style.WARNING('DRY RUN — no writes.\n'))

        # One transaction per pass: on the production SQLite every individual
        # write is an fsync holding the global write lock, so ~23k autocommit
        # writes would stall live traffic for minutes. One commit each instead.
        if opts['exact']:
            with transaction.atomic():
                self._exact(dry, opts['limit'])
        if opts['fuzzy']:
            with transaction.atomic():
                self._fuzzy(dry, opts['limit'], opts['auto_merge_threshold'])

    # --- pass 1: exact re-scrapes sharing a shortcode ---------------------
    def _exact(self, dry, limit):
        # ALL same-shortcode rows are considered, keyed or not. Roundup rows
        # (distinct events sharing one post, written by the structured path)
        # are protected by the same_post_is_redundant gate below — different
        # titles or dates always queue for review, never auto-hide. Restricting
        # to source_key IS NULL left a hole: the legacy per-slide nightly path
        # also writes source_keys now, so a 5-slide single-event carousel it
        # ingests as 5 keyed rows would have been permanently uncollapsible.
        candidates = Event.objects.filter(shortcode__isnull=False,
                                          suppressed=False)
        groups = (candidates.values('shortcode').annotate(n=Count('id'))
                  .filter(n__gt=1).order_by('-n'))
        if limit:
            groups = groups[:limit]
        groups = list(groups)
        self.stdout.write(f'[exact] {len(groups)} shortcode groups with duplicates')

        suppressed = queued = pairs = 0
        for g in groups:
            # order_by('id') makes completeness() ties deterministic: the
            # oldest row wins, so a re-run picks the same keeper.
            rows = list(Event.objects.filter(
                shortcode=g['shortcode'],
                suppressed=False).select_related('venue').order_by('id'))
            if len(rows) < 2:
                continue
            # Sharing a shortcode is NOT sufficient to auto-hide. Legacy
            # carousel rows all carry the parent post URL as orig_link, so
            # migration 0010 backfills every slide of a roundup to the same
            # shortcode — collapsing blind would permanently suppress real,
            # distinct events (317 rows on the production dataset). So the
            # post is first split into clusters that are textually the same
            # event; a cluster of one is a distinct event and is left alone
            # (not hidden, not queued). Within a cluster the most complete row
            # is the keeper and the rest are collapsed or, if ambiguous,
            # queued for human review.
            for cluster in cluster_same_post_rows(rows):
                if len(cluster) < 2:
                    continue
                canonical = max(cluster, key=completeness)
                canonical_sig = event_signature(canonical)
                for row in cluster:
                    if row.id == canonical.id:
                        continue
                    lo, hi = sorted((canonical.id, row.id))
                    row_sig = event_signature(row)
                    # Two nameless rows of one post are ambiguous: the legacy
                    # per-slide path writes N rows for ONE event, while the
                    # structured path writes N rows for N DISTINCT events, and
                    # same_post_is_redundant only knows names and dates. So when
                    # BOTH sides carry some extracted text (time, artist, genre,
                    # price or venue) a human has something to compare — queue.
                    # This applies whether the rows are keyed or legacy: a legacy
                    # row next to a new keyed one is the common case while 33k
                    # legacy posts remain. When one side has NO extracted text at
                    # all it is not a listing (it cannot appear in the date feed
                    # or match a search), so it is not a distinct event a reviewer
                    # could rescue: collapse it behind its post-mate. It stays
                    # restorable. Thumbnail and post link are deliberately not
                    # signal: every slide of one post has a different thumbnail
                    # and the same link, so they tell slides apart, not events.
                    # Measured 2026-08-27: 69 of 191 pending pairs had a textless
                    # side, growing ~80 per night; the 122 with text on both
                    # sides (102 titled) keep going to review.
                    # A pair whose BOTH sides are EXPLICITLY classified
                    # not-an-event has nothing for a reviewer to rescue: such
                    # rows appear in no feed (which filters duplicates) and in
                    # no search (search_events excludes is_event=False), so
                    # "keep this one" is a choice between two invisible rows.
                    # Owner feedback 2026-08-30 ("most of these are not
                    # actually events"); measured 85 of 165 pending pairs.
                    #
                    # `is True` / `is False` on purpose: is_event is nullable
                    # and NULL means "never classified", NOT "not an event".
                    # search_events filters ~Q(is_event=False) precisely so
                    # NULL rows stay findable, so a NULL row IS visible and
                    # must keep its review. If either side is a real listing
                    # the classification may simply be wrong on the other, so
                    # those go to review too.
                    neither_is_event = (row.is_event is False
                                        and canonical.is_event is False)
                    ambiguous_pair = (
                        not neither_is_event
                        and not canonical_sig['name'] and not row_sig['name']
                        and has_extracted_text(row) and has_extracted_text(canonical))
                    if ambiguous_pair or not same_post_is_redundant(canonical_sig, row_sig):
                        if not dry:
                            EventMatch.objects.get_or_create(
                                event_a_id=lo, event_b_id=hi,
                                defaults=dict(score=0.0, match_type='exact_link',
                                              status='pending'))
                        queued += 1
                        pairs += 1
                        continue

                    if not dry:
                        # get_or_create, NOT update_or_create: if this pair was
                        # already processed once, a re-run must not redo it —
                        # the owner may have restored the event via the
                        # "Previously flagged" tab, and re-suppressing it would
                        # silently erase that decision.
                        match, was_new = EventMatch.objects.get_or_create(
                            event_a_id=lo, event_b_id=hi,
                            defaults=dict(score=100.0, match_type='exact_link',
                                          status='confirmed'))
                        if not was_new:
                            # An existing PENDING pair is not a decision by
                            # anyone: it was queued by an earlier, more
                            # cautious rule. If today's rule says collapse,
                            # collapse it and record that (found live: an
                            # identical-title, identical-date pair sat in the
                            # owner's queue because the guard skipped it).
                            # 'rejected' (owner said no) and 'confirmed'
                            # (already collapsed, possibly restored since)
                            # are decisions and stay untouched.
                            if match.status != 'pending':
                                continue
                            match.status = 'confirmed'
                            match.score = 100.0
                            match.save(update_fields=['status', 'score'])
                        row.suppressed = True
                        row.canonical = canonical
                        # Also set is_duplicate so existing read paths hide it.
                        row.is_duplicate = True
                        row.duplicate_link = canonical.orig_link or f"event_{canonical.id}"
                        row.save(update_fields=['suppressed', 'canonical',
                                                'is_duplicate', 'duplicate_link'])
                    suppressed += 1
                    pairs += 1
        verb = 'would suppress' if dry else 'suppressed'
        self.stdout.write(self.style.SUCCESS(
            f'[exact] {verb} {suppressed} rows across {len(groups)} posts; '
            f'queued {queued} same-post pairs for review instead of hiding them '
            f'({pairs} EventMatch pairs total)'))

    # --- pass 2: fuzzy cross-post duplicates ------------------------------
    def _fuzzy(self, dry, limit, auto_threshold=0.0):
        qs = (Event.objects.filter(is_event=True, suppressed=False,
                                   start_date__isnull=False)
              .select_related('venue'))
        if limit:
            qs = qs[:limit]
        # Collect the shortcode while iterating: a follow-up
        # filter(id__in=[~55k ids]) blows past SQLite's host-parameter limit
        # (OperationalError: too many SQL variables).
        signatures, sc, dates = [], {}, {}
        for event in qs.iterator(chunk_size=2000):
            sig = event_signature(event)
            signatures.append(sig)
            sc[event.id] = event.shortcode
            dates[event.id] = sig['date']
        self.stdout.write(f'[fuzzy] scanning {len(signatures)} dated events')

        created = examined = merged = 0
        # Losers suppressed THIS run. A pair touching one is skipped rather
        # than merged/queued so one run can never build a canonical chain
        # (loser -> loser -> keeper); a survivor that still matches the
        # keeper is picked up by the next nightly run, against the keeper
        # directly. Same lesson as the exact pass's per-post keepers.
        suppressed_now = set()
        for lo, hi, score in find_fuzzy_pairs(signatures):
            examined += 1
            if sc.get(lo) and sc.get(lo) == sc.get(hi):
                continue  # same post — handled by --exact
            if lo in suppressed_now or hi in suppressed_now:
                continue
            # Auto-merge only clears the HIGH bar the owner saw evidence for
            # (2026-08-30 measurement): score at or above the threshold AND
            # the exact same day. score_pair tolerates ±1 day for nightlife;
            # that tolerance stays review-only — a date difference is real
            # counter-evidence, so those pairs always go to a human.
            auto = (auto_threshold and score >= auto_threshold
                    and dates.get(lo) == dates.get(hi))
            existing = EventMatch.objects.filter(
                event_a_id=lo, event_b_id=hi).first()
            # An owner verdict is never overridden: rejected means "not
            # duplicates" no matter what tonight's score says, and confirmed
            # is already resolved.
            if existing and existing.status in ('rejected', 'confirmed'):
                continue
            if auto:
                a = Event.objects.filter(id=lo, suppressed=False).first()
                b = Event.objects.filter(id=hi, suppressed=False).first()
                if not (a and b):
                    continue
                # Keeper = most complete row; ties fall to the lower id so
                # the oldest row wins deterministically (same rule as the
                # exact pass).
                keep, drop = sorted((a, b),
                                    key=lambda e: (completeness(e), -e.id),
                                    reverse=True)
                # Track the loser in dry mode too, or dry counts would
                # diverge from what a real run does (a later pair touching
                # this loser is skipped for real, so dry must skip it too).
                suppressed_now.add(drop.id)
                merged += 1
                if dry:
                    continue
                drop.suppressed = True
                drop.canonical = keep
                drop.is_duplicate = True
                drop.duplicate_link = keep.orig_link or f"event_{keep.id}"
                drop.save(update_fields=['suppressed', 'canonical',
                                         'is_duplicate', 'duplicate_link'])
                # The dropped row may itself be the keeper of earlier losers
                # (this run or a previous night). Re-point them at the new
                # keeper, or they would sit hidden behind a hidden row and
                # the recovery tab would name a suppressed event as
                # "kept instead".
                Event.objects.filter(canonical=drop).update(
                    canonical=keep,
                    duplicate_link=keep.orig_link or f"event_{keep.id}")
                # Mirror the owner's keep_a path on the KEEPER as well: the
                # old scraper over-flagged real events, and a keeper still
                # carrying is_duplicate=True would leave BOTH rows hidden.
                if keep.is_duplicate or keep.canonical_id or keep.duplicate_link:
                    keep.is_duplicate = False
                    keep.canonical = None
                    keep.duplicate_link = None
                    keep.save(update_fields=['is_duplicate', 'canonical',
                                             'duplicate_link'])
                # reviewed_at stays NULL on purpose: confirmed + NULL
                # reviewed_at = machine-merged, reviewed_at set = a human
                # clicked. That distinction is the audit trail.
                if existing:
                    existing.status = 'confirmed'
                    existing.score = score
                    existing.save(update_fields=['status', 'score'])
                else:
                    EventMatch.objects.create(
                        event_a_id=lo, event_b_id=hi, score=score,
                        match_type='fuzzy', status='confirmed')
                continue
            if not dry:
                if not existing:
                    EventMatch.objects.create(
                        event_a_id=lo, event_b_id=hi, score=score,
                        match_type='fuzzy', status='pending')
                    created += 1
            else:
                created += 1
        verb = 'would queue' if dry else 'queued'
        mverb = 'would auto-merge' if dry else 'auto-merged'
        if auto_threshold:
            self.stdout.write(self.style.SUCCESS(
                f'[fuzzy] {mverb} {merged} pairs '
                f'(score >= {auto_threshold:g}, same day)'))
        self.stdout.write(self.style.SUCCESS(
            f'[fuzzy] {verb} {created} pending pairs ({examined} above threshold)'))
