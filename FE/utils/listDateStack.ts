// Shared stacked-date parts for list cards. Desktop uses weekday + monthDay;
// mobile list uses weekday, padded day, and month. 2026-11-15.

export function listDateStack(startDate: string | null | undefined) {
  if (!startDate) {
    return { weekday: '', monthDay: '', day: '', month: '' };
  }
  const date = new Date(startDate);
  if (Number.isNaN(date.getTime())) {
    return { weekday: '', monthDay: '', day: '', month: '' };
  }
  return {
    weekday: date
      .toLocaleDateString('en-US', { weekday: 'short' })
      .toUpperCase(),
    monthDay: date
      .toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      .toUpperCase(),
    day: String(date.getDate()).padStart(2, '0'),
    month: date.toLocaleDateString('en-US', { month: 'short' }).toUpperCase(),
  };
}
