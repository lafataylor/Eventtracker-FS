// Run: npm test
//
// Masonry/grid subtitle under the title: Location · First offering.
// Owner 2026-11-19 (LAF-39).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  imageTileFirstOffering,
  imageTileLocation,
  imageTileMetaLine,
} from './imageTileMetaLine.ts';

const here = dirname(fileURLToPath(import.meta.url));
const eventCardSrc = readFileSync(
  join(here, '../components/Dashboard/EventCard.tsx'),
  'utf8'
);

test('imageTileLocation prefers venue name, else address', () => {
  assert.equal(imageTileLocation('Lodge Room', '123 Main'), 'Lodge Room');
  assert.equal(imageTileLocation('', '123 Main'), '123 Main');
  assert.equal(imageTileLocation(null, null), '');
  assert.equal(imageTileLocation('  ', '  '), '');
  assert.equal(
    imageTileLocation('Lodge Room|==|Alt', null),
    'Lodge Room'
  );
});

test('imageTileFirstOffering takes the first delimiter/comma token', () => {
  assert.equal(imageTileFirstOffering('DJ set'), 'DJ set');
  assert.equal(imageTileFirstOffering('DJ set, Live band'), 'DJ set');
  assert.equal(
    imageTileFirstOffering('DJ set|==|Live band'),
    'DJ set'
  );
  assert.equal(imageTileFirstOffering(null), '');
  assert.equal(imageTileFirstOffering('  ,  '), '');
});

test('imageTileMetaLine joins with interpunct and omits empties', () => {
  assert.equal(
    imageTileMetaLine('Lodge Room', 'DJ set'),
    'Lodge Room · DJ set'
  );
  assert.equal(imageTileMetaLine('Lodge Room', ''), 'Lodge Room');
  assert.equal(imageTileMetaLine('', 'DJ set'), 'DJ set');
  assert.equal(imageTileMetaLine('', ''), '');
  assert.doesNotMatch(imageTileMetaLine('Lodge Room', ''), /·/);
  assert.doesNotMatch(imageTileMetaLine('A', 'B'), /[-/]/);
  assert.match(imageTileMetaLine('A', 'B'), / · /);
});

test('EventCard image tiles render title then meta line helper', () => {
  assert.match(eventCardSrc, /from '\.\.\/\.\.\/utils\/imageTileMetaLine'/);
  assert.match(eventCardSrc, /imageTileMetaLine\(/);
  // Meta sits under the title in the image-tile branch.
  assert.match(eventCardSrc, /\{eventTitle\}[\s\S]*?\{imageTileMeta\}/);
  assert.match(
    eventCardSrc,
    /isImageTileView && \([\s\S]*?\{imageTileMeta\}/
  );
});
