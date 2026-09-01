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
        # is_event=True is explicit here: the ambiguity rule is about rows a
        # visitor can actually see. A pair where BOTH sides are non-events is
        # collapsed instead (see RoundupClusterTests).
        self._row('ABC123__0__0', name=None, start_date=None, artist='DJ A', is_event=True)
        self._row('ABC123__1__0', name=None, start_date=None, artist='DJ B', is_event=True)
        call_command('detect_duplicates', '--exact')
        self._assert_queued()

    def test_dated_row_vs_artist_row_still_queues(self):
        self._row('ABC123__0__0', name=None, start_date=timezone.now(), is_event=True)
        self._row('ABC123__1__0', name=None, start_date=None, artist='DJ B', is_event=True)
        call_command('detect_duplicates', '--exact')
        self._assert_queued()

    def test_legacy_row_vs_keyed_row_both_with_text_still_queues(self):
        # The common production shape: an old row with no source_key next to
        # a new keyed one. Keying must not change the reviewability rule.
        self._row(None, name=None, start_date=None, artist='DJ A', is_event=True)
        self._row('ABC123__1__0', name=None, start_date=None, artist='DJ B', is_event=True)
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

    def test_pair_of_non_events_is_collapsed_not_queued(self):
        # Owner feedback 2026-08-30: "most of the events in the duplicate
        # pairs section are not actually events". Measured: 85 of 165 pending
        # pairs had BOTH sides is_event != True. Such a row shows nowhere (the
        # feed filters duplicates, search excludes is_event=False), so there is
        # nothing for a reviewer to rescue and nothing to compare.
        a = self._row('P__0__0', None, 0, shortcode='P', is_event=False,
                      start_date=None, venue=None, artist='DJ A')
        self._row('P__0__1', None, 0, shortcode='P', is_event=False,
                  start_date=None, artist='DJ B')
        call_command('detect_duplicates', '--exact')
        self.assertEqual(self._pending(), 0)
        self.assertEqual(Event.objects.filter(shortcode='P', suppressed=True).count(), 1)
        self.assertEqual(Event.objects.get(shortcode='P', suppressed=True).canonical_id, a.id)

    def test_non_event_pair_one_day_apart_collapses_deliberately(self):
        # Decided behaviour (review 2026-08-31), not an accident: two rows
        # that are BOTH explicitly not-an-event collapse even when their dates
        # sit within the ±1-day nightlife tolerance and secondary fields
        # differ. Neither row can appear in any feed or search, so review
        # would be a choice between two invisible rows; the loser stays
        # restorable from the merged scope.
        keeper = self._row('P__0__0', None, 0, shortcode='P', is_event=False,
                           artist='DJ A', genres='house')
        self._row('P__0__1', None, 1, shortcode='P', is_event=False,
                  artist='DJ B', genres='techno')
        call_command('detect_duplicates', '--exact')
        self.assertEqual(self._pending(), 0)
        hidden = Event.objects.filter(shortcode='P', suppressed=True)
        self.assertEqual(hidden.count(), 1)
        self.assertEqual(hidden.get().canonical_id, keeper.id)

    def test_unclassified_row_is_not_treated_as_a_non_event(self):
        # is_event NULL means "never classified", not "not an event":
        # search_events filters ~Q(is_event=False) precisely so NULL rows stay
        # findable. A findable row must keep its review.
        self._row('P__0__0', None, 0, shortcode='P', is_event=None,
                  start_date=None, artist='DJ A')
        self._row('P__0__1', None, 0, shortcode='P', is_event=False,
                  start_date=None, artist='DJ B')
        call_command('detect_duplicates', '--exact')
        self.assertEqual(self._pending(), 1)
        self.assertEqual(Event.objects.filter(shortcode='P', suppressed=True).count(), 0)

    def test_non_event_beside_a_real_event_still_queues(self):
        # Only a pair where BOTH sides are non-events is safe to collapse: if
        # one side is a real listing the classification may simply be wrong on
        # the other, so a human decides.
        self._row('P__0__0', None, 0, shortcode='P', is_event=False,
                  start_date=None, artist='DJ A')
        self._row('P__0__1', None, 0, shortcode='P', is_event=True,
                  start_date=None, artist='DJ B')
        call_command('detect_duplicates', '--exact')
        self.assertEqual(self._pending(), 1)
        self.assertEqual(Event.objects.filter(shortcode='P', suppressed=True).count(), 0)

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


class ResolveDeleteBothTests(TestCase):
    """Owner feedback 2026-08-30: "there should be a way to delete both of
    the suggested duplicates". delete_both hard-deletes both events of a pair
    and blacklists their posts (same rule as AdminEvent.delete) so the
    nightly scrape cannot re-ingest either."""

    def setUp(self):
        from c_auth.models import User
        import jwt
        u = User.objects.create(email='del@test.dev', usertype='admin')
        u.set_password('x'); u.save()
        self.tok = jwt.encode({'id': u.id}, 'secret', algorithm='HS256')
        self.a = Event.objects.create(name='A', orig_link='https://ig/p/AA/', is_event=True)
        self.b = Event.objects.create(name='B', orig_link='https://ig/p/BB/', is_event=True)
        self.m = EventMatch.objects.create(event_a=self.a, event_b=self.b,
                                           score=0.0, match_type='exact_link',
                                           status='pending')

    def _resolve(self, action):
        return self.client.post('/v1/event/matches/resolve/',
                                {'match_id': self.m.id, 'action': action},
                                content_type='application/json',
                                HTTP_AUTHORIZATION='Token ' + self.tok)

    def test_delete_both_removes_events_and_blacklists(self):
        from event.models import BlacklistedLink
        r = self._resolve('delete_both')
        self.assertEqual(r.status_code, 200)
        self.assertFalse(Event.objects.filter(id__in=[self.a.id, self.b.id]).exists())
        self.assertFalse(EventMatch.objects.filter(id=self.m.id).exists())
        self.assertEqual(BlacklistedLink.objects.filter(
            url__in=['https://ig/p/AA/', 'https://ig/p/BB/']).count(), 2)

    def test_unknown_action_still_rejected(self):
        r = self._resolve('obliterate')
        self.assertEqual(r.status_code, 400)
        self.assertFalse(Event.objects.filter(id=self.a.id, suppressed=True).exists())
        self.assertTrue(EventMatch.objects.filter(id=self.m.id, status='pending').exists())

    def test_delete_both_spares_the_link_a_third_event_still_uses(self):
        # exact-link cluster of 3: deleting one pair must NOT blacklist the
        # shared post, or the scrape could never refresh the survivor.
        from event.models import BlacklistedLink
        shared = 'https://ig/p/SHARED/'
        for ev in (self.a, self.b):
            ev.orig_link = shared
            ev.save(update_fields=['orig_link'])
        survivor = Event.objects.create(name='C', orig_link=shared,
                                        is_event=True)
        r = self._resolve('delete_both')
        self.assertEqual(r.status_code, 200)
        self.assertFalse(Event.objects.filter(id__in=[self.a.id, self.b.id]).exists())
        self.assertTrue(Event.objects.filter(id=survivor.id).exists())
        self.assertFalse(BlacklistedLink.objects.filter(url=shared).exists())

    def test_admin_delete_spares_the_link_a_survivor_still_uses(self):
        # The cluster review's "keep this one" deletes the losers through
        # admin/event/ DELETE; the keeper shares their orig_link. The keeper's
        # post must stay scrapeable.
        from event.models import BlacklistedLink
        shared = 'https://ig/p/KEEPME/'
        keeper = Event.objects.create(name='keeper', orig_link=shared,
                                      is_event=True)
        losers = [Event.objects.create(name=f'loser{i}', orig_link=shared,
                                       is_event=True) for i in range(2)]
        solo = Event.objects.create(name='solo junk',
                                    orig_link='https://ig/p/JUNK/',
                                    is_event=True)
        r = self.client.delete('/v1/admin/event/',
                               {'events': [e.id for e in losers] + [solo.id]},
                               content_type='application/json',
                               HTTP_AUTHORIZATION='Token ' + self.tok)
        self.assertEqual(r.status_code, 200)
        self.assertTrue(Event.objects.filter(id=keeper.id).exists())
        self.assertFalse(Event.objects.filter(
            id__in=[e.id for e in losers] + [solo.id]).exists())
        # shared link spared, solo junk's link blacklisted as before
        self.assertFalse(BlacklistedLink.objects.filter(url=shared).exists())
        self.assertTrue(BlacklistedLink.objects.filter(
            url='https://ig/p/JUNK/').exists())


class RecoveryScopeTests(TestCase):
    """The recovery list must be able to answer "what was this hidden behind?"
    (owner, 2026-08-30: otherwise "I would have to go back to the main page
    and search each event"). Default scope stays the restorable auto-flags so
    they are not buried under ~25k collapses."""

    def setUp(self):
        from c_auth.models import User
        self.user = User.objects.create(email='rec@test.dev', usertype='admin')
        self.user.set_password('x'); self.user.save()
        import jwt
        self.tok = jwt.encode({'id': self.user.id}, 'secret', algorithm='HS256')
        self.keeper = Event.objects.create(name='Real Event', is_duplicate=False,
                                           suppressed=False, is_event=True,
                                           orig_link='https://insta/p/A/')
        self.merged = Event.objects.create(name='Re-scrape', is_duplicate=True,
                                           suppressed=True, canonical=self.keeper,
                                           is_event=True)
        self.flagged = Event.objects.create(name='Old auto-flag', is_duplicate=True,
                                            suppressed=False, canonical=None,
                                            is_event=True)

    def _get(self, scope=None):
        url = '/v1/event/getDuplicateEvents/' + (f'?scope={scope}' if scope else '')
        return self.client.get(url, HTTP_AUTHORIZATION='Token ' + self.tok).json()

    def test_default_scope_excludes_merged_rows(self):
        ids = [e['id'] for e in self._get()['duplicate_events']]
        self.assertIn(self.flagged.id, ids)
        self.assertNotIn(self.merged.id, ids)

    def test_merged_scope_reports_what_it_was_kept_instead_of(self):
        rows = self._get('merged')['duplicate_events']
        ids = [e['id'] for e in rows]
        self.assertIn(self.merged.id, ids)
        self.assertNotIn(self.flagged.id, ids)
        row = next(e for e in rows if e['id'] == self.merged.id)
        self.assertEqual(row['hidden_reason'], 'duplicate')
        self.assertEqual(row['kept_instead']['id'], self.keeper.id)
        self.assertEqual(row['kept_instead']['name'], 'Real Event')

    def test_flagged_rows_say_why_without_a_keeper(self):
        row = next(e for e in self._get()['duplicate_events'] if e['id'] == self.flagged.id)
        self.assertEqual(row['hidden_reason'], 'flagged_by_scraper')
        self.assertIsNone(row['kept_instead'])


class FuzzyAutoMergeTests(TestCase):
    """Task 4 (owner feedback 2026-08-30, Hood Rave x Dance Mania): identical
    same-day cross-post listings should merge without review, but ONLY above
    a high bar — score >= threshold AND the exact same day. Everything in the
    82-95 band, and anything a day apart, still goes to a human."""

    def _ev(self, name, day, shortcode, **kw):
        base = dict(name=name, shortcode=shortcode,
                    start_date=timezone.now() + timedelta(days=day),
                    orig_link='https://www.instagram.com/p/%s/' % shortcode,
                    is_duplicate=False, suppressed=False, is_event=True)
        base.update(kw)
        return Event.objects.create(**base)

    def _run(self, **kw):
        call_command('detect_duplicates', '--fuzzy',
                     '--auto-merge-threshold', '95', **kw)

    def test_identical_same_day_pair_is_auto_merged(self):
        # the more complete row (artist + time) must be the keeper
        keeper = self._ev('Hood Rave Summer Jam', 3, 'POSTA',
                          artist='Dance Mania', start_time='22:00')
        loser = self._ev('Hood Rave Summer Jam', 3, 'POSTB')
        self._run()
        loser.refresh_from_db(); keeper.refresh_from_db()
        self.assertTrue(loser.suppressed)
        self.assertEqual(loser.canonical_id, keeper.id)
        self.assertTrue(loser.is_duplicate)
        self.assertFalse(keeper.suppressed)
        m = EventMatch.objects.get(event_a__in=[keeper, loser],
                                   event_b__in=[keeper, loser])
        self.assertEqual(m.status, 'confirmed')

    def test_mid_band_pair_is_queued_not_merged(self):
        from event.dedupe import event_signature, score_pair
        a = self._ev('Taco Tuesday Fiesta', 3, 'POSTA',
                     artist='Sonido Gallo')
        b = self._ev('Taco Tuesday Fiesta', 3, 'POSTB',
                     artist='Sonido Martines')
        # guard: the fixture really sits in the review band
        s = score_pair(event_signature(a), event_signature(b))
        self.assertTrue(82 <= s < 95, f'fixture score {s} left the band')
        self._run()
        a.refresh_from_db(); b.refresh_from_db()
        self.assertFalse(a.suppressed or b.suppressed)
        self.assertEqual(EventMatch.objects.filter(status='pending').count(), 1)

    def test_next_day_pair_is_never_auto_merged(self):
        # LADW3 shape: identical listing, one day apart -> review, not merge
        a = self._ev('LADW Group Show', 3, 'POSTA')
        b = self._ev('LADW Group Show', 4, 'POSTB')
        self._run()
        a.refresh_from_db(); b.refresh_from_db()
        self.assertFalse(a.suppressed or b.suppressed)
        self.assertEqual(EventMatch.objects.filter(status='pending').count(), 1)

    def test_rejected_verdict_is_never_overridden(self):
        a = self._ev('Cumbia Night', 3, 'POSTA')
        b = self._ev('Cumbia Night', 3, 'POSTB')
        EventMatch.objects.create(event_a=a, event_b=b, score=100.0,
                                  match_type='fuzzy', status='rejected')
        self._run()
        a.refresh_from_db(); b.refresh_from_db()
        self.assertFalse(a.suppressed or b.suppressed)
        self.assertEqual(EventMatch.objects.get(event_a=a, event_b=b).status,
                         'rejected')

    def test_triple_converges_to_one_keeper_without_chains(self):
        rows = [self._ev('Techno Marathon', 3, 'POST%d' % i,
                         artist='Same Artist') for i in range(3)]
        rows[0].start_time = '23:00'
        rows[0].save(update_fields=['start_time'])  # most complete -> keeper
        self._run()
        for r in rows:
            r.refresh_from_db()
        keepers = [r for r in rows if not r.suppressed]
        losers = [r for r in rows if r.suppressed]
        self.assertEqual(len(keepers), 1)
        # every loser points STRAIGHT at the keeper — no loser->loser chain
        for l in losers:
            self.assertEqual(l.canonical_id, keepers[0].id)

    def test_dry_run_writes_nothing(self):
        self._ev('Hood Rave Summer Jam', 3, 'POSTA')
        self._ev('Hood Rave Summer Jam', 3, 'POSTB')
        self._run(dry_run=True)
        self.assertEqual(EventMatch.objects.count(), 0)
        self.assertFalse(Event.objects.filter(suppressed=True).exists())

    def test_ascending_completeness_triple_leaves_no_chain(self):
        # The nasty ordering: completeness INCREASES with id, so the first
        # pair's keeper later loses to the third row. The earlier loser must
        # be re-pointed at the final keeper, never left aiming at a
        # suppressed row.
        r1 = self._ev('Techno Marathon', 3, 'POST1', artist='Same Artist')
        r2 = self._ev('Techno Marathon', 3, 'POST2', artist='Same Artist',
                      start_time='23:00')
        r3 = self._ev('Techno Marathon', 3, 'POST3', artist='Same Artist',
                      start_time='23:00', price='150')
        self._run()
        for r in (r1, r2, r3):
            r.refresh_from_db()
        self.assertFalse(r3.suppressed)
        self.assertTrue(r1.suppressed and r2.suppressed)
        self.assertEqual(r1.canonical_id, r3.id)
        self.assertEqual(r2.canonical_id, r3.id)

    def test_keeper_with_stale_duplicate_flag_is_unhidden(self):
        # keep_a clears the keeper's legacy over-flagging; the auto path
        # must too, or the merge hides BOTH rows.
        keeper = self._ev('Hood Rave Summer Jam', 3, 'POSTA',
                          artist='Dance Mania', start_time='22:00',
                          is_duplicate=True)
        loser = self._ev('Hood Rave Summer Jam', 3, 'POSTB')
        self._run()
        keeper.refresh_from_db(); loser.refresh_from_db()
        self.assertFalse(keeper.is_duplicate)
        self.assertFalse(keeper.suppressed)
        self.assertTrue(loser.suppressed)

    def test_dry_run_counts_match_a_real_run(self):
        import io
        from django.core.management import call_command as cc
        for i in range(3):
            self._ev('Techno Marathon', 3, 'POST%d' % i,
                     artist='Same Artist',
                     start_time='23:00' if i else None)
        def merged_count(dry):
            out = io.StringIO()
            cc('detect_duplicates', '--fuzzy', '--auto-merge-threshold', '95',
               dry_run=dry, stdout=out)
            import re as _re
            return int(_re.search(r'auto-merge[d]? (\d+)', out.getvalue()).group(1))
        dry_n = merged_count(True)
        self.assertEqual(EventMatch.objects.count(), 0)  # dry wrote nothing
        real_n = merged_count(False)
        self.assertEqual(dry_n, real_n)


class NamelessVenueAnchorTests(TestCase):
    """The owner's 2026-09-01 screenshot: one account re-promoting one bazaar
    across four separate posts, every row untitled, so score_pair's both-names
    gate scored each pair 0 and all four stayed visible."""

    def _sig(self, **kw):
        base = dict(id=1, name='', artist='', venue='', date=None, poster=None)
        base.update(kw)
        return base

    def test_nameless_same_account_date_and_venue_is_a_duplicate(self):
        from datetime import date
        from event.dedupe import score_pair, FUZZY_THRESHOLD
        a = self._sig(id=1, poster=7, date=date(2026, 9, 4),
                      venue='tonala 308 eoma sur')
        b = self._sig(id=2, poster=7, date=date(2026, 9, 4),
                      venue='tonala 308, roma sur, mexico')
        self.assertGreaterEqual(score_pair(a, b), FUZZY_THRESHOLD)

    def test_named_beside_nameless_at_the_same_venue_matches(self):
        # the "mixed" bucket; completeness makes the NAMED row the keeper
        from datetime import date
        from event.dedupe import score_pair, FUZZY_THRESHOLD
        a = self._sig(id=1, poster=7, date=date(2026, 9, 4), name='bazar',
                      venue='tonala 308, roma sur')
        b = self._sig(id=2, poster=7, date=date(2026, 9, 4),
                      venue='tonala 308, roma sur')
        self.assertGreaterEqual(score_pair(a, b), FUZZY_THRESHOLD)

    def test_different_accounts_do_not_anchor(self):
        from datetime import date
        from event.dedupe import score_pair
        a = self._sig(id=1, poster=7, date=date(2026, 9, 4), venue='same place')
        b = self._sig(id=2, poster=9, date=date(2026, 9, 4), venue='same place')
        self.assertEqual(score_pair(a, b), 0.0)

    def test_different_days_do_not_anchor(self):
        # +/-1 day is fine for titled nightlife; with no title it is not evidence
        from datetime import date
        from event.dedupe import score_pair
        a = self._sig(id=1, poster=7, date=date(2026, 9, 4), venue='same place')
        b = self._sig(id=2, poster=7, date=date(2026, 9, 5), venue='same place')
        self.assertEqual(score_pair(a, b), 0.0)

    def test_different_venues_do_not_anchor(self):
        from datetime import date
        from event.dedupe import score_pair
        a = self._sig(id=1, poster=7, date=date(2026, 9, 4),
                      venue='club gretchen, berlin')
        b = self._sig(id=2, poster=7, date=date(2026, 9, 4),
                      venue='foro indie rocks, cdmx')
        self.assertEqual(score_pair(a, b), 0.0)

    def test_missing_venue_never_anchors(self):
        from datetime import date
        from event.dedupe import score_pair
        a = self._sig(id=1, poster=7, date=date(2026, 9, 4), venue='')
        b = self._sig(id=2, poster=7, date=date(2026, 9, 4), venue='')
        self.assertEqual(score_pair(a, b), 0.0)

    def test_undated_nameless_rows_never_anchor(self):
        from event.dedupe import score_pair
        a = self._sig(id=1, poster=7, date=None, venue='tonala 308')
        b = self._sig(id=2, poster=7, date=None, venue='tonala 308')
        self.assertEqual(score_pair(a, b), 0.0)

    def test_same_street_different_building_does_not_anchor(self):
        # measured: these score 92.9 by string similarity, HIGHER than the
        # same venue spelled two ways - the street number is what separates them
        from datetime import date
        from event.dedupe import score_pair
        a = self._sig(id=1, poster=7, date=date(2026, 9, 4),
                      venue='tonala 308, roma sur, mexico')
        b = self._sig(id=2, poster=7, date=date(2026, 9, 4),
                      venue='tonala 250, roma sur, mexico')
        self.assertEqual(score_pair(a, b), 0.0)

    def test_city_only_addresses_never_anchor(self):
        # two different venues whose address degraded to the city score 100
        from datetime import date
        from event.dedupe import score_pair
        a = self._sig(id=1, poster=7, date=date(2026, 9, 4), venue='berlin, germany')
        b = self._sig(id=2, poster=7, date=date(2026, 9, 4), venue='berlin, germany')
        self.assertEqual(score_pair(a, b), 0.0)


class VenueAnchorKeeperTests(TestCase):
    """The venue anchor can pair an untitled row with a TITLED one. The whole
    safety case for auto-merging those rests on the titled row always winning
    the keeper contest, so that a merge can only ever hide the untitled copy.
    If completeness tiers are ever reordered, this must fail loudly."""

    def test_titled_row_always_outranks_an_untitled_one(self):
        from django.utils import timezone
        day = timezone.now() + timedelta(days=5)
        titled = Event.objects.create(name='JEAN TONIQUE', start_date=day,
                                      is_event=True, is_duplicate=False)
        # give the untitled row MORE descriptive fields; it must still lose,
        # because a title is identifying and the rest merely describes
        untitled = Event.objects.create(name=None, start_date=day,
                                        artist='Someone', genres='house',
                                        price='200', start_time='22:00',
                                        is_event=True, is_duplicate=False)
        self.assertGreater(completeness(titled), completeness(untitled))
