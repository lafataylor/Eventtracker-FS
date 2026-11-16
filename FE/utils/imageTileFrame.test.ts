// Run: npm test
//
// Grid (board), cards (flyer), and mobile list thumbs are portrait 3:4.
// Masonry stays natural height; desktop list stays fixed 130×86. 2026-11-16.
// Masonry/grid: rounded frame + overflow-hidden must inset the flyer (p-2 /
// inset-2) so corner lettering clears the radius — #20's squared bottoms
// alone still clipped Winter Solstice on live (2026-11-16).
// Blank grid images (2026-11-16): aspect class lived only in utils/, which
// Tailwind did not scan — frame height collapsed under absolute imgs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  IMAGE_TILE_ABS_INSET_CLASS,
  IMAGE_TILE_PAD_CLASS,
  IMAGE_TILE_RADIUS_CLASS,
  PORTRAIT_FLYER_ASPECT_CLASS,
  desktopListThumbFrameClass,
  flyerCardImageFrameClass,
  imageTileFrameClass,
  imageTileImgClass,
  mobileListThumbFrameClass,
} from './imageTileFrame.ts';

test('portrait flyer aspect is 3:4 width/height, not landscape 4:3 or square', () => {
  assert.equal(PORTRAIT_FLYER_ASPECT_CLASS, 'aspect-[3/4]');
  assert.doesNotMatch(PORTRAIT_FLYER_ASPECT_CLASS, /aspect-square/);
  assert.doesNotMatch(PORTRAIT_FLYER_ASPECT_CLASS, /aspect-\[4\/3\]/);
});

test('tile pad clears md radius (p-2 = 8px > rounded-md = 6px)', () => {
  assert.equal(IMAGE_TILE_RADIUS_CLASS, 'rounded-md');
  assert.equal(IMAGE_TILE_PAD_CLASS, 'p-2');
  assert.equal(IMAGE_TILE_ABS_INSET_CLASS, 'inset-2');
});

test('masonry frame keeps natural height, rounded chrome, and pad inset', () => {
  const cls = imageTileFrameClass(true);
  assert.match(cls, /\brounded-md\b/);
  assert.doesNotMatch(cls, /\brounded-t-md\b/);
  assert.match(cls, /\bp-2\b/);
  assert.match(cls, /\boverflow-hidden\b/);
  assert.doesNotMatch(cls, /\baspect-/);
  assert.doesNotMatch(cls, /\bpb-/);
});

test('grid (board) frame uses portrait 3:4 with rounded chrome and pad inset', () => {
  const cls = imageTileFrameClass(false);
  assert.match(cls, /aspect-\[3\/4]/);
  assert.doesNotMatch(cls, /\baspect-square\b/);
  assert.doesNotMatch(cls, /aspect-\[4\/3\]/);
  assert.match(cls, /\brounded-md\b/);
  assert.doesNotMatch(cls, /\brounded-t-md\b/);
  assert.match(cls, /\bp-2\b/);
  assert.match(cls, /\boverflow-hidden\b/);
});

test('board img uses inset-2 so parent pad actually insets the flyer', () => {
  const masonry = imageTileImgClass(true);
  const board = imageTileImgClass(false);
  assert.match(masonry, /\bblock\b/);
  assert.doesNotMatch(masonry, /\binset-/);
  assert.match(board, /\binset-2\b/);
  assert.doesNotMatch(board, /\binset-0\b/);
  assert.match(board, /\bobject-cover\b/);
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

test('desktop list thumb stays fixed 130×86, not 3:4', () => {
  const cls = desktopListThumbFrameClass();
  assert.match(cls, /w-\[130px\]/);
  assert.match(cls, /h-\[86px\]/);
  assert.doesNotMatch(cls, /\baspect-/);
  assert.doesNotMatch(cls, /h-\[4\.5rem\]/);
});

test('mobile list thumb is portrait 3:4 (same width, aspect not fixed height)', () => {
  const cls = mobileListThumbFrameClass();
  assert.match(cls, /w-\[5\.75rem\]/);
  assert.match(cls, /aspect-\[3\/4\]/);
  assert.doesNotMatch(cls, /\baspect-square\b/);
  assert.doesNotMatch(cls, /aspect-\[4\/3\]/);
  assert.doesNotMatch(cls, /h-\[4\.5rem\]/);
  assert.doesNotMatch(cls, /h-\[86px\]/);
  assert.match(cls, /\bshrink-0\b/);
  // Without self-start, the row's items-stretch sets a definite height and
  // aspect-ratio is ignored (phone thumbs looked square/landscape).
  assert.match(cls, /\bself-start\b/);
});

test('EventCard wires desktop and mobile list thumb helpers', () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const cardPath = join(here, '..', 'components', 'Dashboard', 'EventCard.tsx');
  const source = readFileSync(cardPath, 'utf8');
  assert.match(source, /desktopListThumbFrameClass/);
  assert.match(source, /mobileListThumbFrameClass/);
  assert.match(source, /imageTileImgClass/);
  assert.doesNotMatch(
    source,
    /w-\[5\.75rem\] h-\[4\.5rem\]/,
    'mobile list must not keep the old landscape fixed height'
  );
  assert.doesNotMatch(
    source,
    /relative w-\[130px\] h-\[86px\]/,
    'desktop list size lives in desktopListThumbFrameClass, not inline'
  );
  // Board tile img classes come from imageTileImgClass (inset-2), not a
  // hard-coded inset-0 fill next to imageTileFrameClass.
  assert.match(
    source,
    /imageTileFrameClass\(\!\!isInMasonryView\)[\s\S]*?imageTileImgClass\(\!\!isInMasonryView\)/
  );
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
