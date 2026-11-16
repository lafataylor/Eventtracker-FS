// Event detail view copy and small helpers. 2026-11-16: owner asked for a
// quiet accuracy disclaimer, no RSVP Details button, no "found in bio" line,
// and a real Instagram profile link for the source handle.

export const EVENT_DETAIL_DISCLAIMER_EN =
  'Some details may be incorrect, always confirm before you pull up.';

export const EVENT_DETAIL_DISCLAIMER_ES =
  'Algunos detalles pueden ser incorrectos, siempre confirma antes de ir.';

export function eventDetailDisclaimer(
  viewingLanguage: string | null | undefined
): string {
  return viewingLanguage === 'es'
    ? EVENT_DETAIL_DISCLAIMER_ES
    : EVENT_DETAIL_DISCLAIMER_EN;
}

// poster.user is usually "@handle"; Instagram URLs want the bare username.
export function instagramProfileUrl(
  handle: string | null | undefined
): string | null {
  if (!handle) return null;
  const username = handle.startsWith('@') ? handle.slice(1) : handle.trim();
  if (!username) return null;
  return `https://instagram.com/${username}`;
}

// 2026-11-16: hide the RSVP Details CTA for now; Ticket Details still shows.
export function shouldShowTicketDetailsButton(
  rsvpRequired: boolean | null | undefined
): boolean {
  return !rsvpRequired;
}
