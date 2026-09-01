import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_KDP_PRINT_PROFILE,
  inchesToPoints,
  kdpFullCoverDimensionsIn,
  kdpSpineWidthIn,
  normalizePrintPageCount,
  printProfileSummary,
} from "./book-print-production";

test("normalizes print interiors to an even page count", () => {
  assert.equal(normalizePrintPageCount(101), 102);
  assert.equal(normalizePrintPageCount(166), 166);
});

test("uses the locked cream-paper spine formula", () => {
  assert.equal(kdpSpineWidthIn(166, "cream"), 0.415);
  assert.equal(kdpSpineWidthIn(337, "cream"), 0.845);
});

test("builds exact 6x9 KDP full-cover dimensions with bleed", () => {
  const dims = kdpFullCoverDimensionsIn(166, DEFAULT_KDP_PRINT_PROFILE);
  assert.equal(dims.widthIn, 12.665);
  assert.equal(dims.heightIn, 9.25);
  assert.equal(dims.spineWidthIn, 0.415);
});

test("converts trim and wrap dimensions to PDF points", () => {
  const summary = printProfileSummary(166);
  assert.equal(inchesToPoints(6), 432);
  assert.equal(summary.trimWidthPt, 432);
  assert.equal(summary.trimHeightPt, 648);
  assert.equal(summary.fullCoverWidthPt, 911.88);
  assert.equal(summary.fullCoverHeightPt, 666);
  assert.equal(summary.productionStatus, "publication_ready");
});
