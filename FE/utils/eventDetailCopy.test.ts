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

// 2026-11-16: owner — "Instagram text should not be full width button."
// poster.user must be a compact inline orange underline <a>, not a padded
// CTA / flex-1 row hit target. Copy Event Link keeps its own midnight bar.
test('IG handle is a compact inline link, not a full-width button', () => {
  const handleAnchor = eventDetailsSrc.match(
    /href=\{posterProfileUrl\}[\s\S]*?className="([^"]*)"[\s\S]*?\{eventDetailsDialog\.event\.poster\.user\}/
  );
  assert.ok(handleAnchor, 'expected poster.user <a href={posterProfileUrl}>');
  const className = handleAnchor[1];
  assert.match(className, /\binline\b/);
  assert.match(className, /text-beaming-orange/);
  assert.match(className, /\bunderline\b/);
  assert.doesNotMatch(className, /\bflex-1\b/);
  assert.doesNotMatch(className, /\bw-full\b/);
  assert.doesNotMatch(className, /\bw-\[90%\]\b/);
  assert.doesNotMatch(className, /\bbg-beaming-orange\b/);
  assert.doesNotMatch(className, /\bp-3\b/);
  // Source column must stretch full width and left-align (not items-center).
  assert.match(
    eventDetailsSrc,
    /w-full flex flex-col[^"]*items-stretch/
  );
  assert.match(eventDetailsSrc, /self-start text-\[0\.7rem\]/);
});
