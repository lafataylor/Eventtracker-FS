// Run: npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CITY_CENTERS,
  OUT_OF_REGION_MILES,
  cityCenterForLocation,
  coordsFromVenue,
  eventIsOutsideRegion,
  haversineMiles,
  isOutsideRegion,
  sortInRegionFirst,
} from './cityRegion.ts';

test('city centers exist for the four shipped cities', () => {
  assert.ok(CITY_CENTERS.mexicocity);
  assert.ok(CITY_CENTERS.losangeles);
  assert.ok(CITY_CENTERS.berlin);
  assert.ok(CITY_CENTERS.bali);
  assert.equal(OUT_OF_REGION_MILES, 20);
});

test('cityCenterForLocation matches slug forms of city names', () => {
  assert.deepEqual(
    cityCenterForLocation('Los Angeles'),
    CITY_CENTERS.losangeles
  );
  assert.deepEqual(
    cityCenterForLocation('losangeles'),
    CITY_CENTERS.losangeles
  );
  assert.deepEqual(
    cityCenterForLocation('Mexico City'),
    CITY_CENTERS.mexicocity
  );
  assert.equal(cityCenterForLocation('Unknownville'), null);
  assert.equal(cityCenterForLocation(null), null);
});

test('haversineMiles is ~0 for the same point', () => {
  const p = CITY_CENTERS.losangeles;
  assert.ok(haversineMiles(p, p) < 0.01);
});

test('Santa Monica is inside 20 miles of Downtown LA; Riverside is outside', () => {
  const la = CITY_CENTERS.losangeles;
  // Santa Monica pier area
  const santaMonica = { lat: 34.0195, lng: -118.4912 };
  // Riverside downtown
  const riverside = { lat: 33.9806, lng: -117.3755 };
  assert.ok(haversineMiles(la, santaMonica) < OUT_OF_REGION_MILES);
  assert.ok(haversineMiles(la, riverside) > OUT_OF_REGION_MILES);
  assert.equal(isOutsideRegion(santaMonica, 'Los Angeles'), false);
  assert.equal(isOutsideRegion(riverside, 'Los Angeles'), true);
});

test('isOutsideRegion is false when coords or city center are missing', () => {
  assert.equal(isOutsideRegion(null, 'Los Angeles'), false);
  assert.equal(
    isOutsideRegion(CITY_CENTERS.losangeles, 'Nowhere'),
    false
  );
  assert.equal(isOutsideRegion({ lat: NaN, lng: -118 }, 'Los Angeles'), false);
});

test('coordsFromVenue reads latitude/longitude or lat/lng', () => {
  assert.deepEqual(coordsFromVenue({ latitude: 1, longitude: 2 }), {
    lat: 1,
    lng: 2,
  });
  assert.deepEqual(coordsFromVenue({ lat: 3, lng: 4 }), { lat: 3, lng: 4 });
  assert.equal(coordsFromVenue({ latitude: null, longitude: 2 }), null);
  assert.equal(coordsFromVenue(null), null);
});

test('sortInRegionFirst keeps relative order inside each group', () => {
  const items = [
    { id: 'a', out: false },
    { id: 'b', out: true },
    { id: 'c', out: false },
    { id: 'd', out: true },
    { id: 'e', out: false },
  ];
  const sorted = sortInRegionFirst(items, (x) => x.out);
  assert.deepEqual(
    sorted.map((x) => x.id),
    ['a', 'c', 'e', 'b', 'd']
  );
});

test('sortInRegionFirst returns the same array when nothing is outside', () => {
  const items = [{ id: 1 }, { id: 2 }];
  assert.equal(
    sortInRegionFirst(items, () => false),
    items
  );
});

test('eventIsOutsideRegion uses venue coords against the city page', () => {
  const riversideEvent = {
    venue: { latitude: 33.9806, longitude: -117.3755 },
  };
  const santaMonicaEvent = {
    venue: { latitude: 34.0195, longitude: -118.4912 },
  };
  assert.equal(eventIsOutsideRegion(riversideEvent, 'Los Angeles'), true);
  assert.equal(eventIsOutsideRegion(santaMonicaEvent, 'Los Angeles'), false);
  assert.equal(
    eventIsOutsideRegion({ venue: {} }, 'Los Angeles'),
    false
  );
});
