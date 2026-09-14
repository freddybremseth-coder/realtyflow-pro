import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const route = fs.readFileSync(path.join(process.cwd(), "src/app/api/nexus/revenue-brain-v2/route.ts"), "utf8");
const page = fs.readFileSync(path.join(process.cwd(), "src/app/(content)/nexus-os/revenue-brain/page.tsx"), "utf8");

test("Revenue Brain v2 reads the canonical command snapshot and performs no writes", () => {
  assert.match(route, /requireAdminApi/);
  assert.match(route, /loadNexusRevenueCommandSnapshot/);
  assert.match(route, /buildRevenueBrainV2/);
  assert.doesNotMatch(route, /\.insert\(|\.update\(|\.upsert\(|sendBrandEmail/);
});

test("v2 UI exposes impact, confidence, readiness, evidence and desired result", () => {
  for (const value of ["Revenue Brain v2", "Opportunity score", "Confidence", "Readiness", "Ønsket resultat", "Evidens"]) {
    assert.match(page, new RegExp(value, "i"));
  }
});
