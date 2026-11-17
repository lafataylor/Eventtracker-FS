"""Cached venue coords for out-of-region sorting (no Google calls)."""
from django.test import TestCase

from c_admin.models import GeocodingCache
from event.models import Venue
from event.serializers import EventSerializer
from event.venue_coords import (
    build_venue_coords_map,
    coords_for_venue,
    venue_address_candidates,
)


class VenueAddressCandidatesTests(TestCase):
    def test_builds_full_and_city_only_forms(self):
        venue = Venue(
            address='123 Main St',
            city='Los Angeles',
            state='CA',
            country='USA',
        )
        candidates = venue_address_candidates(venue)
        self.assertEqual(
            candidates[0],
            '123 Main St, Los Angeles, CA, USA',
        )
        self.assertIn('123 Main St', candidates)
        self.assertIn('Los Angeles, CA, USA', candidates)

    def test_empty_venue_returns_no_candidates(self):
        self.assertEqual(venue_address_candidates(None), [])
        self.assertEqual(venue_address_candidates(Venue()), [])


class CachedCoordsLookupTests(TestCase):
    def test_coords_for_venue_hits_cache_on_full_address(self):
        venue = Venue.objects.create(
            address='123 Main St',
            city='Los Angeles',
            state='CA',
            country='USA',
        )
        GeocodingCache.objects.create(
            address='123 Main St, Los Angeles, CA, USA',
            latitude=34.05,
            longitude=-118.25,
        )
        self.assertEqual(coords_for_venue(venue), (34.05, -118.25))

    def test_coords_for_venue_returns_none_without_cache(self):
        venue = Venue.objects.create(
            address='Nowhere Rd',
            city='Riverside',
            state='CA',
            country='USA',
        )
        self.assertIsNone(coords_for_venue(venue))

    def test_build_venue_coords_map_batches(self):
        a = Venue.objects.create(
            address='A St', city='Los Angeles', state='CA', country='USA'
        )
        b = Venue.objects.create(
            address='B St', city='Riverside', state='CA', country='USA'
        )
        GeocodingCache.objects.create(
            address='B St, Riverside, CA, USA',
            latitude=33.98,
            longitude=-117.37,
        )
        result = build_venue_coords_map([a, b])
        self.assertNotIn(a.id, result)
        self.assertEqual(result[b.id], (33.98, -117.37))


class EventSerializerVenueCoordsTests(TestCase):
    def test_serializer_attaches_cached_lat_lng_to_venue(self):
        from event.models import Event

        venue = Venue.objects.create(
            name='Club',
            address='1 Sunset',
            city='Los Angeles',
            state='CA',
            country='USA',
        )
        GeocodingCache.objects.create(
            address='1 Sunset, Los Angeles, CA, USA',
            latitude=34.1,
            longitude=-118.3,
        )
        event = Event.objects.create(name='Night', venue=venue, is_event=True)
        data = EventSerializer(event).data
        self.assertEqual(data['venue']['latitude'], 34.1)
        self.assertEqual(data['venue']['longitude'], -118.3)

    def test_serializer_omits_coords_when_uncached(self):
        from event.models import Event

        venue = Venue.objects.create(
            name='Far',
            address='9 Desert',
            city='Riverside',
            state='CA',
            country='USA',
        )
        event = Event.objects.create(name='Day', venue=venue, is_event=True)
        data = EventSerializer(event).data
        self.assertNotIn('latitude', data['venue'])
        self.assertNotIn('longitude', data['venue'])

    def test_many_serializer_attaches_cached_coords_once(self):
        from event.models import Event

        near = Venue.objects.create(
            name='Near',
            address='1 Sunset',
            city='Los Angeles',
            state='CA',
            country='USA',
        )
        far = Venue.objects.create(
            name='Far',
            address='9 Desert',
            city='Riverside',
            state='CA',
            country='USA',
        )
        GeocodingCache.objects.create(
            address='1 Sunset, Los Angeles, CA, USA',
            latitude=34.1,
            longitude=-118.3,
        )
        GeocodingCache.objects.create(
            address='9 Desert, Riverside, CA, USA',
            latitude=33.98,
            longitude=-117.37,
        )
        events = [
            Event.objects.create(name='A', venue=near, is_event=True),
            Event.objects.create(name='B', venue=far, is_event=True),
        ]
        data = EventSerializer(events, many=True).data
        self.assertEqual(data[0]['venue']['latitude'], 34.1)
        self.assertEqual(data[1]['venue']['latitude'], 33.98)
