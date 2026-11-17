// Event detail view copy and small helpers. 2026-11-16: owner asked for a
// quiet accuracy disclaimer, no RSVP/Ticket Details buttons, no "found in bio"
// line, a real Instagram profile link for the source handle, and Copy Event
// Link as the filled orange CTA (not a midnight underline bar).

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

// 2026-11-17: hide Ticket Details and RSVP Details for now (owner). Keep the
// helper so a later restore is one flip; rsvpRequired is unused on purpose.
export function shouldShowTicketDetailsButton(
  _rsvpRequired?: boolean | null
): boolean {
  return false;
}

export function copyEventLinkLabel(
  viewingLanguage: string | null | undefined
): string {
  return viewingLanguage === 'es'
    ? 'Copiar Link del Evento'
    : 'Copy Event Link';
}
