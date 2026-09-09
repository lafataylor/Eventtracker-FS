"""Search: tolerate a typo, without diluting a query that already works.

Ticket 3 asked for search across every field plus fuzzy matching. The fields
part shipped (name, artist, opener, host, promoter, offering, genres, venue,
city, handle) along with accent folding and punctuation squashing, so
"hip-hop", "hiphop" and "hip hop" all find each other. One wrong letter still
returned nothing: on production 2026-09-08, "zenner" gave 8 results and
"zennerr" gave 0.

Fuzzy is a FALLBACK, not a widening. A query that already finds plenty is left
exactly as it was - dropping near-misses into a healthy result set would make
good searches worse to fix bad ones.
"""
from datetime import timedelta

from django.test import TestCase
from django.utils import timezone

from .models import Event, Venue


class SearchFuzzyFixture:
    def setUp(self):
        self.soon = timezone.now() + timedelta(days=5)
        self._ev('Zenner Open Air', artist='Marcel Dettmann')
        self._ev('Zenner Sunset Session', artist='Anja Schneider')
        # A crowded term, to prove a healthy query is not diluted.
        for i in range(8):
            self._ev(f'Techno Night {i}', artist='Various')
        # Deliberately WITHIN fuzzy range of "techno" (rapidfuzz
        # partial_ratio 90.9) but not a substring of it. Without this the
        # dilution test proves nothing: dropping the fallback threshold would
        # let fuzzy run on a healthy query and nothing in the fixture would
        # notice. "Tecno" is also the ordinary Spanish spelling, so this is
        # the real case on a site that covers Mexico City.
        self._ev('Tecno Warehouse', artist='Various')

    def _ev(self, name, artist=''):
        return Event.objects.create(
            name=name, artist=artist, start_date=self.soon,
            is_duplicate=False, suppressed=False, is_event=True,
            venue=Venue.objects.create(address='somewhere'))

    def _search(self, query):
        res = self.client.get('/v1/event/search/', {'query': query})
        self.assertEqual(res.status_code, 200)
        return {e['name'] for e in (res.json().get('data') or [])}


class TypoToleranceTests(SearchFuzzyFixture, TestCase):
    def test_exact_spelling_still_works(self):
        self.assertEqual(self._search('zenner'),
                         {'Zenner Open Air', 'Zenner Sunset Session'})

    def test_one_extra_letter_still_finds_it(self):
        self.assertEqual(self._search('zennerr'),
                         {'Zenner Open Air', 'Zenner Sunset Session'})

    def test_one_wrong_letter_still_finds_it(self):
        self.assertEqual(self._search('zennef'),
                         {'Zenner Open Air', 'Zenner Sunset Session'})

    def test_a_typo_in_an_artist_name_finds_it(self):
        # 'dettmen', not 'dettman': the latter is a prefix of Dettmann and
        # already matched by substring, so it would prove nothing.
        self.assertIn('Zenner Open Air', self._search('dettmen'))


class FuzzyDoesNotDiluteTests(SearchFuzzyFixture, TestCase):
    def test_a_query_with_plenty_of_hits_is_unchanged(self):
        names = self._search('techno')
        self.assertEqual(len(names), 8)
        # The near miss exists and is deliberately NOT returned: eight exact
        # hits is a working search, and padding it would make it worse.
        self.assertNotIn('Tecno Warehouse', names)
        self.assertNotIn('Zenner Open Air', names)

    def test_the_near_miss_is_reachable_when_the_query_needs_it(self):
        # Same row, opposite situation: "tecno" finds nothing exactly, so the
        # fallback earns its keep - and a Spanish speaker searching "tecno"
        # reaches the techno listings too.
        found = self._search('tecno')
        self.assertIn('Tecno Warehouse', found)
        self.assertIn('Techno Night 0', found)

    def test_an_unrelated_query_still_returns_nothing(self):
        self.assertEqual(self._search('helsinki'), set())

    def test_a_short_query_still_matches_as_a_substring(self):
        # 'zen' is a real substring of Zenner; the existing behaviour is
        # correct and fuzzy must not disturb it.
        self.assertEqual(self._search('zen'),
                         {'Zenner Open Air', 'Zenner Sunset Session'})

    def test_a_short_typo_is_not_fuzzy_matched(self):
        # 3 characters or fewer are far too promiscuous to score: at that
        # length almost everything is within one edit of something.
        self.assertEqual(self._search('zne'), set())
