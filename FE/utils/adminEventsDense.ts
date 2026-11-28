// Dense mobile chrome for admin Manage Events (owner 2026-11-27).
// Header 52–56px + 2px orange rule; Search+Filter+Sort+More on one row;
// Select beside the section label; hide chrome on scroll-down, reveal on up.
// Desktop (md+) is unchanged — these helpers are mobile-only class strings.

/** Fixed mobile admin bar height (includes 2px orange bottom border). */
export const ADMIN_EVENTS_MOBILE_HEADER_PX = 56;

/** Approximate search toolbar height (h-12 search + py + border). */
export const ADMIN_EVENTS_MOBILE_TOOLBAR_PX = 56;

/** Touch target for icon-only Filter / Sort / More. */
export const ADMIN_EVENTS_ICON_BTN_PX = 44;

/**
 * Decide whether chrome should hide after a scroll delta.
 * Small wiggles under the threshold are ignored so the bar does not flicker.
 */
export function shouldHideAdminChrome(opts: {
  scrollTop: number;
  lastScrollTop: number;
  currentlyHidden: boolean;
  /** Pixels of movement before a direction change counts. */
  threshold?: number;
  /** Always show when near the top of the list. */
  topRevealPx?: number;
}): boolean {
  const threshold = opts.threshold ?? 6;
  const topRevealPx = opts.topRevealPx ?? 8;
  const { scrollTop, lastScrollTop, currentlyHidden } = opts;
  const delta = scrollTop - lastScrollTop;

  if (scrollTop <= topRevealPx) return false;
  if (delta > threshold) return true;
  if (delta < -threshold) return false;
  return currentlyHidden;
}

/** Mobile Events main-pane pad: 12px sides, clears fixed header. */
export function adminEventsDenseMainPaneClass(): string {
  // pt-[56px] matches ADMIN_EVENTS_MOBILE_HEADER_PX; toolbar is fixed under it
  // so content also needs toolbar clearance via adminEventsDenseContentPadClass.
  return (
    'min-w-0 flex-1 h-full font-montserrat flex flex-col text-off-white ' +
    'overflow-x-hidden md:overflow-x-auto overflow-y-hidden ' +
    'px-3 md:px-8 pt-[56px] md:pt-8'
  );
}

/** Extra top pad on the scroll body so the fixed toolbar does not cover rows. */
export function adminEventsDenseContentPadClass(chromeHidden: boolean): string {
  // When chrome is hidden the fixed stack is off-screen; keep a small top gap.
  return chromeHidden
    ? 'pt-2 md:pt-0'
    : 'pt-[56px] md:pt-0';
}

/** One-row mobile toolbar under the header. */
export function adminEventsDenseToolbarClass(chromeHidden: boolean): string {
  const hide = chromeHidden
    ? '-translate-y-[calc(100%+56px)]'
    : 'translate-y-0';
  return (
    'md:hidden fixed left-0 right-0 top-[56px] z-[35] ' +
    'flex items-center gap-2 px-3 py-2 bg-midnight ' +
    'border-b border-beaming-orange/30 ' +
    'transition-transform duration-200 ease-out ' +
    hide
  );
}

/** Icon-only Filter / Sort / More: 44px tap target. */
export function adminEventsDenseIconBtnClass(active = false): string {
  const activeCls = active
    ? 'bg-pearl-white text-slate-black border-pearl-white'
    : 'bg-slate-black text-mist-white border-slate-black';
  return (
    'flex items-center justify-center shrink-0 ' +
    'w-11 h-11 min-w-[44px] min-h-[44px] ' +
    'rounded-lg border border-solid relative overflow-clip ' +
    activeCls
  );
}

/** Select / Done beside the section title (mobile only). */
export function adminEventsDenseSelectBtnClass(): string {
  return (
    'md:hidden shrink-0 text-midnight font-semibold text-sm ' +
    'px-2 py-1 min-h-[40px] flex items-center'
  );
}
