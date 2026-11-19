// Out-of-region: venue more than 20 miles from the city page's downtown
// center. Used to push far events to the bottom of each date section and
// give them a quiet visual cue (list / grid / masonry / cards / map).
// 2026-11-17: owner chose 20 miles and FE-side sort; no paid geocoding
// for this path — only coords already on the venue (or from GeocodingCache).

import { toLocationSlug } from './locationSlug';

export const OUT_OF_REGION_MILES = 20;

export type LatLng = { lat: number; lng: number };

// Downtown centers for the four city pages. Chosen as well-known civic /
// tourist centers so "20 miles from here" matches how people think of the
// metro, not airport or geographic centroids.
export const CITY_CENTERS: Record<string, LatLng> = {
  // Mexico City — Zócalo / Centro Histórico
  mexicocity: { lat: 19.4326, lng: -99.1332 },
  // Los Angeles — City Hall / Civic Center, Downtown
  losangeles: { lat: 34.0522, lng: -118.2437 },
  // Berlin — Brandenburg Gate / Mitte
  berlin: { lat: 52.5163, lng: 13.3777 },
  // Bali — Denpasar Puputan Square (island capital; Bali has no single
  // downtown, but Denpasar is the civic center the page maps to)
  bali: { lat: -8.6705, lng: 115.2126 },
};

/** Haversine distance in miles between two WGS84 points. */
export function haversineMiles(a: LatLng, b: LatLng): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R = 3958.7613; // Earth radius in miles
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function cityCenterForLocation(
  locationName?: string | null
): LatLng | null {
  if (!locationName) return null;
  const slug = toLocationSlug(locationName);
  return CITY_CENTERS[slug] ?? null;
}

export function isOutsideRegion(
  coords: LatLng | null | undefined,
  locationName?: string | null,
  thresholdMiles: number = OUT_OF_REGION_MILES
): boolean {
  if (!coords) return false;
  const center = cityCenterForLocation(locationName);
  if (!center) return false;
  if (
    typeof coords.lat !== 'number' ||
    typeof coords.lng !== 'number' ||
    Number.isNaN(coords.lat) ||
    Number.isNaN(coords.lng)
  ) {
    return false;
  }
  return haversineMiles(center, coords) > thresholdMiles;
}

/** Read lat/lng already attached to a venue (API GeocodingCache enrichment). */
export function coordsFromVenue(venue?: {
  latitude?: number | null;
  longitude?: number | null;
  lat?: number | null;
  lng?: number | null;
} | null): LatLng | null {
  if (!venue) return null;
  const lat =
    typeof venue.latitude === 'number'
      ? venue.latitude
      : typeof venue.lat === 'number'
        ? venue.lat
        : null;
  const lng =
    typeof venue.longitude === 'number'
      ? venue.longitude
      : typeof venue.lng === 'number'
        ? venue.lng
        : null;
  if (lat == null || lng == null) return null;
  if (Number.isNaN(lat) || Number.isNaN(lng)) return null;
  return { lat, lng };
}

/**
 * Stable partition: in-region first (original relative order), then
 * out-of-region (original relative order). Events with unknown coords stay
 * with the in-region group so we never demote without evidence.
 */
export function sortInRegionFirst<T>(
  items: T[],
  isOutside: (item: T) => boolean
): T[] {
  if (!items.length) return items;
  const inside: T[] = [];
  const outside: T[] = [];
  for (const item of items) {
    if (isOutside(item)) outside.push(item);
    else inside.push(item);
  }
  if (outside.length === 0) return items;
  return inside.concat(outside);
}

export function eventIsOutsideRegion(
  event: { venue?: Parameters<typeof coordsFromVenue>[0] },
  locationName?: string | null,
  coordsOverride?: LatLng | null
): boolean {
  const coords = coordsOverride ?? coordsFromVenue(event.venue);
  return isOutsideRegion(coords, locationName);
}
