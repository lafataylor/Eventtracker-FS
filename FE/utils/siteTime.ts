// Site calendar day is America/Los_Angeles — same as Django TIME_ZONE.
// SSR hosts often run UTC; without an explicit zone, Date#getDay() and
// weekday labels disagree with a Pacific browser and React hydrates
// "(Tuesday)" vs "(Monday)" on EventsSection. 2026-11-17.

export const SITE_TIME_ZONE = 'America/Los_Angeles';

export const SITE_WEEKDAY_NAMES: readonly string[] = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

export type SiteCalendarParts = {
  year: number;
  month: number; // 1–12
  day: number;
  hour: number; // 0–23
  dayOfWeek: number; // 0 = Sunday … 6 = Saturday
  weekdayName: string;
};

function partValue(
  parts: Intl.DateTimeFormatPart[],
  type: Intl.DateTimeFormatPartTypes
): string {
  return parts.find((p) => p.type === type)?.value ?? '';
}

/** Calendar parts for `now` in the site timezone (not the process timezone). */
export function getSiteCalendarParts(now: Date = new Date()): SiteCalendarParts {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: SITE_TIME_ZONE,
    weekday: 'long',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);

  const year = Number(partValue(parts, 'year'));
  const month = Number(partValue(parts, 'month'));
  const day = Number(partValue(parts, 'day'));
  let hour = Number(partValue(parts, 'hour'));
  // Some engines emit 24 for midnight under h23; treat as 0.
  if (hour === 24) hour = 0;

  const weekdayName = partValue(parts, 'weekday');
  const dayOfWeek = SITE_WEEKDAY_NAMES.indexOf(weekdayName);
  if (dayOfWeek < 0) {
    throw new Error(`Unexpected weekday from ${SITE_TIME_ZONE}: ${weekdayName}`);
  }

  return { year, month, day, hour, dayOfWeek, weekdayName };
}

/** Local Date at site-calendar midnight (Y/M/D from Pacific, wall clock of the runtime). */
export function siteCalendarDate(now: Date = new Date()): Date {
  const { year, month, day } = getSiteCalendarParts(now);
  return new Date(year, month - 1, day, 0, 0, 0, 0);
}

/** Parenthetical section label, e.g. "(Monday)". */
export function siteWeekdaySubtitle(dayOfWeek: number): string {
  return `(${SITE_WEEKDAY_NAMES[dayOfWeek]})`;
}
