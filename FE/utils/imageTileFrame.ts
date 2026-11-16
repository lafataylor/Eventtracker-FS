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
// 2026-11-15: full `rounded-md` + `overflow-hidden` cut flyer title
// lettering near the bottom corners (#20). Squaring bottoms (`rounded-t-md`)
// was not enough — Winter Solstice still lost its corner “W” on live
// (2026-11-16). Any radius on the overflow clip eats pixels in that curve.
// Keep the rounded flyer chrome; inset the image with padding so lettering
// clears the curve (md radius = 6px, p-2 = 8px). Board absolute imgs must
// use matching `inset-2` — `inset-0` ignores parent padding.

export const PORTRAIT_FLYER_ASPECT_CLASS = 'aspect-[3/4]';

/** Radius on the masonry/grid flyer frame (clip curve). */
export const IMAGE_TILE_RADIUS_CLASS = 'rounded-md';

/** Inset so flyer pixels clear IMAGE_TILE_RADIUS_CLASS. */
export const IMAGE_TILE_PAD_CLASS = 'p-2';

/**
 * Absolute board img inset matching IMAGE_TILE_PAD_CLASS.
 * Parent padding does not offset `inset-0` children.
 */
export const IMAGE_TILE_ABS_INSET_CLASS = 'inset-2';

export function imageTileFrameClass(isMasonry: boolean): string {
  const base =
    `relative w-full overflow-hidden ${IMAGE_TILE_RADIUS_CLASS} ${IMAGE_TILE_PAD_CLASS} bg-stone-gray`;
  if (isMasonry) {
    return base;
  }
  return `${base} ${PORTRAIT_FLYER_ASPECT_CLASS}`;
}

/** Masonry: in-flow (parent pad insets). Board: absolute with matching inset. */
export function imageTileImgClass(isMasonry: boolean): string {
  if (isMasonry) {
    return 'block w-full h-auto';
  }
  return `absolute ${IMAGE_TILE_ABS_INSET_CLASS} object-cover`;
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
