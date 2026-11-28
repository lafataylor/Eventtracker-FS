// Dense mobile chrome for admin Manage Events (owner 2026-11-27).
// Header 52–56px + 2px orange rule; Search+Filter+Sort+More on one row;
// Select beside the section label; hide chrome on scroll-down, reveal on up.
// Desktop (md+) is unchanged — these helpers are mobile-only class strings.
//
// 2026-11-27 follow-up (LAF-68): content pad must match the real toolbar
// height (SearchBar h-12 + py-2 = 64), not the header's 56. When chrome
// hides, the main-pane pt-[56px] spacer must also collapse — otherwise a
// solid black bar stays at the top and clips the first card. The accordion
// `before:` orange connector is desktop-only (it bled as a thin vertical
// bar behind the first mobile card).

/** Fixed mobile admin bar height (includes 2px orange bottom border). */
export const ADMIN_EVENTS_MOBILE_HEADER_PX = 56;

/**
 * Fixed mobile search toolbar height.
 * SearchBar is h-12 (48) + toolbar py-2 (16) = 64. Keep the toolbar
 * itself at h-16 so pad and chrome stay in lockstep.
 */
export const ADMIN_EVENTS_MOBILE_TOOLBAR_PX = 64;

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

/**
 * Mobile Events main-pane pad: 12px sides.
 * When chrome is visible, clear the fixed 56px header. When chrome is
 * hidden (header translated off-screen), drop that spacer so a black bar
 * does not remain (owner 2026-11-27).
 */
export function adminEventsDenseMainPaneClass(chromeHidden = false): string {
  const topPad = chromeHidden ? 'pt-0' : 'pt-[56px]';
  return (
    'min-w-0 flex-1 h-full font-montserrat flex flex-col text-off-white ' +
    'overflow-x-hidden md:overflow-x-auto overflow-y-hidden ' +
    `px-3 md:px-8 ${topPad} md:pt-8`
  );
}

/**
 * Extra top pad on the scroll body so the fixed toolbar does not cover
 * the All Events accordion. Must match ADMIN_EVENTS_MOBILE_TOOLBAR_PX
 * (64), not the header's 56 — short pad clipped the orange title tab.
 */
export function adminEventsDenseContentPadClass(chromeHidden: boolean): string {
  // When chrome is hidden the fixed stack is off-screen; keep a small top gap.
  return chromeHidden
    ? 'pt-2 md:pt-0'
    : 'pt-16 md:pt-0';
}

/** One-row mobile toolbar under the header. Fixed h-16 matches content pad. */
export function adminEventsDenseToolbarClass(chromeHidden: boolean): string {
  const hide = chromeHidden
    ? '-translate-y-[calc(100%+56px)]'
    : 'translate-y-0';
  return (
    'md:hidden fixed left-0 right-0 top-[56px] z-[35] ' +
    'box-border h-16 flex items-center gap-2 px-3 py-2 bg-midnight ' +
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

/**
 * Accordion section header chrome.
 * The `before:` orange right connector is desktop-only — on phone it showed
 * as a thin vertical bar behind the first list card (owner 2026-11-27).
 */
export function adminEventsSectionHeaderClass(): string {
  return (
    'relative rounded-t-xl ' +
    'md:before:absolute md:before:w-2 md:before:h-[50px] ' +
    'md:before:bg-beaming-orange-dark md:before:right-0 ' +
    'md:before:-bottom-[50px] md:before:z-[1] ' +
    'shadow-[0px_0px_40px_rgba(0,0,0,0.05)] shadow-dim-shadow ' +
    'flex items-start gap-4 p-4 z-[1] ' +
    'bg-beaming-orange hover:filter hover:brightness-[90%] hover:cursor-pointer'
  );
}
