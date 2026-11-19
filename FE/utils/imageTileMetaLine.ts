// Masonry + grid (board) cards: one muted line under the title — location
// only. Owner 2026-11-19 (LAF-50): drop offering from this subtitle; list
// view still shows offerings elsewhere. Delimiter matches
// Constants.delimiter ('|==|'); inlined so node:test can load this module
// without resolving the Constants class file.

const FIELD_DELIMITER = '|==|';

/** Venue name, else address; empty when neither is set. */
export function imageTileLocation(
  venueName: string | null | undefined,
  venueAddress: string | null | undefined
): string {
  const name = venueName?.trim() ?? '';
  if (name) return name.split(FIELD_DELIMITER)[0].trim();
  const address = venueAddress?.trim() ?? '';
  if (address) return address.split(FIELD_DELIMITER)[0].trim();
  return '';
}

/** Masonry/grid subtitle: location only (no offering, no dangling ·). */
export function imageTileMetaLine(location: string): string {
  return location;
}
