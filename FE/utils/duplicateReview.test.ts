// Run: npm test
//
// Owner 2026-11-14: duplicates review should be Enter / arrows / Space,
// not a mouse hunt. The fuller flyer starts selected; arrows change that
// pick; Space pins an extra card so two of three can stay.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  arrowPicks,
  idsToKeep,
  initialKeepId,
  moveFocus,
  reviewKeyAction,
  togglePinned,
} from './duplicateReview.ts';

test('the suggested flyer is the starting pick', () => {
  assert.equal(initialKeepId([10, 20, 30], 20), 20);
});

test('a missing suggestion falls back to the first card', () => {
  assert.equal(initialKeepId([10, 20, 30], 99), 10);
  assert.equal(initialKeepId([10, 20], null), 10);
});

test('arrows wrap around the group', () => {
  assert.equal(moveFocus([10, 20, 30], 10, 1), 20);
  assert.equal(moveFocus([10, 20, 30], 30, 1), 10);
  assert.equal(moveFocus([10, 20, 30], 10, -1), 30);
});

test('a lone pick follows the arrow so Enter keeps the new card', () => {
  const moved = arrowPicks([10, 20, 30], [10], 10, 1, false);
  assert.deepEqual(moved, { picks: [20], focus: 20 });
  assert.deepEqual(idsToKeep(moved.picks, moved.focus), [20]);
});

test('once an extra is pinned, arrows only move the cursor', () => {
  const moved = arrowPicks([10, 20, 30], [10, 20], 20, 1, true);
  assert.deepEqual(moved.picks, [10, 20]);
  assert.equal(moved.focus, 30);
});

test('enter keeps, brackets keep-all and delete-all, arrows only move', () => {
  assert.deepEqual(reviewKeyAction('Enter'), { type: 'keep' });
  assert.deepEqual(reviewKeyAction('['), { type: 'keep_all' });
  assert.deepEqual(reviewKeyAction(']'), { type: 'delete_all' });
  assert.equal(reviewKeyAction('a'), null);
  assert.equal(reviewKeyAction('Delete'), null);
  assert.deepEqual(reviewKeyAction('ArrowRight'), { type: 'arrow', direction: 1 });
  assert.deepEqual(reviewKeyAction('ArrowLeft'), { type: 'arrow', direction: -1 });
  assert.equal(reviewKeyAction('x'), null);
});

test('space pins a second listing and never leaves the set empty', () => {
  assert.deepEqual(togglePinned([10], 20), [10, 20]);
  assert.deepEqual(togglePinned([10, 20], 20), [10]);
  assert.deepEqual(togglePinned([10], 10), [10]);
});
