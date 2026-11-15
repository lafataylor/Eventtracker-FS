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

export const defaultViewMode = (width: number): ViewMode =>
  width < VIEW_MODE_MD_PX ? 'board' : 'masonry';

export function useViewMode(): [ViewMode, (mode: ViewMode) => void] {
  // SSR and first paint match desktop so the HTML hydrates cleanly.
  // Phones switch to grid after mount.
  const [viewMode, setViewMode] = useState<ViewMode>('masonry');

  useEffect(() => {
    setViewMode(defaultViewMode(window.innerWidth));
  }, []);

  return [viewMode, setViewMode];
}
