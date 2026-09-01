import assert from "node:assert/strict";
import test from "node:test";
import { buildSourceHealth } from "./source-health";

test("source health separates provenance from acquisition channel", () => {
  const result = buildSourceHealth([
    { id: "1", source: "Kommo Event" },
    { id: "2", source: "Kommo Event" },
    { id: "3", source: "Soleada.no" },
    { id: "4", source: "Manuell" },
    { id: "5", source: "manual" },
    { id: "6", source: "zenecohomes-home" },
  ]);

  assert.equal(result.summary.total, 6);
  assert.equal(result.summary.legacyCrm, 2);
  assert.equal(result.summary.brandSourceOnly, 1);
  assert.equal(result.summary.manual, 2);
  assert.equal(result.summary.acquisitionChannelKnown, 1);
  assert.equal(result.summary.acquisitionChannelUnknown, 5);

  const manual = result.groups.find((row) => row.sourceType === "manual");
  assert.ok(manual);
  assert.deepEqual(manual.rawVariants.sort(), ["Manuell", "manual"].sort());
  assert.ok(result.recommendations.some((text) => /marketing event/i.test(text)));
});
