import { Event } from '../interface/objects/simpleObject';

/** Inclusive calendar-day bounds in local time (start 00:00:00, end 23:59:59.999). */
export function getEventCalendarSpanMs(event: Event): { start: number; end: number } {
  const startRaw = new Date(event.start_date);
  const start = new Date(
    startRaw.getFullYear(),
    startRaw.getMonth(),
    startRaw.getDate(),
    0,
    0,
    0,
    0
  ).getTime();

  const endCandidate =
    event.end_date != null ? String(event.end_date).trim() : '';
  const parsedEnd = endCandidate ? new Date(endCandidate) : null;
  const hasValidEnd =
    parsedEnd != null && !Number.isNaN(parsedEnd.getTime());

  let endRaw = hasValidEnd ? (parsedEnd as Date) : startRaw;

  // If the event's end_time is in the early morning (before 5 AM), don't show
  // the event on that last calendar day — treat the effective end as the day before.
  if (hasValidEnd) {
    const endTimeStr = event.end_time != null ? String(event.end_time).trim() : '';
    const endTimeMatch = endTimeStr.match(/(\d+):(\d+)\s*(AM|PM)/i);
    if (endTimeMatch) {
      let endHour = parseInt(endTimeMatch[1], 10);
      const period = endTimeMatch[3].toUpperCase();
      if (period === 'AM' && endHour === 12) endHour = 0;
      if (period === 'PM' && endHour !== 12) endHour += 12;
      if (endHour < 5) {
        const dayBefore = new Date(endRaw);
        dayBefore.setDate(dayBefore.getDate() - 1);
        endRaw = dayBefore;
      }
    }
  }

  const end = new Date(
    endRaw.getFullYear(),
    endRaw.getMonth(),
    endRaw.getDate(),
    23,
    59,
    59,
    999
  ).getTime();

  if (end < start) {
    return {
      start,
      end: new Date(
        startRaw.getFullYear(),
        startRaw.getMonth(),
        startRaw.getDate(),
        23,
        59,
        59,
        999
      ).getTime(),
    };
  }
  return { start, end };
}

export function eventSpanOverlapsWindow(
  event: Event,
  windowStart: number,
  windowEnd: number
): boolean {
  const { start, end } = getEventCalendarSpanMs(event);
  return start <= windowEnd && end >= windowStart;
}

/** True when the event's start calendar day falls within [windowStart, windowEnd]. */
export function eventStartsInWindow(
  event: Event,
  windowStart: number,
  windowEnd: number
): boolean {
  const { start } = getEventCalendarSpanMs(event);
  return start >= windowStart && start <= windowEnd;
}
