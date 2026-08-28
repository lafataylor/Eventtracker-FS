"""Tests for the detect_duplicates management command (Ticket 1)."""
from datetime import timedelta

from django.core.management import call_command
from django.test import TestCase
from django.utils import timezone

from event.management.commands.detect_duplicates import completeness
from event.models import Event, EventMatch


class KeeperChoiceTests(TestCase):
    """The keeper of a same-post group must be the row that best IDENTIFIES the
    event. Reproduces production rows #73564 (dated, sparse) vs #73561
    (undated, but artist+genres filled): the dated row must win."""

    def test_dated_sparse_row_beats_undated_row_with_more_fields(self):
        dated = Event(name=None, start_date=timezone.now(),
                      ticket_link='https://www.instagram.com/p/x/',
                      orig_thumb='https://img/x__0.jpg')
        undated = Event(name=None, start_date=None,
                        artist='Girl Ultra', genres='trance, dark pop',
                        ticket_link='https://www.instagram.com/p/x/',
                        orig_thumb='https://img/x__1.jpg')
        self.assertGreater(completeness(dated), completeness(undated))

    def test_titled_row_beats_untitled_row_with_more_fields(self):
        titled = Event(name='Slow It Down', orig_thumb='https://img/a.jpg')
        untitled = Event(name=None, artist='a', genres='b', price='10',
                         orig_thumb='https://img/b.jpg')
        self.assertGreater(completeness(titled), completeness(untitled))


class BlankPairGuardTests(TestCase):
    """Keyed nameless rows from the same post are ambiguous (one event split
    per slide, or N distinct events?) and normally queue for review. But a
    row with NO extracted text at all is not a listing a reviewer could
    rescue — it cannot show in the date feed or match a search — so --exact
    collapses it behind its post-mate instead of queueing a blank card. When
    BOTH sides carry some text, the pair still queues."""

    def _row(self, key, **kw):
        base = dict(shortcode='ABC123', source_key=key, is_duplicate=False,
                    suppressed=False, is_event=False,
                    orig_link='https://www.instagram.com/p/ABC123/',
                    orig_thumb='https://img/%s.jpg' % key)   # thumbs differ per slide
        base.update(kw)
        return Event.objects.create(**base)

    def _assert_collapsed(self, expected_keeper):
        self.assertEqual(EventMatch.objects.filter(status='pending').count(), 0)
        self.assertEqual(Event.objects.filter(suppressed=True).count(), 1)
        hidden = Event.objects.get(suppressed=True)
        self.assertEqual(hidden.canonical_id, expected_keeper.id)
        self.assertFalse(Event.objects.get(id=expected_keeper.id).suppressed)

    def _assert_queued(self):
        self.assertEqual(EventMatch.objects.filter(status='pending').count(), 1)
        self.assertEqual(Event.objects.filter(suppressed=True).count(), 0)

    def test_two_textless_rows_collapse(self):
        a = self._row('ABC123__0__0', name=None, start_date=None)
        self._row('ABC123__1__0', name=None, start_date=None)
        call_command('detect_duplicates', '--exact')
        self._assert_collapsed(expected_keeper=a)

    def test_textless_row_collapses_behind_artist_row(self):
        self._row('ABC123__0__0', name=None, start_date=None)
        with_artist = self._row('ABC123__1__0', name=None, start_date=None,
                                artist='Girl Ultra')
        call_command('detect_duplicates', '--exact')
        self._assert_collapsed(expected_keeper=with_artist)

    def test_textless_row_collapses_behind_dated_row(self):
        self._row('ABC123__0__0', name=None, start_date=None)
        dated = self._row('ABC123__1__0', name=None, start_date=timezone.now())
        call_command('detect_duplicates', '--exact')
        self._assert_collapsed(expected_keeper=dated)

    def test_two_artist_rows_without_title_or_date_still_queue(self):
        # Both sides carry text a reviewer can compare: could be two distinct
        # roundup events the extractor could not title — a human decides.
        self._row('ABC123__0__0', name=None, start_date=None, artist='DJ A')
        self._row('ABC123__1__0', name=None, start_date=None, artist='DJ B')
        call_command('detect_duplicates', '--exact')
        self._assert_queued()

    def test_dated_row_vs_artist_row_still_queues(self):
        self._row('ABC123__0__0', name=None, start_date=timezone.now())
        self._row('ABC123__1__0', name=None, start_date=None, artist='DJ B')
        call_command('detect_duplicates', '--exact')
        self._assert_queued()

    def test_legacy_row_vs_keyed_row_both_with_text_still_queues(self):
        # The common production shape: an old row with no source_key next to
        # a new keyed one. Keying must not change the reviewability rule.
        self._row(None, name=None, start_date=None, artist='DJ A')
        self._row('ABC123__1__0', name=None, start_date=None, artist='DJ B')
        call_command('detect_duplicates', '--exact')
        self._assert_queued()

    def test_thumbnail_only_row_never_outranks_text_row(self):
        # A row that is only a thumbnail + link must lose to a row carrying
        # real extracted text, even if the text row has no thumbnail at all.
        media_only = self._row('ABC123__0__0', name=None, start_date=None,
                               ticket_link='https://www.instagram.com/p/ABC123/')
        text_row = self._row('ABC123__1__0', name=None, start_date=None,
                             artist='Girl Ultra', orig_thumb=None)
        call_command('detect_duplicates', '--exact')
        self._assert_collapsed(expected_keeper=text_row)
        self.assertTrue(Event.objects.get(id=media_only.id).suppressed)

    def test_full_tie_keeps_oldest_row(self):
        # Two rows identical on every scored field: the tie-break is the
        # lowest id (first seen), so re-runs are deterministic.
        first = self._row('ABC123__0__0', name=None, start_date=None,
                          orig_thumb='https://img/same.jpg')
        self._row('ABC123__1__0', name=None, start_date=None,
                  orig_thumb='https://img/same.jpg')
        call_command('detect_duplicates', '--exact')
        self._assert_collapsed(expected_keeper=first)


class RoundupClusterTests(TestCase):
    """A post that yields several DISTINCT events must keep one row per
    event, collapse drift twins WITHIN each event, and must not queue the
    distinct events against each other. Replays the 2026-08-27 finding: with
    one keeper per post, 3 of 4 drift twins were queued and every distinct
    event became a 'same-post pair' for the owner."""

    def _row(self, key, name, day, shortcode='RENATE', **kw):
        base = dict(shortcode=shortcode, source_key=key, name=name,
                    start_date=timezone.now() + timedelta(days=day),
                    is_duplicate=False, suppressed=False, is_event=True,
                    orig_link='https://www.instagram.com/p/%s/' % shortcode,
                    orig_thumb='https://img/%s.jpg' % key)
        base.update(kw)
        return Event.objects.create(**base)

    def _pending(self):
        return EventMatch.objects.filter(status='pending').count()

    def test_distinct_events_of_one_post_are_not_queued_or_hidden(self):
        self._row('RENATE__ea', 'GARDEN hosted by Remoto Rec', 0)
        self._row('RENATE__eb', 'GREEN hosted by Handmade DJ', 1)
        self._row('RENATE__ec', 'RED hosted by Franz Scala', 2)
        call_command('detect_duplicates', '--exact')
        self.assertEqual(Event.objects.filter(suppressed=True).count(), 0)
        self.assertEqual(self._pending(), 0)

    def test_drift_twin_collapses_into_its_own_event_not_the_first_row(self):
        a = self._row('RENATE__ea', 'GARDEN hosted by Remoto Rec', 0, artist='Atomlui')
        b = self._row('RENATE__eb', 'GREEN hosted by Handmade DJ', 1)
        twin = self._row('RENATE__eb2', 'Green hosted by Handmade DJ', 1)  # re-extraction drift
        call_command('detect_duplicates', '--exact')
        for e in (a, b, twin):
            e.refresh_from_db()
        self.assertTrue(twin.suppressed)
        self.assertEqual(twin.canonical_id, b.id)           # its own event, not row A
        self.assertFalse(a.suppressed)
        self.assertFalse(b.suppressed)
        self.assertEqual(self._pending(), 0)

    def test_single_event_post_behaviour_unchanged(self):
        keeper = self._row('P__0__0', 'Klubnacht', 0, shortcode='P', artist='X')
        self._row('P__0__1', 'Klubnacht', 0, shortcode='P')
        call_command('detect_duplicates', '--exact')
        hidden = Event.objects.filter(shortcode='P', suppressed=True)
        self.assertEqual(hidden.count(), 1)
        self.assertEqual(hidden.get().canonical_id, keeper.id)
        self.assertEqual(self._pending(), 0)

    def test_oldest_textless_row_does_not_swallow_a_roundup(self):
        # Review finding 2026-08-28: a nameless/dateless row that is the
        # OLDEST of the post seeded a cluster that absorbed every distinct
        # titled event (an empty signature contradicts nothing), re-queueing
        # them all. It must attach last and hide; the events stay distinct.
        blank = self._row('RENATE__0__0', None, 0, artist='DJ A', start_date=None)
        a = self._row('RENATE__ea', 'GARDEN hosted by Remoto Rec', 0)
        self._row('RENATE__eb', 'GREEN hosted by Handmade DJ', 1)
        self._row('RENATE__ec', 'RED hosted by Franz Scala', 2)
        call_command('detect_duplicates', '--exact')
        blank.refresh_from_db()
        self.assertTrue(blank.suppressed)
        self.assertEqual(blank.canonical_id, a.id)
        self.assertEqual(Event.objects.filter(suppressed=True).count(), 1)
        self.assertEqual(self._pending(), 0)

    def test_existing_pending_pair_that_now_qualifies_is_collapsed(self):
        # Found live (2026-08-28): an identical-title, identical-date pair sat
        # in the owner's queue because an existing EventMatch, even a merely
        # PENDING one, made the collapse branch skip it.
        keeper = self._row('P__0__0', 'ferrazmusic', 0, shortcode='P', artist='X')
        twin = self._row('P__0__1', 'ferrazmusic', 0, shortcode='P')
        EventMatch.objects.create(event_a=keeper, event_b=twin, score=0.0,
                                  match_type='exact_link', status='pending')
        call_command('detect_duplicates', '--exact')
        twin.refresh_from_db()
        self.assertTrue(twin.suppressed)
        self.assertEqual(twin.canonical_id, keeper.id)
        self.assertEqual(EventMatch.objects.get(event_a=keeper, event_b=twin).status, 'confirmed')
        self.assertEqual(self._pending(), 0)

    def test_rejected_pair_is_never_reopened(self):
        # The owner said "not duplicates": the nightly pass must respect it
        # even though the rows look identical.
        a = self._row('P__0__0', 'ferrazmusic', 0, shortcode='P', artist='X')
        b = self._row('P__0__1', 'ferrazmusic', 0, shortcode='P')
        EventMatch.objects.create(event_a=a, event_b=b, score=0.0,
                                  match_type='exact_link', status='rejected')
        call_command('detect_duplicates', '--exact')
        b.refresh_from_db()
        self.assertFalse(b.suppressed)
        self.assertEqual(EventMatch.objects.get(event_a=a, event_b=b).status, 'rejected')

    def test_confirmed_pair_is_never_reopened_even_after_owner_restores_the_row(self):
        # The critical case: a pair was collapsed (confirmed), then the owner
        # restored the row via remove_duplicate_label, which clears the Event
        # fields but never touches EventMatch. The match stays 'confirmed' and
        # a re-run must not re-hide the row the owner explicitly brought back.
        keeper = self._row('P__0__0', 'ferrazmusic', 0, shortcode='P', artist='X')
        twin = self._row('P__0__1', 'ferrazmusic', 0, shortcode='P')
        EventMatch.objects.create(event_a=keeper, event_b=twin, score=100.0,
                                  match_type='exact_link', status='confirmed')
        twin.suppressed = False; twin.canonical = None
        twin.is_duplicate = False; twin.duplicate_link = None
        twin.save()
        call_command('detect_duplicates', '--exact')
        twin.refresh_from_db()
        self.assertFalse(twin.suppressed)
        self.assertEqual(EventMatch.objects.get(event_a=keeper, event_b=twin).status, 'confirmed')

    def test_nameless_rows_collapse_behind_the_titled_event(self):
        # Unchanged behaviour: nameless, dateless per-slide rows join the
        # titled event's cluster and hide behind it (they carry no evidence of
        # being a distinct event), exactly as the 25k-row collapse did.
        titled = self._row('RENATE__ea', 'GARDEN hosted by Remoto Rec', 0)
        self._row('RENATE__0__1', None, 0, artist='DJ A', start_date=None)
        self._row('RENATE__0__2', None, 0, artist='DJ B', start_date=None)
        call_command('detect_duplicates', '--exact')
        hidden = Event.objects.filter(shortcode='RENATE', suppressed=True)
        self.assertEqual(hidden.count(), 2)
        self.assertTrue(all(h.canonical_id == titled.id for h in hidden))
        self.assertEqual(self._pending(), 0)
