// Who sees the full admin menu (Accounts, Users, Runs, Feedback, Details,
// Settings). Every other admin is a venue-level admin and sees only Events,
// Errors and Duplicates.
//
// The list comes from NEXT_PUBLIC_SUPERADMIN_EMAILS (comma separated, set in
// the site's .env.local on the server) so a real person's address never
// lands in this public repository. The two original service logins stay as
// defaults so nothing changes for them. Case and stray spaces are ignored:
// a phone capitalises the first letter of an email.
const DEFAULT_SUPERADMINS = ['dummy_@gmail.com', 'superadmin@eventtracker.lafaslist.com'];

const clean = (value: string) => value.trim().toLowerCase();

export function isSuperAdminEmail(
  email: string | null | undefined,
  configured: string | null | undefined = process.env.NEXT_PUBLIC_SUPERADMIN_EMAILS
): boolean {
  if (!email || !clean(email)) return false;
  const fromEnv = (configured ?? '').split(',').map(clean).filter(Boolean);
  return [...DEFAULT_SUPERADMINS, ...fromEnv].includes(clean(email));
}
