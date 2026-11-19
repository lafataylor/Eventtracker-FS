// Run: npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import {
  extractAdminAccessToken,
  requestHasValidAdminAuth,
  verifyAdminAccessToken,
} from './adminJwtAuth.ts';

function b64url(input: string | Buffer): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function mintToken(
  payload: Record<string, unknown>,
  secret = 'secret'
): string {
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = b64url(JSON.stringify(payload));
  const sig = createHmac('sha256', secret)
    .update(`${header}.${body}`)
    .digest('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
  return `${header}.${body}.${sig}`;
}

test('extracts Token and Bearer headers and adminToken cookie', () => {
  assert.equal(
    extractAdminAccessToken('Token abc.def.ghi', undefined),
    'abc.def.ghi'
  );
  assert.equal(
    extractAdminAccessToken('Bearer abc.def.ghi', undefined),
    'abc.def.ghi'
  );
  assert.equal(
    extractAdminAccessToken(undefined, 'foo=1; adminToken=abc.def.ghi; bar=2'),
    'abc.def.ghi'
  );
  assert.equal(extractAdminAccessToken(undefined, undefined), null);
});

test('accepts a fresh admin JWT signed like Django', () => {
  const now = 1_700_000_000;
  const token = mintToken({ id: 42, exp: now + 60, iat: now });
  assert.equal(verifyAdminAccessToken(token, now), true);
  assert.equal(
    requestHasValidAdminAuth('Token ' + token, undefined, now),
    true
  );
});

test('rejects missing, expired, tampered, or wrong-secret tokens', () => {
  const now = 1_700_000_000;
  const expired = mintToken({ id: 1, exp: now - 1, iat: now - 120 });
  assert.equal(verifyAdminAccessToken(expired, now), false);

  const noId = mintToken({ exp: now + 60, iat: now });
  assert.equal(verifyAdminAccessToken(noId, now), false);

  const good = mintToken({ id: 1, exp: now + 60, iat: now });
  const tampered = good.slice(0, -2) + 'ab';
  assert.equal(verifyAdminAccessToken(tampered, now), false);

  const otherSecret = mintToken({ id: 1, exp: now + 60, iat: now }, 'other');
  assert.equal(verifyAdminAccessToken(otherSecret, now), false);

  assert.equal(requestHasValidAdminAuth(undefined, undefined, now), false);
});
