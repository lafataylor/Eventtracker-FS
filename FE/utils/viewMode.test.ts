// Run: npm test
//
// Desktop opens in masonry; phone opens in grid (board). Icon order is
// different on each. 2026-11-15: owner asked for masonry / list / grid /
// cards on desktop, and grid / list / masonry / cards on mobile.
// 2026-11-15: phone uses a dropdown; chosen view sticks in localStorage.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  defaultViewMode,
  isViewMode,
  readStoredViewMode,
  resolveInitialViewMode,
  VIEW_MODE_MENU_LABELS,
  VIEW_MODE_ORDER,
  VIEW_MODE_STORAGE_KEY,
  writeStoredViewMode,
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

test('menu labels match product names for the four views', () => {
  assert.equal(VIEW_MODE_MENU_LABELS.masonry, 'Masonry');
  assert.equal(VIEW_MODE_MENU_LABELS.list, 'List');
  assert.equal(VIEW_MODE_MENU_LABELS.board, 'Grid');
  assert.equal(VIEW_MODE_MENU_LABELS.flyer, 'Cards');
});

test('isViewMode accepts only the four modes', () => {
  assert.equal(isViewMode('masonry'), true);
  assert.equal(isViewMode('list'), true);
  assert.equal(isViewMode('board'), true);
  assert.equal(isViewMode('flyer'), true);
  assert.equal(isViewMode('grid'), false);
  assert.equal(isViewMode(''), false);
  assert.equal(isViewMode(null), false);
  assert.equal(isViewMode(undefined), false);
});

test('stored view mode is read and written through localStorage', () => {
  const store = new Map<string, string>();
  const original = globalThis.localStorage;

  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
      removeItem: (key: string) => {
        store.delete(key);
      },
    },
  });

  try {
    assert.equal(readStoredViewMode(), null);

    writeStoredViewMode('list');
    assert.equal(store.get(VIEW_MODE_STORAGE_KEY), 'list');
    assert.equal(readStoredViewMode(), 'list');

    store.set(VIEW_MODE_STORAGE_KEY, 'not-a-mode');
    assert.equal(readStoredViewMode(), null);

    assert.equal(resolveInitialViewMode(375), 'board');
    writeStoredViewMode('flyer');
    assert.equal(resolveInitialViewMode(375), 'flyer');
    assert.equal(resolveInitialViewMode(1280), 'flyer');
  } finally {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: original,
    });
  }
});
