export const DESKTOP_LIST_CHIP_MAX_ROWS = 3;

export type FitOfferingChipsInput = {
  chipWidths: number[];
  extraWidthFor: (extraCount: number) => number;
  containerWidth: number;
  gapX: number;
  maxRows: number;
};

export type FitOfferingChipsResult = {
  visibleIndexes: number[];
  extraCount: number;
};

function itemsFit(
  widths: number[],
  containerWidth: number,
  gapX: number,
  maxRows: number
) {
  if (containerWidth <= 0) return false;
  let row = 1;
  let used = 0;
  for (const width of widths) {
    if (width > containerWidth) return false;
    if (used === 0) {
      used = width;
      continue;
    }
    if (used + gapX + width <= containerWidth) {
      used += gapX + width;
      continue;
    }
    row += 1;
    used = width;
    if (row > maxRows) return false;
  }
  return true;
}

function packWidths(
  contentWidths: number[],
  extraCount: number,
  extraWidthFor: (extraCount: number) => number
) {
  if (extraCount > 0) return [...contentWidths, extraWidthFor(extraCount)];
  return contentWidths;
}

// Walk chips in order. +N is laid out as a normal last chip whenever
// anything is hidden, so a candidate is kept only if it fits fully
// beside that reserved +N (or on an earlier wrap row). Chips wider
// than the column are skipped rather than clipped.
export function fitOfferingChips({
  chipWidths,
  extraWidthFor,
  containerWidth,
  gapX,
  maxRows,
}: FitOfferingChipsInput): FitOfferingChipsResult {
  const total = chipWidths.length;
  if (total === 0) return { visibleIndexes: [], extraCount: 0 };

  const visibleIndexes: number[] = [];
  for (let i = 0; i < total; i++) {
    const width = chipWidths[i];
    if (width > containerWidth) continue;
    const nextIndexes = [...visibleIndexes, i];
    const extraCount = total - nextIndexes.length;
    const widths = packWidths(
      nextIndexes.map((index) => chipWidths[index]),
      extraCount,
      extraWidthFor
    );
    if (itemsFit(widths, containerWidth, gapX, maxRows)) {
      visibleIndexes.push(i);
    }
  }

  return {
    visibleIndexes,
    extraCount: total - visibleIndexes.length,
  };
}
