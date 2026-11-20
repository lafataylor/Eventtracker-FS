// Run: npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  adminAuthFieldRowClass,
  adminAuthInputClass,
  adminMainPaneClass,
  adminPageTitleClass,
} from './adminMobileLayout.ts';

test('auth field rows stack on phone and go side-by-side from sm', () => {
  const cls = adminAuthFieldRowClass();
  assert.match(cls, /\bflex-col\b/);
  assert.match(cls, /\bsm:flex-row\b/);
  assert.match(cls, /\bw-full\b/);
});

test('auth inputs are full-width on phone with no min-w-[400px]', () => {
  const cls = adminAuthInputClass();
  assert.match(cls, /\bw-full\b/);
  assert.doesNotMatch(cls, /min-w-\[400px\]/);
  assert.match(cls, /\btext-base\b/);
  assert.match(cls, /\bmd:text-sm\b/);
  assert.match(cls, /sm:w-\[400px]/);
});

test('admin page titles shrink below md', () => {
  const cls = adminPageTitleClass('pb-3');
  assert.match(cls, /\btext-2xl\b/);
  assert.match(cls, /\bmd:text-5xl\b/);
  assert.match(cls, /\bpb-3\b/);
});

test('admin main pane shrinks in flex and clears the mobile menu bar', () => {
  const cls = adminMainPaneClass('p-4 md:p-8');
  assert.match(cls, /\bmin-w-0\b/);
  assert.match(cls, /\bflex-1\b/);
  assert.match(cls, /\bpt-14\b/);
  assert.match(cls, /\bmd:pt-0\b/);
  assert.match(cls, /\bp-4\b/);
});
