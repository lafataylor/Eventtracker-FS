/**
 * SSRF guard for FE/pages/api/getImage: only HTTPS URLs on known image hosts.
 *
 * 2026-11-17: Publish review flagged unauthenticated fetch(arbitrary URL).
 * Nightly scrape does not use this route (Django c_admin/scraper.py does);
 * experimental + Dashboard/Image still pass Instagram CDN and Firebase URLs.
 */

const EXACT_HOSTS = new Set([
  'firebasestorage.googleapis.com',
  'storage.googleapis.com',
  'cdninstagram.com',
]);

// Hostname must end with one of these (and be longer than the suffix).
const HOST_SUFFIXES = ['.cdninstagram.com', '.fbcdn.net'];

const IPV4 = /^(?:\d{1,3}\.){3}\d{1,3}$/;

export type ImageFetchUrlCheck =
  | { ok: true; url: URL }
  | { ok: false; reason: string };

export function isAllowedImageFetchUrl(raw: unknown): ImageFetchUrlCheck {
  if (typeof raw !== 'string' || !raw.trim()) {
    return { ok: false, reason: 'missing_url' };
  }

  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return { ok: false, reason: 'invalid_url' };
  }

  if (url.protocol !== 'https:') {
    return { ok: false, reason: 'https_required' };
  }
  if (url.username || url.password) {
    return { ok: false, reason: 'userinfo_forbidden' };
  }

  const host = url.hostname.toLowerCase();
  if (!host || host === 'localhost' || host.endsWith('.localhost')) {
    return { ok: false, reason: 'localhost_forbidden' };
  }
  if (IPV4.test(host) || host.includes(':')) {
    return { ok: false, reason: 'ip_literal_forbidden' };
  }

  if (EXACT_HOSTS.has(host)) {
    return { ok: true, url };
  }
  for (const suffix of HOST_SUFFIXES) {
    if (host.endsWith(suffix) && host.length > suffix.length) {
      return { ok: true, url };
    }
  }

  return { ok: false, reason: 'host_not_allowlisted' };
}
