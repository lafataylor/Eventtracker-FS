// City URLs: lowercase, no spaces, no hyphens.
// "Los Angeles" → /losangeles. Same rule for every city we add later —
// pass the human name through toLocationSlug / cityPath; do not insert dashes.
// 2026-11-14: owner asked to drop the hyphen between city-name words.

const RESERVED_CITY_PATHS = new Set([
  'about',
  'admin',
  'api',
  'event',
  'experimental',
  'es',
  'favorites',
  'login',
  'register',
]);

// Titles for the cities we ship today, so /losangeles still reads
// "Los Angeles" before the locations API returns. A new city is titled
// from that API's real name ("New York"), not from this list.
const BUILTIN_CITY_NAMES = [
  'Mexico City',
  'Los Angeles',
  'Berlin',
  'Bali',
];

export const DEFAULT_CITY_NAME = 'Mexico City';

export const toLocationSlug = (value?: string | null): string =>
  (value || '').toLowerCase().replace(/[-\s]/g, '');

export const locationSlugMatches = (a: string, b: string): boolean =>
  toLocationSlug(a) === toLocationSlug(b);

export const cityPath = (
  nameOrSlug: string,
  language: 'en' | 'es' = 'en'
): string => {
  const slug = toLocationSlug(nameOrSlug);
  return language === 'es' ? `/es/${slug}` : `/${slug}`;
};

export const isSharedEventPage = (pathname: string): boolean =>
  pathname === '/event/share/[id]' || /\/event\/share\/[^/]+/.test(pathname);

// Closing a shared event should land on that event's city, not Mexico City.
// forLocation is the human name from the API ("Los Angeles"); cityPath
// turns it into the dashless URL. A missing/general location still falls
// back to Mexico City. New cities work without extra code.
export const sharedEventCityPath = (
  event: {
    forLocation?: string | null;
    poster?: { forLocation?: string | null } | null;
    viewing_language?: string;
  },
  language: 'en' | 'es' = 'en'
): string => {
  const raw = (event.forLocation || event.poster?.forLocation || '').trim();
  const first = raw.split(',')[0].trim();
  const city =
    !first || first.toLowerCase() === 'general' ? DEFAULT_CITY_NAME : first;
  const lang = event.viewing_language === 'es' ? 'es' : language;
  return cityPath(city, lang);
};

export const isMexicoCity = (nameOrSlug?: string | null): boolean =>
  toLocationSlug(nameOrSlug) === 'mexicocity';

export const isSanFrancisco = (nameOrSlug?: string | null): boolean =>
  toLocationSlug(nameOrSlug).includes('sanfran');

export const displayLocationName = (
  slugOrName: string,
  knownNames: string[] = []
): string => {
  if (!slugOrName) return '';
  if (slugOrName === 'general') return 'General';
  const key = toLocationSlug(slugOrName);
  const match = [...BUILTIN_CITY_NAMES, ...knownNames].find(
    (name) => toLocationSlug(name) === key
  );
  const source = match || slugOrName;
  return source
    .replace(/-/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
};

// Old /los-angeles bookmarks, and any future hyphenated city URL, rewrite
// to the dashless form. Returns null when the path is already dashless or
// is not a city page.
export const redirectHyphenatedCityPath = (pathname: string): string | null => {
  const match = pathname.match(/^\/(es\/)?([^/]+)(\/?)$/);
  if (!match) return null;
  const prefix = match[1] || '';
  const slug = match[2];
  if (RESERVED_CITY_PATHS.has(slug) || !slug.includes('-')) return null;
  return `/${prefix}${slug.replace(/-/g, '')}/`;
};
