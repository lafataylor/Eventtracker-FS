// Run: npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import { isAllowedImageFetchUrl } from './allowedImageFetchUrl.ts';

test('allows Firebase Storage HTTPS download URLs', () => {
  const r = isAllowedImageFetchUrl(
    'https://firebasestorage.googleapis.com/v0/b/event-images-050423/o/tmp%2Fx.png?alt=media&token=abc'
  );
  assert.equal(r.ok, true);
});

test('allows storage.googleapis.com', () => {
  assert.equal(
    isAllowedImageFetchUrl('https://storage.googleapis.com/bucket/path.jpg').ok,
    true
  );
});

test('allows Instagram CDN and fbcdn hosts', () => {
  assert.equal(
    isAllowedImageFetchUrl(
      'https://scontent-lax3-1.cdninstagram.com/v/t51.2885-15/123.jpg'
    ).ok,
    true
  );
  assert.equal(
    isAllowedImageFetchUrl(
      'https://instagram.flax1-1.fna.fbcdn.net/v/t51.2885-15/123.jpg'
    ).ok,
    true
  );
});

test('rejects http, localhost, metadata IPs, and unknown hosts', () => {
  assert.equal(
    isAllowedImageFetchUrl('http://firebasestorage.googleapis.com/x').ok,
    false
  );
  assert.equal(isAllowedImageFetchUrl('https://127.0.0.1/secret').ok, false);
  assert.equal(
    isAllowedImageFetchUrl('https://169.254.169.254/latest/meta-data/').ok,
    false
  );
  assert.equal(isAllowedImageFetchUrl('https://localhost/x').ok, false);
  assert.equal(isAllowedImageFetchUrl('https://evil.example/x.png').ok, false);
  assert.equal(
    isAllowedImageFetchUrl('https://user:pass@firebasestorage.googleapis.com/x')
      .ok,
    false
  );
});
