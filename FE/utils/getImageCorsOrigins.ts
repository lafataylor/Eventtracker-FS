/**
 * CORS allowlist for /api/getImage — never origin *.
 *
 * 2026-11-17: Publish review flagged origin:'*'. Same-origin admin/experimental
 * calls do not need CORS; listed hosts cover Firebase Hosting + local FE.
 * Extra origins: comma-separated GETIMAGE_CORS_ORIGINS.
 */

export const DEFAULT_GETIMAGE_CORS_ORIGINS = [
  'https://lafaslist.com',
  'https://www.lafaslist.com',
  'https://eventtracker-1c82b.web.app',
  'http://localhost:3000',
  'http://localhost:3009',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:3009',
] as const;

export function getImageCorsOrigins(
  envValue: string | undefined = process.env.GETIMAGE_CORS_ORIGINS
): string[] {
  const extras = (envValue ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return [...DEFAULT_GETIMAGE_CORS_ORIGINS, ...extras];
}
