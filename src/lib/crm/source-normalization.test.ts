import assert from "node:assert/strict";
import test from "node:test";
import { normalizeCrmSource } from "./source-normalization";

test("Kommo Event is legacy CRM provenance, not a marketing event", () => {
  const result = normalizeCrmSource("Kommo Event");
  assert.equal(result.sourceType, "legacy_crm");
  assert.equal(result.sourceDetail, "Kommo");
  assert.equal(result.acquisitionChannelKnown, false);
  assert.equal(result.rawSource, "Kommo Event");
});

test("Soleada.no preserves relationship provenance without inventing an acquisition channel", () => {
  const result = normalizeCrmSource("Soleada.no");
  assert.equal(result.sourceType, "brand_source");
  assert.equal(result.sourceDetail, "Soleada.no");
  assert.equal(result.acquisitionChannelKnown, false);
});

test("manual aliases normalize without rewriting raw source", () => {
  for (const raw of ["Manuell", "manual"]) {
    const result = normalizeCrmSource(raw);
    assert.equal(result.sourceType, "manual");
    assert.equal(result.rawSource, raw);
    assert.equal(result.acquisitionChannelKnown, false);
  }
});

test("ZenEco home source is a known web form", () => {
  const result = normalizeCrmSource("zenecohomes-home");
  assert.equal(result.sourceType, "web_form");
  assert.equal(result.acquisitionChannelKnown, true);
});

test("real seminar remains event while unknown free text stays other", () => {
  assert.equal(normalizeCrmSource("Costa Blanca seminar").sourceType, "event");
  assert.equal(normalizeCrmSource("Old spreadsheet batch").sourceType, "other");
});
