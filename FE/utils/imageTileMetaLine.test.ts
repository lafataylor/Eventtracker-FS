// Run: npm test
//
// Masonry/grid subtitle under the title: location only (LAF-50).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  imageTileLocation,
  imageTileMetaLine,
} from './imageTileMetaLine.ts';

const here = dirname(fileURLToPath(import.meta.url));
const eventCardSrc = readFileSync(
  join(here, '../components/Dashboard/EventCard.tsx'),
  'utf8'
);
const metaLineSrc = readFileSync(join(here, 'imageTileMetaLine.ts'), 'utf8');

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

test('imageTileMetaLine is location only — no offering, no interpunct', () => {
  assert.equal(imageTileMetaLine('Lodge Room'), 'Lodge Room');
  assert.equal(imageTileMetaLine(''), '');
  assert.doesNotMatch(imageTileMetaLine('Lodge Room'), /·/);
});

test('helpers no longer expose or compose offering for image tiles', () => {
  assert.doesNotMatch(metaLineSrc, /export function imageTileFirstOffering/);
  assert.doesNotMatch(eventCardSrc, /imageTileFirstOffering/);
  // Meta line call takes location only — no second arg / offering helper.
  assert.match(
    eventCardSrc,
    /imageTileMetaLine\(\s*imageTileLocation\([^)]+\)\s*\)/
  );
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
