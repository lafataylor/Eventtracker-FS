"""Ticket 3 regression tests: search and filter correctness.

Pins the specific defects that made search "miss events":
  * venue NAME was never searched (only address/city/state/country)
  * events with no start_date were excluded outright
  * filter_events kept only the LAST filter and 500'd on unknown types
  * price filtering enumerated candidate strings and matched almost nothing

Run: python manage.py test event.test_search
"""

from datetime import timedelta

from django.test import TestCase
from django.utils import timezone

from event.models import Event, Venue
from event.views import _parse_price_bounds, _price_within


class PriceMatchingTests(TestCase):
    """price is free text ("$200", "MXN 150", "Free"), not a number."""

    def test_currency_symbols_and_codes(self):
        self.assertTrue(_price_within("$200", 100, 300))
        self.assertTrue(_price_within("MXN 150", 100, 300))
        self.assertTrue(_price_within("150 pesos", 100, 300))
        self.assertTrue(_price_within("€50", 0, 100))

    def test_thousands_separator(self):
        self.assertTrue(_price_within("$1,500", 1000, 2000))

    def test_free_counts_as_zero(self):
        self.assertTrue(_price_within("Free", 0, 50))
        self.assertTrue(_price_within("no cover", 0, 50))
        self.assertTrue(_price_within("Gratis", 0, 50))
        self.assertFalse(_price_within("Free", 10, 50))

    def test_tiered_free_and_paid(self):
        # "Free before 11pm, $150 after" has BOTH a free tier and a $150 tier,
        # so it matches a cheap filter (free) and a mid filter ($150), but not a
        # gap between them. "11pm" must not be read as a $11 price.
        tiered = "Free before 11pm, $150 after"
        self.assertTrue(_price_within(tiered, 0, 50))     # free tier
        self.assertTrue(_price_within(tiered, 100, 200))  # $150 tier
        self.assertFalse(_price_within(tiered, 60, 90))   # neither tier

    def test_age_barrier_not_read_as_price(self):
        # "18+" is an age restriction, not an $18 price.
        self.assertFalse(_price_within("18+", 10, 30))

    def test_age_stripping_does_not_eat_price_digits(self):
        # The age regex must be \b-anchored: unanchored, "MXN 250 + service fee"
        # matched the "50 +" inside 250 and left "MXN 2", so a 250-peso event
        # answered a $0-50 filter.
        self.assertTrue(_price_within("MXN 250 + service fee", 200, 300))
        self.assertFalse(_price_within("MXN 250 + service fee", 0, 50))

    def test_multiple_tiers_any_in_range(self):
        self.assertTrue(_price_within("$150, $200, $300", 250, 350))
        self.assertFalse(_price_within("$150, $200, $300", 400, 500))

    def test_outside_range_and_unusable(self):
        self.assertFalse(_price_within("$500", 0, 100))
        self.assertFalse(_price_within(None, 0, 100))
        self.assertFalse(_price_within("", 0, 100))
        self.assertFalse(_price_within("ask us", 0, 100))

    def test_bounds_parsing(self):
        self.assertEqual(_parse_price_bounds("between", ["10", "20"]), (10.0, 20.0))
        self.assertEqual(_parse_price_bounds("equal", ["15"]), (15.0, 15.0))
        self.assertIsNone(_parse_price_bounds("between", ["x", "y"]))
        self.assertIsNone(_parse_price_bounds("between", ["10"]))
        self.assertIsNone(_parse_price_bounds("bogus", ["10"]))


class SearchVisibilityTests(TestCase):
    def setUp(self):
        soon = timezone.now() + timedelta(days=7)
        self.venue = Venue.objects.create(
            name="Bohnengold", address="Reichenberger Str. 153", city="Berlin")
        # Venue name is NOT in the address -> only findable if venue__name is searched.
        self.by_venue = Event.objects.create(
            name="Klubnacht", venue=self.venue, start_date=soon,
            is_event=True, is_duplicate=False)
        # Real event with no extracted date -> was excluded outright.
        self.undated = Event.objects.create(
            name="Undated Klubnacht", start_date=None,
            is_event=True, is_duplicate=False)
        # Not an event, and a duplicate: both should stay hidden.
        self.not_event = Event.objects.create(
            name="Klubnacht poster", start_date=soon,
            is_event=False, is_duplicate=False)
        self.dupe = Event.objects.create(
            name="Klubnacht dupe", start_date=soon,
            is_event=True, is_duplicate=True)

    def _search(self, q):
        res = self.client.get('/v1/event/search/', {'query': q})
        self.assertEqual(res.status_code, 200)
        return [e['id'] for e in res.json()['data']]

    def test_venue_name_is_searchable(self):
        # 6,738 production venues have a name absent from their address.
        self.assertIn(self.by_venue.id, self._search("Bohnengold"))

    def test_undated_event_is_findable(self):
        # 2,534 real production events have no start_date.
        self.assertIn(self.undated.id, self._search("Undated"))

    def test_non_events_and_duplicates_stay_hidden(self):
        ids = self._search("Klubnacht")
        self.assertNotIn(self.not_event.id, ids)
        self.assertNotIn(self.dupe.id, ids)

    def test_suppressed_event_hidden(self):
        self.by_venue.suppressed = True
        self.by_venue.save(update_fields=['suppressed'])
        self.assertNotIn(self.by_venue.id, self._search("Bohnengold"))

    def test_suppressed_event_is_listed_and_restorable(self):
        """The UI promises "you can restore it later" — so a suppressed event
        must appear in the recovery list AND come back after restoring."""
        self.by_venue.suppressed = True
        self.by_venue.is_duplicate = True
        self.by_venue.save(update_fields=['suppressed', 'is_duplicate'])

        # These two endpoints sit behind the auth middleware. Mint the token
        # through the app's own helper so the signing key lives in exactly one
        # place (c_auth.authentication) and key rotation can't strand a copy
        # here.
        from c_auth.authentication import create_jwt_token
        from c_auth.models import User
        user = User.objects.create(email='t@t.co', password='x')
        token, _refresh = create_jwt_token(user.id, 60)
        auth = {'HTTP_AUTHORIZATION': 'Token ' + token}

        listed = self.client.get('/v1/event/getDuplicateEvents/', **auth)
        ids = [e['id'] for e in listed.json()['duplicate_events']]
        self.assertIn(self.by_venue.id, ids)          # visible to recover

        self.client.post('/v1/event/recoverDuplicate/',
                         {'event_id': str(self.by_venue.id)},
                         content_type='application/json', **auth)
        self.by_venue.refresh_from_db()
        self.assertFalse(self.by_venue.suppressed)    # both flags cleared
        self.assertFalse(self.by_venue.is_duplicate)
        self.assertIn(self.by_venue.id, self._search("Bohnengold"))  # back on site


class FilterEventsTests(TestCase):
    def setUp(self):
        self.soon = timezone.now() + timedelta(days=5)
        self.cheap = Event.objects.create(
            name="Cheap Night", artist="DJ One", price="$50",
            start_date=self.soon, is_event=True, is_duplicate=False)
        self.pricey = Event.objects.create(
            name="Pricey Night", artist="DJ Two", price="MXN 900",
            start_date=self.soon, is_event=True, is_duplicate=False)

    def _filter(self, filters):
        res = self.client.post('/v1/event/filter/', {'filters': filters},
                               content_type='application/json')
        self.assertEqual(res.status_code, 200)
        return [e['id'] for e in res.json()['data']]

    def test_unknown_filter_type_returns_empty_not_500_and_not_everything(self):
        # "run" is offered by the admin UI but has no server handler. It used to
        # NameError -> 500. It must not swing the other way either and return a
        # page of arbitrary events labelled success.
        ids = self._filter([{"type": "run", "condition": "equal",
                             "values": ["anything"]}])
        self.assertEqual(ids, [])

    def test_known_account_filter_still_works(self):
        ids = self._filter([{"type": "account", "condition": "equal",
                             "values": ["nobody-by-this-name"]}])
        self.assertEqual(ids, [])

    def test_or_conjugation_returns_union_not_intersection(self):
        # The UI sends conjugation per filter; it was ignored and everything
        # ANDed, so an "Or" selection wrongly returned the intersection.
        ids = self._filter([
            {"type": "artist", "condition": "equal", "values": ["DJ One"],
             "conjugation": "or"},
            {"type": "artist", "condition": "equal", "values": ["DJ Two"],
             "conjugation": "or"},
        ])
        self.assertIn(self.cheap.id, ids)
        self.assertIn(self.pricey.id, ids)

    def test_or_works_with_the_payload_the_UI_actually_sends(self):
        # Filter.tsx renders the conjugation dropdown only from the SECOND
        # filter onward, so filter 0 always arrives as "and". ANDing it before
        # applying or_q made "DJ One Or DJ Two" return zero rows.
        ids = self._filter([
            {"type": "artist", "condition": "equal", "values": ["DJ One"],
             "conjugation": "and"},
            {"type": "artist", "condition": "equal", "values": ["DJ Two"],
             "conjugation": "or"},
        ])
        self.assertIn(self.cheap.id, ids)
        self.assertIn(self.pricey.id, ids)

    def test_malformed_date_filter_rejected(self):
        res = self.client.post(
            '/v1/event/filter/',
            {'filters': [{"type": "date", "condition": "between",
                          "values": ["not-a-date"]}]},
            content_type='application/json')
        self.assertNotEqual(res.status_code, 200)

    def test_non_date_filter_still_excludes_past_events(self):
        # The date cutoff must apply to every filter type, not just "date".
        past = Event.objects.create(
            name="Old Night", artist="DJ One", price="$50",
            start_date=timezone.now() - timedelta(days=60),
            is_event=True, is_duplicate=False)
        ids = self._filter([{"type": "artist", "condition": "equal",
                             "values": ["DJ One"]}])
        self.assertNotIn(past.id, ids)
        self.assertIn(self.cheap.id, ids)

    def test_multiple_filters_are_combined_not_overwritten(self):
        # Previously only the LAST filter applied, so this returned the pricey
        # event too. Both filters must narrow the result together.
        ids = self._filter([
            {"type": "price", "condition": "between", "values": ["0", "100"]},
            {"type": "artist", "condition": "equal", "values": ["DJ One"]},
        ])
        self.assertIn(self.cheap.id, ids)
        self.assertNotIn(self.pricey.id, ids)

    def test_price_filter_matches_currency_strings(self):
        ids = self._filter([{"type": "price", "condition": "between",
                             "values": ["0", "100"]}])
        self.assertIn(self.cheap.id, ids)
        self.assertNotIn(self.pricey.id, ids)

    def test_empty_filter_list_is_rejected(self):
        res = self.client.post('/v1/event/filter/', {'filters': []},
                               content_type='application/json')
        self.assertNotEqual(res.status_code, 500)


class SamePostRedundancyTests(TestCase):
    """Guards the --exact pass from suppressing distinct events.

    Legacy carousel rows all carry the parent post URL as orig_link, so
    migration 0010 backfills every slide of a roundup to ONE shortcode.
    Collapsing on shortcode alone would permanently hide real events.
    """

    def _sig(self, name, day=None):
        from datetime import date
        return {'id': 0, 'name': (name or '').casefold(), 'artist': '',
                'venue': '', 'date': day or date(2026, 9, 1)}

    def test_no_titles_counts_as_rescrape(self):
        # 72% of production rows have no name; two nameless rows of one post
        # are the re-scrape case that made 23k surplus rows.
        from event.dedupe import same_post_is_redundant
        self.assertTrue(same_post_is_redundant(self._sig(''), self._sig('')))

    def test_same_title_counts_as_rescrape(self):
        from event.dedupe import same_post_is_redundant
        self.assertTrue(same_post_is_redundant(
            self._sig('cosecha de maiz'), self._sig('cosecha del maiz')))

    def test_different_titles_are_distinct_events(self):
        # A roundup carousel: two real events in one post must NOT be collapsed.
        from event.dedupe import same_post_is_redundant
        self.assertFalse(same_post_is_redundant(
            self._sig('friday warehouse rave'), self._sig('sunday rooftop brunch')))

    def test_different_dates_are_distinct_events(self):
        from datetime import date
        from event.dedupe import same_post_is_redundant
        self.assertFalse(same_post_is_redundant(
            self._sig('weekly session', date(2026, 9, 1)),
            self._sig('weekly session', date(2026, 9, 8))))
