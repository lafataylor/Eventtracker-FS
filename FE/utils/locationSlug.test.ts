// Run: npm test
//
// City URLs are dashless: "Los Angeles" → /losangeles, never /los-angeles.
// 2026-11-14: owner asked to drop the hyphen, and to keep that rule for
// every city we add later so nobody has to special-case a new name.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  toLocationSlug,
  displayLocationName,
  locationSlugMatches,
  cityPath,
  isMexicoCity,
  redirectHyphenatedCityPath,
  sharedEventCityPath,
  isSharedEventPage,
} from './locationSlug.ts';

test('city URLs concatenate words with no hyphen or space', () => {
  assert.equal(toLocationSlug('Los Angeles'), 'losangeles');
  assert.equal(toLocationSlug('Mexico City'), 'mexicocity');
  assert.equal(toLocationSlug('Berlin'), 'berlin');
  assert.equal(toLocationSlug('Bali'), 'bali');
});

test('a city added later follows the same rule without extra code', () => {
  assert.equal(toLocationSlug('New York'), 'newyork');
  assert.equal(toLocationSlug('San Francisco'), 'sanfrancisco');
  assert.equal(toLocationSlug('Mexico City CDMX'), 'mexicocitycdmx');
  assert.equal(cityPath('New York'), '/newyork');
  assert.equal(cityPath('New York', 'es'), '/es/newyork');
});

test('legacy hyphenated slugs squash to the same key', () => {
  assert.equal(toLocationSlug('los-angeles'), 'losangeles');
  assert.equal(toLocationSlug('mexico-city'), 'mexicocity');
  assert.equal(toLocationSlug('LOS-ANGELES'), 'losangeles');
});

test('event "Los Angeles" matches URL /losangeles and old /los-angeles', () => {
  assert.equal(locationSlugMatches('Los Angeles', 'losangeles'), true);
  assert.equal(locationSlugMatches('Los Angeles', 'los-angeles'), true);
  assert.equal(locationSlugMatches('mexico city', 'mexicocity'), true);
  assert.equal(locationSlugMatches('Berlin', 'bali'), false);
});

test('page titles come from the real city name, not the compacted URL', () => {
  const known = ['Mexico City', 'Los Angeles', 'Berlin', 'Bali', 'New York'];
  assert.equal(displayLocationName('losangeles'), 'Los Angeles');
  assert.equal(displayLocationName('mexicocity'), 'Mexico City');
  assert.equal(displayLocationName('newyork', known), 'New York');
  assert.equal(displayLocationName('los-angeles'), 'Los Angeles');
  assert.equal(displayLocationName('Los Angeles'), 'Los Angeles');
});

test('San Francisco share-image check follows the same compacted slug', () => {
  assert.equal(toLocationSlug('San Francisco'), 'sanfrancisco');
  assert.equal(cityPath('San Francisco'), '/sanfrancisco');
});

test('Mexico City price checks accept any spelling of the slug', () => {
  assert.equal(isMexicoCity('mexicocity'), true);
  assert.equal(isMexicoCity('mexico-city'), true);
  assert.equal(isMexicoCity('Mexico City'), true);
  assert.equal(isMexicoCity('losangeles'), false);
  assert.equal(isMexicoCity(undefined), false);
});

test('old hyphenated bookmarks redirect to the dashless URL', () => {
  assert.equal(redirectHyphenatedCityPath('/los-angeles'), '/losangeles/');
  assert.equal(redirectHyphenatedCityPath('/los-angeles/'), '/losangeles/');
  assert.equal(redirectHyphenatedCityPath('/mexico-city/'), '/mexicocity/');
  assert.equal(redirectHyphenatedCityPath('/es/los-angeles/'), '/es/losangeles/');
  assert.equal(redirectHyphenatedCityPath('/new-york'), '/newyork/');
  assert.equal(redirectHyphenatedCityPath('/losangeles/'), null);
  assert.equal(redirectHyphenatedCityPath('/berlin/'), null);
  assert.equal(redirectHyphenatedCityPath('/about'), null);
  assert.equal(redirectHyphenatedCityPath('/favorites/'), null);
  assert.equal(redirectHyphenatedCityPath('/event/share/12/'), null);
});

test('closing a shared event goes to that event city, not Mexico City', () => {
  assert.equal(
    sharedEventCityPath({ forLocation: 'Los Angeles' }),
    '/losangeles'
  );
  assert.equal(
    sharedEventCityPath({ forLocation: 'Berlin' }),
    '/berlin'
  );
  assert.equal(
    sharedEventCityPath({ forLocation: 'New York' }),
    '/newyork'
  );
  assert.equal(
    sharedEventCityPath({ poster: { forLocation: 'Bali' } }),
    '/bali'
  );
  assert.equal(
    sharedEventCityPath({ forLocation: 'Los Angeles, Mexico City' }),
    '/losangeles'
  );
  assert.equal(
    sharedEventCityPath({ forLocation: 'Los Angeles', viewing_language: 'es' }),
    '/es/losangeles'
  );
  assert.equal(sharedEventCityPath({}), '/mexicocity');
  assert.equal(sharedEventCityPath({ forLocation: 'general' }), '/mexicocity');
});

test('the share URL is the only place that redirects on close', () => {
  assert.equal(isSharedEventPage('/event/share/[id]'), true);
  assert.equal(isSharedEventPage('/event/share/12/'), true);
  assert.equal(isSharedEventPage('/losangeles'), false);
  assert.equal(isSharedEventPage('/mexicocity/'), false);
});
