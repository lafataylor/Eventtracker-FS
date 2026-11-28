// Shared Tailwind class strings for the admin mobile pass (2026-11-20).
// Owner phone screenshots (iOS Safari ~390px): login labels/links clipped
// from min-w-[400px] side-by-side fields; Manage Accounts sidebar permanently
// stole width / overlapped the table. Desktop (md+) keeps the existing look.
//
// text-base / md:text-sm on auth inputs matches mobileSafeInputTextClass()
// (iOS Safari zoom). Inlined here so node:test can load this file without a
// extensioned relative import (same gotcha as cityRegion → locationSlug).

/** Auth form fields: full width on phone, side-by-side label+input from sm up. */
export function adminAuthFieldRowClass(): string {
  return 'flex flex-col sm:flex-row sm:justify-between gap-2 sm:gap-8 sm:items-center w-full max-w-md sm:max-w-none';
}

/** Auth inputs: no fixed min-width; 16px text on phone to avoid iOS zoom. */
export function adminAuthInputClass(): string {
  return 'rounded-xl h-14 px-3 w-full sm:w-[400px] sm:max-w-[400px] border-2 border-slate-black text-base md:text-sm text-black';
}

/** Page titles: text-5xl overflows a phone; scale down below md. */
export function adminPageTitleClass(extra = ''): string {
  const base = 'text-2xl sm:text-3xl md:text-5xl font-bold px-3';
  return extra ? `${base} ${extra}` : base;
}

// Top padding that clears the fixed mobile admin bar.
// 2026-11-27: bar is a fixed h-14 (56px) with border-b-2 (inside the box),
// so pt-14 clears it. Older pt-20 was for the taller py-3 + h-11 + border-b-4
// chrome. Do not pass mobile p-4 or pt-4 in `extra`; use px- / pb- and
// md:p- / md:pt- so this top pad is not fought. Events dense page uses its
// own pad helper (adminEventsDense) because it also clears a fixed toolbar.
export const ADMIN_MOBILE_TOP_PAD = 'pt-14 md:pt-0';

/** Main pane beside the sidebar: shrink in flex, clear the mobile menu bar. */
export function adminMainPaneClass(extra = ''): string {
  const base =
    'min-w-0 flex-1 h-full font-montserrat flex flex-col text-off-white overflow-x-hidden ' +
    ADMIN_MOBILE_TOP_PAD;
  return extra ? `${base} ${extra}` : base;
}
