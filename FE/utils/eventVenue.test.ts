// Run: npm test
//
// Production city pages crash when EventCard reads event.venue.* and the
// API sent venue:null (LAF-45, 2026-11-19).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  imageTileLocation,
  imageTileMetaLine,
} from './imageTileMetaLine.ts';
import { safeVenue } from './eventVenue.ts';

const here = dirname(fileURLToPath(import.meta.url));
const eventCardSrc = readFileSync(
  join(here, '../components/Dashboard/EventCard.tsx'),
  'utf8'
);

test('safeVenue returns empty fields for null/undefined venue', () => {
  assert.deepEqual(safeVenue(null), {
    name: null,
    address: null,
    city: null,
    state: null,
    country: null,
  });
  assert.deepEqual(safeVenue(undefined), {
    name: null,
    address: null,
    city: null,
    state: null,
    country: null,
  });
});

test('safeVenue passes through present fields', () => {
  assert.deepEqual(
    safeVenue({
      name: 'Gretchen',
      address: 'Berlin',
      city: 'Berlin',
      state: null,
      country: 'Germany',
    }),
    {
      name: 'Gretchen',
      address: 'Berlin',
      city: 'Berlin',
      state: null,
      country: 'Germany',
    }
  );
});

test('null venue does not throw when building masonry meta line', () => {
  assert.doesNotThrow(() => {
    const venue = safeVenue(null);
    imageTileMetaLine(imageTileLocation(venue.name, venue.address));
  });
  const venue = safeVenue(null);
  assert.equal(
    imageTileMetaLine(imageTileLocation(venue.name, venue.address)),
    ''
  );
});

test('EventCard uses safeVenue and never bare event.venue.field reads', () => {
  // Bare event.venue.name throws TypeError when venue is null — that is the
  // live ErrorBoundary on lafaslist.com city pages.
  assert.match(eventCardSrc, /from '\.\.\/\.\.\/utils\/eventVenue'/);
  assert.match(eventCardSrc, /safeVenue\(/);
  assert.doesNotMatch(
    eventCardSrc,
    /event\.venue\.(name|address|city|state|country)/
  );
});
