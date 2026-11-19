/**
 * Admin JWT check for Next.js API routes (same signing as Django).
 *
 * Matches API/API/c_auth/authentication.py: HS256 with secret "secret",
 * Authorization "Token <jwt>" (Bearer also accepted). Cookie adminToken is
 * accepted for same-origin browser calls. We verify signature + exp + id;
 * Django also loads the User row — FE has no DB, so existence is not checked.
 *
 * 2026-11-17: getImage was unauthenticated; Publish treated that as critical.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

// Keep in lockstep with c_auth.authentication.create_jwt_token unless Django
// moves the secret to an env var first.
const JWT_SECRET = process.env.EVENT_JWT_SECRET || 'secret';

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
  secret: string = JWT_SECRET
): boolean {
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
