import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const route = fs.readFileSync(path.join(process.cwd(), "src/app/api/nexus/multi-brand-intelligence/route.ts"), "utf8");
const page = fs.readFileSync(path.join(process.cwd(), "src/app/(content)/nexus-os/multi-brand-intelligence/page.tsx"), "utf8");

test("multi-brand route is admin-only, canonical, aggregate and read-only", () => {
  assert.match(route, /requireAdminApi/);
  assert.match(route, /OWNED_GROWTH_BRANDS/);
  assert.match(route, /buildCanonicalLeadAttribution/);
  assert.match(route, /loadNexusRevenueCommandSnapshot/);
  assert.match(route, /buildRevenueBrainV2/);
  assert.doesNotMatch(route, /\.insert\(|\.update\(|\.upsert\(|sendBrandEmail/);
});

test("portfolio UI communicates isolation and human-reviewed transfer", () => {
  for (const value of ["Multi-brand Intelligence", "Brand-isolert", "Aggregert", "menneskelig vurdering", "Ingen automatisk overføring"]) {
    assert.match(page, new RegExp(value, "i"));
  }
});
