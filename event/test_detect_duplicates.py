"""Tests for the detect_duplicates management command (Ticket 1)."""
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
