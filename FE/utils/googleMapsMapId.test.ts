import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  DEMO_GOOGLE_MAPS_MAP_ID,
  resolveGoogleMapsMapId,
} from './googleMapsMapId.ts';

describe('resolveGoogleMapsMapId', () => {
  it('falls back to DEMO_MAP_ID when unset', () => {
    assert.equal(resolveGoogleMapsMapId(undefined), DEMO_GOOGLE_MAPS_MAP_ID);
    assert.equal(resolveGoogleMapsMapId(''), DEMO_GOOGLE_MAPS_MAP_ID);
    assert.equal(resolveGoogleMapsMapId('   '), DEMO_GOOGLE_MAPS_MAP_ID);
  });

  it('rejects the old mistaken MapTypeId string "roadmap"', () => {
    assert.equal(resolveGoogleMapsMapId('roadmap'), DEMO_GOOGLE_MAPS_MAP_ID);
  });

  it('keeps a real Cloud Map ID', () => {
    assert.equal(resolveGoogleMapsMapId('abc123map'), 'abc123map');
  });
});
