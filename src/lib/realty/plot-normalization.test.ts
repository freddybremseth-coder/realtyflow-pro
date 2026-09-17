import assert from "node:assert/strict";
import test from "node:test";
import {
  extractPlotAreaFromSource,
  normalizePlotArea,
  normalizePlotZoning,
} from "./plot-normalization";

test("extracts European thousands formats from plot source notes", () => {
  assert.equal(extractPlotAreaFromSource("12-554 m2 55.000€"), 12554);
  assert.equal(extractPlotAreaFromSource("11 766 m² 55.000€"), 11766);
  assert.equal(extractPlotAreaFromSource("24 543 m² 60.000€"), 24543);
  assert.equal(extractPlotAreaFromSource("Rústico 14.045 m² - 50.000€"), 14045);
});

test("repairs clearly truncated imported area but preserves credible values", () => {
  assert.equal(normalizePlotArea(554, "12-554 m2 55.000€"), 12554);
  assert.equal(normalizePlotArea(766, "11 766 m² 55.000€"), 11766);
  assert.equal(normalizePlotArea(543, "24 543 m² 60.000€"), 24543);
  assert.equal(normalizePlotArea(0, "10.000 m² 35.000€"), 10000);
  assert.equal(normalizePlotArea(14045, "14.045 m² - 50.000€"), 14045);
  assert.equal(normalizePlotArea(370, "370 m² 65.000€"), 370);
});

test("uses explicit source zoning to correct a default rustic classification", () => {
  assert.equal(normalizePlotZoning("rustico", "Urbano Aspe - C/ Carche 16", "365 m²"), "urbano");
  assert.equal(normalizePlotZoning("rustico", "Parcela", "Terreno Urbano: 900 m²"), "urbano");
  assert.equal(normalizePlotZoning("rustico", "Sector", "Suelo Urbanizable"), "urbanizable");
});

test("preserves an explicit structured zoning when source evidence does not contradict it", () => {
  assert.equal(normalizePlotZoning("urbano", "Parcela", "370 m²"), "urbano");
  assert.equal(normalizePlotZoning("rustico", "Parcela", "Rústico 14.045 m²"), "rustico");
  assert.equal(normalizePlotZoning("", "Parcela", "Rústico 14.045 m²"), "rustico");
});
