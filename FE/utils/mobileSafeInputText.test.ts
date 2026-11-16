// Run: npm test
//
// iOS Safari zooms inputs under 16px on focus. Mobile must use text-base
// (16px); desktop may keep text-sm.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mobileSafeInputTextClass } from './mobileSafeInputText.ts';

test('mobile-safe input text is 16px below md and text-sm from md up', () => {
  const cls = mobileSafeInputTextClass();
  assert.match(cls, /\btext-base\b/);
  assert.match(cls, /\bmd:text-sm\b/);
  assert.doesNotMatch(cls, /(?:^|\s)text-sm\b/);
});
