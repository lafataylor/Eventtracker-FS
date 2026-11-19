// Null-safe venue field access for event cards.
// 2026-11-19 (LAF-45): production date feed includes events with venue:null
// (e.g. ids 82275 Mexico City, 93058 Los Angeles). EventCard was reading
// event.venue.name / .address / .city without a guard, which threw during
// render and tripped the city-page ErrorBoundary.

export type VenueFields = {
  name: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
};

export function safeVenue(
  venue: Partial<VenueFields> | null | undefined
): VenueFields {
  return {
    name: venue?.name ?? null,
    address: venue?.address ?? null,
    city: venue?.city ?? null,
    state: venue?.state ?? null,
    country: venue?.country ?? null,
  };
}
