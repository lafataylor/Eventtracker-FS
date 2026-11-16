// Run: npm test
//
// Event detail polish: quiet disclaimer, no RSVP Details button, no bio line,
// Instagram handle is a real profile link, source lines left-aligned.
// 2026-11-16.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  EVENT_DETAIL_DISCLAIMER_EN,
  eventDetailDisclaimer,
  instagramProfileUrl,
  shouldShowTicketDetailsButton,
} from './eventDetailCopy.ts';

const here = dirname(fileURLToPath(import.meta.url));
const eventDetailsSrc = readFileSync(
  join(here, '../components/Dashboard/EventDetails.tsx'),
  'utf8'
);

test('disclaimer uses a comma, not an em dash', () => {
  assert.equal(
    EVENT_DETAIL_DISCLAIMER_EN,
    'Some details may be incorrect, always confirm before you pull up.'
  );
  assert.doesNotMatch(EVENT_DETAIL_DISCLAIMER_EN, /—/);
  assert.equal(
    eventDetailDisclaimer('en'),
    EVENT_DETAIL_DISCLAIMER_EN
  );
  assert.match(eventDetailDisclaimer('es'), /incorrectos/);
});

test('instagramProfileUrl strips leading @ and builds a profile URL', () => {
  assert.equal(
    instagramProfileUrl('@lafaslist'),
    'https://instagram.com/lafaslist'
  );
  assert.equal(
    instagramProfileUrl('lafaslist'),
    'https://instagram.com/lafaslist'
  );
  assert.equal(instagramProfileUrl(null), null);
  assert.equal(instagramProfileUrl(''), null);
  assert.equal(instagramProfileUrl('@'), null);
});

test('RSVP Details button stays hidden; Ticket Details still allowed', () => {
  assert.equal(shouldShowTicketDetailsButton(true), false);
  assert.equal(shouldShowTicketDetailsButton(false), true);
  assert.equal(shouldShowTicketDetailsButton(null), true);
});

test('EventDetails wires disclaimer, IG link, left-align, no bio, no RSVP CTA', () => {
  assert.match(eventDetailsSrc, /eventDetailDisclaimer/);
  assert.match(eventDetailsSrc, /instagramProfileUrl/);
  assert.match(eventDetailsSrc, /shouldShowTicketDetailsButton/);
  assert.match(eventDetailsSrc, /EVENT_DETAIL_DISCLAIMER_EN|eventDetailDisclaimer/);
  assert.doesNotMatch(
    eventDetailsSrc,
    /Link was found in user|Link encontrado en la bio/
  );
  assert.doesNotMatch(eventDetailsSrc, /RSVP Details|Detalles de RSVP/);
  // Source block left-aligned (was text-right / justify-end).
  assert.match(
    eventDetailsSrc,
    /text-\[0\.7rem\][^"]*text-left/
  );
});
