// Run: npm test
//
// Heart click animation: a short pop, then back to rest. 2026-11-15.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HEART_POP_MS } from './heartPop.ts';

const here = dirname(fileURLToPath(import.meta.url));

test('heart pop is a short single beat, not a pulse', () => {
  assert.equal(HEART_POP_MS, 90);
  const css = readFileSync(join(here, '../styles/globals.css'), 'utf8');
  assert.match(css, /@keyframes heartPop/);
  assert.match(css, /\.animate-heart-pop/);
  assert.match(css, /animation: heartPop 0\.09s ease-out/);
  assert.doesNotMatch(css, /heartPop[^}]*infinite/);
});
