// Run: npm test
//
// Event detail polish: quiet disclaimer, no RSVP/Ticket Details buttons, no
// bio line, Instagram handle is a compact profile link, Copy Event Link is
// the filled orange CTA. 2026-11-16 / 2026-11-17.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  EVENT_DETAIL_DISCLAIMER_EN,
  copyEventLinkLabel,
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

// 2026-11-17: owner — hide Ticket Details entirely (same as RSVP Details).
test('Ticket Details and RSVP Details stay hidden', () => {
  assert.equal(shouldShowTicketDetailsButton(true), false);
  assert.equal(shouldShowTicketDetailsButton(false), false);
  assert.equal(shouldShowTicketDetailsButton(null), false);
  assert.equal(shouldShowTicketDetailsButton(undefined), false);
});

test('copyEventLinkLabel is bilingual', () => {
  assert.equal(copyEventLinkLabel('en'), 'Copy Event Link');
  assert.equal(copyEventLinkLabel('es'), 'Copiar Link del Evento');
  assert.equal(copyEventLinkLabel(null), 'Copy Event Link');
});

test('EventDetails wires disclaimer, IG link, left-align, no bio, no ticket/RSVP CTA', () => {
  assert.match(eventDetailsSrc, /eventDetailDisclaimer/);
  assert.match(eventDetailsSrc, /instagramProfileUrl/);
  assert.match(eventDetailsSrc, /copyEventLinkLabel/);
  assert.doesNotMatch(eventDetailsSrc, /shouldShowTicketDetailsButton/);
  assert.doesNotMatch(
    eventDetailsSrc,
    /Link was found in user|Link encontrado en la bio/
  );
  // No user-facing ticket/RSVP CTA labels (comments may mention the history).
  assert.doesNotMatch(
    eventDetailsSrc,
    /['"`](RSVP Details|Detalles de RSVP|Ticket Details|Detalles del boleto)['"`]/
  );
  // Source block left-aligned (was text-right / justify-end).
  assert.match(
    eventDetailsSrc,
    /text-\[0\.7rem\][^"]*text-left/
  );
});

// 2026-11-16: owner — "Instagram text should not be full width button."
// poster.user must be a compact inline orange underline <a>, not a padded CTA.
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

// 2026-11-17: Copy Event Link is the filled orange CTA, not a midnight
// underline / flex-1 text link bar.
test('Copy Event Link is a filled orange CTA, not a midnight underline bar', () => {
  assert.match(eventDetailsSrc, /copyEventLinkLabel/);
  assert.match(
    eventDetailsSrc,
    /bg-beaming-orange[\s\S]*?copyEventLinkLabel/
  );
  // Old midnight bar + underline flex-1 pattern must be gone from the copy CTA.
  assert.doesNotMatch(
    eventDetailsSrc,
    /rounded-lg bg-midnight[\s\S]{0,400}?Copy Event Link|text-xs underline px-2 text-right text-beaming-orange flex-1/
  );
});
