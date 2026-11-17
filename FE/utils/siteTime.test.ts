// Run: npm test
//
// EventsSection day labels must use America/Los_Angeles even when the
// process timezone is UTC (typical SSR). Otherwise React hydrates
// Server "(Tuesday)" / Client "(Monday)". 2026-11-17.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SITE_TIME_ZONE,
  SITE_WEEKDAY_NAMES,
  getSiteCalendarParts,
  siteCalendarDate,
  siteWeekdaySubtitle,
} from './siteTime.ts';

test('SITE_TIME_ZONE matches Django TIME_ZONE', () => {
  assert.equal(SITE_TIME_ZONE, 'America/Los_Angeles');
});

test('late Pacific Monday is still Monday when the UTC clock is Tuesday', () => {
  // 2026-11-17 07:30 UTC = 2026-11-16 23:30 America/Los_Angeles (Monday).
  const utcTuesdayMorning = new Date('2026-11-17T07:30:00.000Z');
  assert.equal(utcTuesdayMorning.getUTCDay(), 2, 'fixture must be Tuesday UTC');

  const parts = getSiteCalendarParts(utcTuesdayMorning);
  assert.equal(parts.weekdayName, 'Monday');
  assert.equal(parts.dayOfWeek, 1);
  assert.equal(parts.year, 2026);
  assert.equal(parts.month, 11);
  assert.equal(parts.day, 16);
  assert.equal(parts.hour, 23);
  assert.equal(siteWeekdaySubtitle(parts.dayOfWeek), '(Monday)');
});

test('Pacific midnight rollover: just after LA midnight is Tuesday', () => {
  // 2026-11-17 08:00 UTC = 2026-11-17 00:00 America/Los_Angeles (Tuesday).
  const laMidnight = new Date('2026-11-17T08:00:00.000Z');
  const parts = getSiteCalendarParts(laMidnight);
  assert.equal(parts.weekdayName, 'Tuesday');
  assert.equal(parts.dayOfWeek, 2);
  assert.equal(parts.day, 17);
  assert.equal(parts.hour, 0);
  assert.equal(siteWeekdaySubtitle(parts.dayOfWeek), '(Tuesday)');
});

test('siteCalendarDate uses Pacific Y/M/D, not UTC getUTC* fields', () => {
  const utcTuesdayMorning = new Date('2026-11-17T07:30:00.000Z');
  const local = siteCalendarDate(utcTuesdayMorning);
  assert.equal(local.getFullYear(), 2026);
  assert.equal(local.getMonth(), 10); // November
  assert.equal(local.getDate(), 16);
  assert.equal(local.getHours(), 0);
});

test('weekday name table is Sunday-first to match Date#getDay', () => {
  assert.equal(SITE_WEEKDAY_NAMES[0], 'Sunday');
  assert.equal(SITE_WEEKDAY_NAMES[1], 'Monday');
  assert.equal(SITE_WEEKDAY_NAMES[6], 'Saturday');
});
