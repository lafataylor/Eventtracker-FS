// Image tile frames for event cards.
//
// 2026-11-16: grid (board) and cards (flyer) use portrait 3:4 so flyers
// read as flyers instead of cropped squares. Masonry keeps natural height.
// List thumbs stay fixed-size elsewhere in EventCard.
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
