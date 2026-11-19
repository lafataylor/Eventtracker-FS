"""Attach cached lat/lng to venues without calling Google.

Map view already geocodes through admin/geocode/ and stores hits in
GeocodingCache. Public feeds reuse those hits so list/grid/masonry can
sort out-of-region events (>20 miles from the city-page center) without
new paid geocoding. 2026-11-17.
"""
from c_admin.models import GeocodingCache


def venue_address_candidates(venue):
    """Address strings that may already sit in GeocodingCache.

    Matches the formats EventsSection / geocode.ts have historically sent
    (full street line, then city/state/country only).
    """
    if venue is None:
        return []
    address = (venue.address or '').strip()
    city = (venue.city or '').strip()
    state = (venue.state or '').strip()
    country = (venue.country or '').strip()
    candidates = []
    if address:
        full = ', '.join(p for p in (address, city, state, country) if p)
        candidates.append(full)
        candidates.append(address)
    city_line = ', '.join(p for p in (city, state, country) if p)
    if city_line:
        candidates.append(city_line)
    # Dedupe while keeping order
    seen = set()
    unique = []
    for c in candidates:
        if c and c not in seen:
            seen.add(c)
            unique.append(c)
    return unique


def lookup_cached_coords(addresses):
    """Map address -> (lat, lng) for any cache hits. One query."""
    cleaned = [a for a in addresses if a]
    if not cleaned:
        return {}
    rows = GeocodingCache.objects.filter(address__in=cleaned).only(
        'address', 'latitude', 'longitude'
    )
    return {row.address: (row.latitude, row.longitude) for row in rows}


def coords_for_venue(venue, cache_map=None):
    """Return (lat, lng) from GeocodingCache, or None."""
    candidates = venue_address_candidates(venue)
    if not candidates:
        return None
    if cache_map is None:
        cache_map = lookup_cached_coords(candidates)
    for candidate in candidates:
        hit = cache_map.get(candidate)
        if hit is not None:
            return hit
    return None


def build_venue_coords_map(venues):
    """Bulk-resolve coords for a set of Venue instances. One cache query."""
    venues = [v for v in venues if v is not None]
    if not venues:
        return {}
    all_addresses = []
    per_venue = {}
    for venue in venues:
        candidates = venue_address_candidates(venue)
        per_venue[venue.id] = candidates
        all_addresses.extend(candidates)
    cache_map = lookup_cached_coords(all_addresses)
    result = {}
    for venue in venues:
        for candidate in per_venue.get(venue.id, []):
            hit = cache_map.get(candidate)
            if hit is not None:
                result[venue.id] = hit
                break
    return result
