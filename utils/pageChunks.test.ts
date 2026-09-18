// Run: npm test
//
// Review of PR #8: after a verdict the duplicates page reloaded "everything
// already loaded" in ONE request, but the API caps a request at 100 groups.
// With more than 100 on screen (production had 216 that day) the reload came
// back with 100 and the rest silently vanished from the page. The reload now
// asks for what is on screen in chunks the API accepts.
import test from 'node:test';
import assert from 'node:assert/strict';
import { pageChunks } from './pageChunks.ts';

test('a small list is one request', () => {
  assert.deepEqual(pageChunks(40, 100, 20), [{ offset: 0, limit: 40 }]);
});

test('never fewer than one page, even when nothing is loaded yet', () => {
  assert.deepEqual(pageChunks(0, 100, 20), [{ offset: 0, limit: 20 }]);
  assert.deepEqual(pageChunks(7, 100, 20), [{ offset: 0, limit: 20 }]);
});

test('more than the cap is split so nothing on screen is dropped', () => {
  assert.deepEqual(pageChunks(216, 100, 20), [
    { offset: 0, limit: 100 },
    { offset: 100, limit: 100 },
    { offset: 200, limit: 16 },
  ]);
});

test('an exact multiple of the cap has no empty trailing request', () => {
  assert.deepEqual(pageChunks(200, 100, 20), [
    { offset: 0, limit: 100 },
    { offset: 100, limit: 100 },
  ]);
});
