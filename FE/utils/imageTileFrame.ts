// Masonry + grid (board) flyer frames.
//
// 2026-11-15: full `rounded-md` with `overflow-hidden` cut title lettering
// printed near the bottom corners of the flyer (owner screenshot). Keep the
// same top radius; square the bottom so that text stays intact. Same class
// on desktop and mobile — phone grid/masonry use this frame too.

export function imageTileFrameClass(isMasonry: boolean): string {
  const radius = 'rounded-t-md';
  if (isMasonry) {
    return `relative w-full overflow-hidden ${radius} bg-stone-gray`;
  }
  return `relative w-full aspect-square overflow-hidden ${radius} bg-stone-gray`;
}
