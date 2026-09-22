// Run: npm test
//
// Desktop list offerings wrap like flex chips. +N is a real chip in that
// wrap, and space is reserved for it so nothing is clipped.
import test from 'node:test';
import assert from 'node:assert/strict';
import { fitOfferingChips } from './fitOfferingChips.ts';

const gapX = 6;
const maxRows = 3;

test('all chips that fit on one row stay visible with no overflow chip', () => {
  const fit = fitOfferingChips({
    chipWidths: [40, 40, 40],
    extraWidthFor: () => 30,
    containerWidth: 200,
    gapX,
    maxRows,
  });
  assert.deepEqual(fit, { visibleIndexes: [0, 1, 2], extraCount: 0 });
});

test('chips may fill up to three rows without a +N chip when everything fits', () => {
  const fit = fitOfferingChips({
    chipWidths: [90, 90, 90],
    extraWidthFor: () => 30,
    containerWidth: 100,
    gapX,
    maxRows,
  });
  assert.deepEqual(fit, { visibleIndexes: [0, 1, 2], extraCount: 0 });
});

test('more chips than three rows keeps a prefix and a +N chip', () => {
  const fit = fitOfferingChips({
    chipWidths: [90, 90, 90, 90],
    extraWidthFor: () => 30,
    containerWidth: 100,
    gapX,
    maxRows,
  });
  assert.deepEqual(fit.visibleIndexes, [0, 1]);
  assert.equal(fit.extraCount, 2);
});

test('if the last content chip cannot sit on the same last row as +N, hide it', () => {
  // Row 2 is already full with a 90px chip; +N is 40px and cannot sit
  // alongside it, so wrapping +N would be a 3rd row. Drop the 90px chip.
  const fit = fitOfferingChips({
    chipWidths: [90, 90, 90],
    extraWidthFor: () => 40,
    containerWidth: 100,
    gapX,
    maxRows: 2,
  });
  assert.deepEqual(fit, { visibleIndexes: [0], extraCount: 2 });
});

test('keep the last content chip when it fits fully alongside +N', () => {
  // Two 50px chips wrap to two rows. +N is 40px and fits next to the
  // second chip: 50 + 6 + 40 = 96 <= 100.
  const fit = fitOfferingChips({
    chipWidths: [50, 50, 50],
    extraWidthFor: () => 40,
    containerWidth: 100,
    gapX,
    maxRows: 2,
  });
  assert.deepEqual(fit, { visibleIndexes: [0, 1], extraCount: 1 });
});

test('a chip wider than the container is skipped; later chips can still show', () => {
  const fit = fitOfferingChips({
    chipWidths: [80, 200, 40],
    extraWidthFor: () => 30,
    containerWidth: 100,
    gapX,
    maxRows,
  });
  assert.deepEqual(fit.visibleIndexes, [0, 2]);
  assert.equal(fit.extraCount, 1);
});

test('a first chip that cannot fit still lets later chips sit beside +N', () => {
  const fit = fitOfferingChips({
    chipWidths: [136, 89, 140, 59],
    extraWidthFor: () => 34,
    containerWidth: 124,
    gapX,
    maxRows,
  });
  assert.ok(!fit.visibleIndexes.includes(0));
  assert.ok(!fit.visibleIndexes.includes(2));
  assert.ok(fit.visibleIndexes.includes(1));
  assert.ok(fit.extraCount > 0);
});

test('a wider +N (from a larger count) can force one more chip into the overflow', () => {
  const fitNarrowPlus = fitOfferingChips({
    chipWidths: [70, 70],
    extraWidthFor: (n) => (n >= 2 ? 50 : 28),
    containerWidth: 100,
    gapX,
    maxRows: 1,
  });
  assert.equal(fitNarrowPlus.extraCount, 2);
  assert.deepEqual(fitNarrowPlus.visibleIndexes, []);
});

test('empty input shows nothing', () => {
  const fit = fitOfferingChips({
    chipWidths: [],
    extraWidthFor: () => 30,
    containerWidth: 100,
    gapX,
    maxRows,
  });
  assert.deepEqual(fit, { visibleIndexes: [], extraCount: 0 });
});
