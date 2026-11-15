import { useEffect, useState } from 'react';

export type ViewMode = 'flyer' | 'list' | 'board' | 'masonry';

export type ViewModeLayout = 'desktop' | 'mobile';

// Tailwind `md` is 768px. Same cutoff the two ViewModeToggle copies use
// (hidden md:inline-flex vs md:hidden).
export const VIEW_MODE_MD_PX = 768;

// Desktop: masonry, list, grid (board), cards (flyer).
// Phone: grid, list, masonry, cards.
export const VIEW_MODE_ORDER: Record<ViewModeLayout, readonly ViewMode[]> = {
  desktop: ['masonry', 'list', 'board', 'flyer'],
  mobile: ['board', 'list', 'masonry', 'flyer'],
};

// Short names for the mobile dropdown menu (aria labels keep the longer form).
export const VIEW_MODE_MENU_LABELS: Record<ViewMode, string> = {
  masonry: 'Masonry',
  list: 'List',
  board: 'Grid',
  flyer: 'Cards',
};

export const VIEW_MODE_STORAGE_KEY = 'lafaslist.viewMode';

export const defaultViewMode = (width: number): ViewMode =>
  width < VIEW_MODE_MD_PX ? 'board' : 'masonry';

export function isViewMode(value: unknown): value is ViewMode {
  return (
    value === 'flyer' ||
    value === 'list' ||
    value === 'board' ||
    value === 'masonry'
  );
}

export function readStoredViewMode(): ViewMode | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(VIEW_MODE_STORAGE_KEY);
    return isViewMode(raw) ? raw : null;
  } catch {
    return null;
  }
}

export function writeStoredViewMode(mode: ViewMode): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(VIEW_MODE_STORAGE_KEY, mode);
  } catch {
    // Private mode / quota — preference just will not stick.
  }
}

export function resolveInitialViewMode(width: number): ViewMode {
  return readStoredViewMode() ?? defaultViewMode(width);
}

export function useViewMode(): [ViewMode, (mode: ViewMode) => void] {
  // SSR and first paint match desktop so the HTML hydrates cleanly.
  // After mount: stored preference wins, else width-based default.
  const [viewMode, setViewModeState] = useState<ViewMode>('masonry');

  useEffect(() => {
    setViewModeState(resolveInitialViewMode(window.innerWidth));
  }, []);

  const setViewMode = (mode: ViewMode) => {
    setViewModeState(mode);
    writeStoredViewMode(mode);
  };

  return [viewMode, setViewMode];
}
