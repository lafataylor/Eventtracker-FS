// Run: npm test
//
// Grid (board) and cards (flyer) tiles are portrait 3:4. Masonry stays
// natural height; compact list thumbs stay fixed-size. 2026-11-16.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PORTRAIT_FLYER_ASPECT_CLASS,
  flyerCardImageFrameClass,
  imageTileFrameClass,
} from './imageTileFrame.ts';

test('portrait flyer aspect is 3:4, not square', () => {
  assert.equal(PORTRAIT_FLYER_ASPECT_CLASS, 'aspect-[3/4]');
  assert.doesNotMatch(PORTRAIT_FLYER_ASPECT_CLASS, /aspect-square/);
});

test('masonry frame has no fixed aspect ratio', () => {
  const cls = imageTileFrameClass(true);
  assert.match(cls, /\boverflow-hidden\b/);
  assert.doesNotMatch(cls, /\baspect-/);
  assert.doesNotMatch(cls, /\bpb-/);
});

test('grid (board) frame uses portrait 3:4', () => {
  const cls = imageTileFrameClass(false);
  assert.match(cls, /aspect-\[3\/4]/);
  assert.doesNotMatch(cls, /\baspect-square\b/);
  assert.match(cls, /\boverflow-hidden\b/);
});

test('cards (flyer) frame uses portrait 3:4', () => {
  const cls = flyerCardImageFrameClass(false);
  assert.match(cls, /aspect-\[3\/4]/);
  assert.doesNotMatch(cls, /\baspect-square\b/);
  assert.doesNotMatch(cls, /\bpb-\[100%\]/);
});

test('compact list thumb keeps fixed size, not 3:4 aspect', () => {
  const cls = flyerCardImageFrameClass(true);
  assert.match(cls, /h-\[100px\]/);
  assert.doesNotMatch(cls, /\baspect-/);
});
