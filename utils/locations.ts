import { extractLocationsFromEvents } from './utils';

const getApiBase = () =>
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  'https://eventtrackerapi.lafaslist.com/v1';

const formatTodayForApi = () => {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const year = now.getFullYear();
  return `${month}/${day}/${year}`;
};

export async function fetchAllLocations(
  apiBase: string = getApiBase()
): Promise<string[]> {
  try {
    const res = await fetch(`${apiBase}/event/locations/`);
    if (res.ok) {
      const json = await res.json();
      const data = json.data ?? [];
      if (data.length > 0) return data;
    }
  } catch {
    // fall through to events-based discovery
  }

  try {
    const date = formatTodayForApi();
    const res = await fetch(`${apiBase}/event/date/?date=${date}`);
    if (res.ok) {
      const json = await res.json();
      return extractLocationsFromEvents(json.data ?? []);
    }
  } catch {
    // no locations available
  }

  return [];
}
