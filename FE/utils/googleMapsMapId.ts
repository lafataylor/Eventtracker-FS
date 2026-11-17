/**
 * Cloud Map ID for Advanced Markers.
 *
 * 2026-11-17: both map mounts used mapId="roadmap". That string is a
 * MapTypeId, not a Cloud Map ID. AdvancedMarker then attaches to a map
 * whose internal element never finished set-up, and Maps throws
 * TypeError on getRootNode (Safari: "undefined is not an object
 * (evaluating 'a.getRootNode')"; stack in maps-api-v3 marker.js / main.js).
 *
 * Google's documented stand-in is DEMO_MAP_ID. Production can override with
 * NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID once a real Map ID exists in Cloud Console.
 */
export const DEMO_GOOGLE_MAPS_MAP_ID = 'DEMO_MAP_ID';

export function resolveGoogleMapsMapId(
  envValue: string | undefined = process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID
): string {
  const trimmed = (envValue ?? '').trim();
  if (!trimmed || trimmed === 'roadmap') {
    return DEMO_GOOGLE_MAPS_MAP_ID;
  }
  return trimmed;
}
