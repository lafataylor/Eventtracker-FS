// iOS Safari auto-zooms focused inputs whose computed font-size is under
// 16px, then leaves the page zoomed so the right edge clips (owner
// screenshot 2026-11-16 on the city-page search bar).
//
// text-base is 16px; keep text-sm on md+ so desktop chrome stays unchanged.

export function mobileSafeInputTextClass(): string {
  return 'text-base md:text-sm';
}
