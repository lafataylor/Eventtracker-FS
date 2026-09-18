// Run: npm test   (node --test, TypeScript stripped natively; no test framework)
//
// Which day sections an event appears in. Owner, 2026-09-18: the same flyer
// "again and again". The monthly programme flyers (Attika, Savaya) are stored
// as multi-WEEK runs (Sep 17 to Oct 10), and the pages paint an event into
// every day section its span overlaps, so one flyer filled Today, Tomorrow,
// every weekday, Next Week and After Next Week. The API already lists a run
// longer than three days on its opening day only; the pages must agree.
import test from 'node:test';
import assert from 'node:assert/strict';
import { eventSpanOverlapsWindow, getEventCalendarSpanMs } from './eventDateSpan.ts';

const at = (y: number, m: number, d: number, h = 22) => new Date(y, m - 1, d, h, 0, 0).toISOString();
const dayWindow = (y: number, m: number, d: number): [number, number] => [
  new Date(y, m - 1, d, 0, 0, 0, 0).getTime(),
  new Date(y, m - 1, d, 23, 59, 59, 999).getTime(),
];
const ev = (start: string, end: string | null) => ({ start_date: start, end_date: end, end_time: null } as any);

test('a multi-week run appears on its opening day only', () => {
  const programme = ev(at(2026, 9, 17), at(2026, 10, 10));
  assert.equal(eventSpanOverlapsWindow(programme, ...dayWindow(2026, 9, 17)), true);
  assert.equal(eventSpanOverlapsWindow(programme, ...dayWindow(2026, 9, 18)), false);
  assert.equal(eventSpanOverlapsWindow(programme, ...dayWindow(2026, 10, 1)), false);
});

test('a three-day festival still appears on each of its days', () => {
  const festival = ev(at(2026, 9, 18, 18), at(2026, 9, 20, 23));
  for (const d of [18, 19, 20]) assert.equal(eventSpanOverlapsWindow(festival, ...dayWindow(2026, 9, d)), true);
  assert.equal(eventSpanOverlapsWindow(festival, ...dayWindow(2026, 9, 21)), false);
});

test('a single night is a single day', () => {
  const night = ev(at(2026, 9, 18), null);
  const span = getEventCalendarSpanMs(night);
  assert.equal(new Date(span.start).getDate(), 18);
  assert.equal(new Date(span.end).getDate(), 18);
});

// Review of PR #8: the long-run check measured elapsed MILLISECONDS against
// fixed 24-hour days. Across a daylight-saving fall-back one local day lasts
// 25 hours, so a legitimate four-day festival measured an hour too long and
// collapsed to its opening day. The rule is about calendar days.
test('a four-day festival across the autumn clock change still appears on each day', () => {
  // US clocks fall back on Sunday 2026-11-01. The test script pins TZ.
  assert.equal(new Date(2026, 10, 1, 12).getTimezoneOffset() > new Date(2026, 9, 30, 12).getTimezoneOffset(), true,
    'this test needs a timezone with a fall-back on 2026-11-01 (npm test sets TZ=America/Los_Angeles)');
  const festival = ev(at(2026, 10, 30, 18), at(2026, 11, 2, 23));
  for (const [m, d] of [[10, 30], [10, 31], [11, 1], [11, 2]]) {
    assert.equal(eventSpanOverlapsWindow(festival, ...dayWindow(2026, m, d)), true, `missing on ${m}/${d}`);
  }
});

test('a five-day run across the spring clock change still collapses', () => {
  // Spring forward (2027-03-14) makes a day 23 hours; five calendar days
  // must still count as five.
  const run = ev(at(2027, 3, 12, 18), at(2027, 3, 16, 23));
  assert.equal(eventSpanOverlapsWindow(run, ...dayWindow(2027, 3, 12)), true);
  assert.equal(eventSpanOverlapsWindow(run, ...dayWindow(2027, 3, 14)), false);
});
