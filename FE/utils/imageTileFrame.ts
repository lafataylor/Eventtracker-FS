// Image tile frames for event cards.
//
// Scope (owner, 2026-11-16): grid (board), cards (flyer), and mobile list
// thumbs use portrait 3:4. Masonry stays natural height. Desktop list keeps
// the fixed 130×86 landscape thumb — do not put aspect classes there.
//
// Tailwind `aspect-[3/4]` → CSS `aspect-ratio: 3 / 4` (width/height), so
// three wide and four tall. The class string must stay a complete literal
// here, and `./utils` must stay in tailwind.config.js content — otherwise
// JIT omits the rule, the frame height is 0, and absolute images vanish.
//
// 2026-11-15: full `rounded-md` with `overflow-hidden` cut title lettering
// printed near the bottom corners of the flyer (owner screenshot). Keep the
// same top radius; square the bottom so that text stays intact. Same class
// on desktop and mobile — phone grid/masonry use this frame too.

export const PORTRAIT_FLYER_ASPECT_CLASS = 'aspect-[3/4]';

export function imageTileFrameClass(isMasonry: boolean): string {
  const radius = 'rounded-t-md';
  if (isMasonry) {
    return `relative w-full overflow-hidden ${radius} bg-stone-gray`;
  }
  return `relative w-full ${PORTRAIT_FLYER_ASPECT_CLASS} overflow-hidden ${radius} bg-stone-gray`;
}

/** Cards (flyer) view image shell. Compact list thumbs keep a fixed size. */
export function flyerCardImageFrameClass(isCompactListThumb: boolean): string {
  if (isCompactListThumb) {
    return 'relative rounded-xl overflow-hidden h-[100px] min-w-[100px] max-w-[100px]';
  }
  return `relative rounded-xl overflow-hidden w-full ${PORTRAIT_FLYER_ASPECT_CLASS}`;
}

/** Desktop list row thumb: fixed 130×86 (not 3:4). Owner 2026-11-16. */
export function desktopListThumbFrameClass(): string {
  return 'relative w-[130px] h-[86px] rounded-lg overflow-hidden bg-stone-gray';
}

/**
 * Mobile list row thumb: same width as before (5.75rem), portrait 3:4.
 * Height comes from aspect-ratio so the flyer reads tall on the phone.
 * self-start is required: the list row uses items-stretch, and a stretched
 * definite height overrides aspect-ratio (thumbs went square/landscape in
 * the phone emulator). Owner 2026-11-16 / LAF-17.
 */
export function mobileListThumbFrameClass(): string {
  return `relative w-[5.75rem] ${PORTRAIT_FLYER_ASPECT_CLASS} self-start rounded-lg overflow-hidden bg-stone-gray shrink-0`;
}
