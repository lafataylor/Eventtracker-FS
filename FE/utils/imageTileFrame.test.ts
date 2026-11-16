// Run: npm test
//
// Grid (board) and cards (flyer) tiles are portrait 3:4. Masonry stays
// natural height; compact list thumbs stay fixed-size. 2026-11-16.
// Masonry/grid frames must not round the bottom corners: that radius
// plus overflow-hidden clipped flyer title text (2026-11-15).
// Blank grid images (2026-11-16): aspect class lived only in utils/, which
// Tailwind did not scan — frame height collapsed under absolute imgs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  PORTRAIT_FLYER_ASPECT_CLASS,
  flyerCardImageFrameClass,
  imageTileFrameClass,
} from './imageTileFrame.ts';

test('portrait flyer aspect is 3:4 width/height, not landscape 4:3 or square', () => {
  assert.equal(PORTRAIT_FLYER_ASPECT_CLASS, 'aspect-[3/4]');
  assert.doesNotMatch(PORTRAIT_FLYER_ASPECT_CLASS, /aspect-square/);
  assert.doesNotMatch(PORTRAIT_FLYER_ASPECT_CLASS, /aspect-\[4\/3\]/);
});

test('masonry frame keeps natural height (no aspect) and squared bottom', () => {
  const cls = imageTileFrameClass(true);
  assert.match(cls, /\brounded-t-md\b/);
  assert.doesNotMatch(cls, /\brounded-md\b/);
  assert.doesNotMatch(cls, /\brounded-b-/);
  assert.match(cls, /\boverflow-hidden\b/);
  assert.doesNotMatch(cls, /\baspect-/);
  assert.doesNotMatch(cls, /\bpb-/);
});

test('grid (board) frame uses portrait 3:4 with squared bottom', () => {
  const cls = imageTileFrameClass(false);
  assert.match(cls, /aspect-\[3\/4]/);
  assert.doesNotMatch(cls, /\baspect-square\b/);
  assert.doesNotMatch(cls, /aspect-\[4\/3\]/);
  assert.match(cls, /\brounded-t-md\b/);
  assert.doesNotMatch(cls, /\brounded-md\b/);
  assert.doesNotMatch(cls, /\brounded-b-/);
  assert.match(cls, /\boverflow-hidden\b/);
});

test('cards (flyer) frame uses portrait 3:4', () => {
  const cls = flyerCardImageFrameClass(false);
  assert.match(cls, /aspect-\[3\/4]/);
  assert.doesNotMatch(cls, /\baspect-square\b/);
  assert.doesNotMatch(cls, /aspect-\[4\/3\]/);
  assert.doesNotMatch(cls, /\bpb-\[100%\]/);
});

test('compact list thumb keeps fixed size, not 3:4 aspect', () => {
  const cls = flyerCardImageFrameClass(true);
  assert.match(cls, /h-\[100px\]/);
  assert.doesNotMatch(cls, /\baspect-/);
});

test('Tailwind content includes utils so aspect-[3/4] is emitted', () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const configPath = join(here, '..', 'tailwind.config.js');
  const config = readFileSync(configPath, 'utf8');
  assert.match(
    config,
    /\.\/utils\/\*\*\/\*\.\{js,ts,jsx,tsx\}/,
    'without utils in content, aspect-[3/4] never ships and grid tiles collapse'
  );
});
