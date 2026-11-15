// Run: npm test
//
// Mobile list date column: muted weekday (text-mist-white/50 in EventCard;
// /45 is not a Tailwind opacity step and left the label black), large
// padded day, orange month.
import test from 'node:test';
import assert from 'node:assert/strict';
import { listDateStack } from './listDateStack.ts';

test('stacked date is weekday, two-digit day, and short month', () => {
  const parts = listDateStack('2026-10-04T12:00:00');
  assert.equal(parts.weekday, 'SUN');
  assert.equal(parts.day, '04');
  assert.equal(parts.month, 'OCT');
  assert.equal(parts.monthDay, 'OCT 4');
});

test('double-digit days are not padded further', () => {
  const parts = listDateStack('2026-09-27T12:00:00');
  assert.equal(parts.weekday, 'SUN');
  assert.equal(parts.day, '27');
  assert.equal(parts.month, 'SEP');
});

test('missing or invalid dates are blank', () => {
  assert.deepEqual(listDateStack(null), {
    weekday: '',
    monthDay: '',
    day: '',
    month: '',
  });
  assert.deepEqual(listDateStack('not-a-date'), {
    weekday: '',
    monthDay: '',
    day: '',
    month: '',
  });
});
