/**
 * Admin JWT check for Next.js API routes (same signing as Django).
 *
 * Authorization "Token <jwt>" (Bearer also accepted). Cookie adminToken is
 * accepted for same-origin browser calls. We verify signature + exp + id;
 * Django also loads the User row — FE has no DB, so existence is not checked.
 *
 * 2026-11-19: do not embed a default signing key in shipped FE source —
 * Publish treated a hardcoded fallback as credential exposure. Callers must
 * pass a secret or set EVENT_JWT_SECRET. Django's own signer lives in the API.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

function configuredJwtSecret(): string | null {
  const fromEnv = process.env.EVENT_JWT_SECRET;
  return fromEnv && fromEnv.length > 0 ? fromEnv : null;
}

function base64UrlToBuffer(input: string): Buffer {
  const padded = input + '='.repeat((4 - (input.length % 4)) % 4);
  return Buffer.from(padded.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

function parseCookieValue(
  cookieHeader: string | undefined,
  name: string
): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    if (key !== name) continue;
    return decodeURIComponent(part.slice(idx + 1).trim());
  }
  return null;
}

export function extractAdminAccessToken(
  authorization: string | string[] | undefined,
  cookieHeader: string | string[] | undefined
): string | null {
  const auth = Array.isArray(authorization) ? authorization[0] : authorization;
  if (auth) {
    const trimmed = auth.trim();
    const lower = trimmed.toLowerCase();
    if (lower.startsWith('token ')) {
      return trimmed.slice(6).trim() || null;
    }
    if (lower.startsWith('bearer ')) {
      return trimmed.slice(7).trim() || null;
    }
  }

  const cookie = Array.isArray(cookieHeader) ? cookieHeader[0] : cookieHeader;
  return parseCookieValue(cookie, 'adminToken');
}

export function verifyAdminAccessToken(
  token: string,
  nowSec: number = Math.floor(Date.now() / 1000),
  secret: string | null | undefined = configuredJwtSecret()
): boolean {
  if (!secret) return false;

  const parts = token.split('.');
  if (parts.length !== 3) return false;

  const [headerB64, payloadB64, sigB64] = parts;
  const signingInput = `${headerB64}.${payloadB64}`;
  const expected = createHmac('sha256', secret)
    .update(signingInput)
    .digest();
  let actual: Buffer;
  try {
    actual = base64UrlToBuffer(sigB64);
  } catch {
    return false;
  }
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    return false;
  }

  let payload: { id?: unknown; exp?: unknown };
  try {
    payload = JSON.parse(base64UrlToBuffer(payloadB64).toString('utf8'));
  } catch {
    return false;
  }

  if (payload.id === undefined || payload.id === null || payload.id === '') {
    return false;
  }
  if (typeof payload.exp !== 'number' || payload.exp <= nowSec) {
    return false;
  }
  return true;
}

export function requestHasValidAdminAuth(
  authorization: string | string[] | undefined,
  cookieHeader: string | string[] | undefined,
  nowSec?: number
): boolean {
  const token = extractAdminAccessToken(authorization, cookieHeader);
  if (!token) return false;
  return verifyAdminAccessToken(token, nowSec);
}
