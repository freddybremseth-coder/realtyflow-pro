import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const route = fs.readFileSync(path.join(process.cwd(), "src/app/api/nexus/growth-scaling/route.ts"), "utf8");
const page = fs.readFileSync(path.join(process.cwd(), "src/app/(content)/nexus-os/growth-scaling/page.tsx"), "utf8");
const layout = fs.readFileSync(path.join(process.cwd(), "src/app/(content)/nexus-os/layout.tsx"), "utf8");

test("Growth Scaling uses canonical attribution and remains advisory", () => {
  assert.match(route, /buildCanonicalLeadAttribution/);
  assert.match(route, /marketingTouchpointFromRow/);
  assert.match(route, /automaticScaleChange: false/);
  assert.match(route, /readOnly: true/);
  assert.doesNotMatch(route, /\.insert\(|\.update\(|\.upsert\(|sendBrandEmail|publisher\.publish/);
});

test("Scaling Control exposes every locked stage and commercial evidence", () => {
  for (const value of ["HOLD", "FOUNDATION", "PILOT", "PROVE", "SCALE", "Kanoniske leads", "Kvalifiserte", "Attribusjonsdekning"]) {
    assert.match(page, new RegExp(value, "i"));
  }
  assert.match(layout, /\/nexus-os\/growth-scaling/);
});
