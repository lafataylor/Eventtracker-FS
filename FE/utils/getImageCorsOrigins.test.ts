// Run: npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_GETIMAGE_CORS_ORIGINS,
  getImageCorsOrigins,
} from './getImageCorsOrigins.ts';

test('default CORS list never includes *', () => {
  assert.equal(DEFAULT_GETIMAGE_CORS_ORIGINS.includes('*' as never), false);
  assert.ok(getImageCorsOrigins('').includes('https://lafaslist.com'));
  assert.equal(getImageCorsOrigins('').includes('*'), false);
});

test('GETIMAGE_CORS_ORIGINS appends extras', () => {
  const origins = getImageCorsOrigins(
    ' https://preview.example ,http://127.0.0.1:3010 '
  );
  assert.ok(origins.includes('https://preview.example'));
  assert.ok(origins.includes('http://127.0.0.1:3010'));
  assert.ok(origins.includes('https://lafaslist.com'));
});
