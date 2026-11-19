// Masonry + grid (board) cards: one muted line under the title —
// Location · First offering. Owner 2026-11-19 (LAF-39): interpunct only,
// omit empty parts so there is never a dangling ·.
// Delimiter matches Constants.delimiter ('|==|'); inlined so node:test can
// load this module without resolving the Constants class file.

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

/** First offering token (delimiter or comma); ignores age/tickets extras. */
export function imageTileFirstOffering(
  offering: string | null | undefined
): string {
  if (!offering || offering.trim() === '') return '';
  const parts = offering
    .split(FIELD_DELIMITER)
    .flatMap((part) => part.split(','))
    .map((s) => s.trim())
    .filter(Boolean);
  return parts[0] || '';
}

/** Join non-empty fields with an interpunct; single field has no separator. */
export function imageTileMetaLine(
  location: string,
  firstOffering: string
): string {
  return [location, firstOffering].filter(Boolean).join(' · ');
}
