// Run: npm test
//
// Desktop opens in masonry; phone opens in grid (board). Icon order is
// different on each. 2026-11-15: owner asked for masonry / list / grid /
// cards on desktop, and grid / list / masonry / cards on mobile.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  defaultViewMode,
  VIEW_MODE_ORDER,
} from './viewMode.ts';

test('desktop default is masonry; phone default is grid', () => {
  assert.equal(defaultViewMode(1280), 'masonry');
  assert.equal(defaultViewMode(768), 'masonry');
  assert.equal(defaultViewMode(767), 'board');
  assert.equal(defaultViewMode(375), 'board');
});

test('desktop icon order is masonry, list, grid, cards', () => {
  assert.deepEqual(VIEW_MODE_ORDER.desktop, [
    'masonry',
    'list',
    'board',
    'flyer',
  ]);
});

test('phone icon order is grid, list, masonry, cards', () => {
  assert.deepEqual(VIEW_MODE_ORDER.mobile, [
    'board',
    'list',
    'masonry',
    'flyer',
  ]);
});
