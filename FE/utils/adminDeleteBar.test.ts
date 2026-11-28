// Run: npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  adminDeleteBarButtonClass,
  adminDeleteBarClass,
  adminDeleteBarCountClass,
  adminDeleteBarLabelClass,
} from './adminDeleteBar.ts';

test('delete bar is nearly full-width on phone, half-width centered on md+', () => {
  const cls = adminDeleteBarClass();
  assert.match(cls, /\bleft-3\b/);
  assert.match(cls, /\bright-3\b/);
  assert.match(cls, /\bw-auto\b/);
  assert.match(cls, /\bmd:w-1\/2\b/);
  assert.match(cls, /\bmd:left-1\/2\b/);
  assert.match(cls, /\bmd:-translate-x-1\/2\b/);
  assert.match(cls, /\bgap-3\b/);
  // The overlapping layout used a fixed half-width with no mobile edges.
  assert.doesNotMatch(cls, /(?:^|\s)w-1\/2(?:\s|$)/);
});

test('count and label shrink on phone so they do not crowd Delete', () => {
  assert.match(adminDeleteBarCountClass(), /\btext-xl\b/);
  assert.match(adminDeleteBarCountClass(), /\bmd:text-3xl\b/);
  assert.match(adminDeleteBarCountClass(), /\bshrink-0\b/);
  assert.match(adminDeleteBarLabelClass(), /\btext-sm\b/);
  assert.match(adminDeleteBarLabelClass(), /\bmin-w-0\b/);
});

test('Delete button does not shrink away under the label', () => {
  const cls = adminDeleteBarButtonClass();
  assert.match(cls, /\bshrink-0\b/);
  assert.match(cls, /\bbg-beaming-orange\b/);
});
