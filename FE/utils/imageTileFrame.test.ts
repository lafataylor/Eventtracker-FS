// Run: npm test
//
// Masonry/grid flyer frames must not round the bottom corners: that radius
// plus overflow-hidden clipped flyer title text (2026-11-15).
import test from 'node:test';
import assert from 'node:assert/strict';
import { imageTileFrameClass } from './imageTileFrame.ts';

test('masonry frame keeps top radius and squares the bottom', () => {
  const cls = imageTileFrameClass(true);
  assert.match(cls, /\brounded-t-md\b/);
  assert.doesNotMatch(cls, /\brounded-md\b/);
  assert.doesNotMatch(cls, /\brounded-b-/);
  assert.match(cls, /\boverflow-hidden\b/);
  assert.doesNotMatch(cls, /\baspect-square\b/);
});

test('grid (board) frame keeps top radius and squares the bottom', () => {
  const cls = imageTileFrameClass(false);
  assert.match(cls, /\brounded-t-md\b/);
  assert.doesNotMatch(cls, /\brounded-md\b/);
  assert.doesNotMatch(cls, /\brounded-b-/);
  assert.match(cls, /\boverflow-hidden\b/);
  assert.match(cls, /\baspect-square\b/);
});
