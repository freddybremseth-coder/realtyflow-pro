import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const guard = fs.readFileSync(path.join(process.cwd(), "src/lib/workspaces/require-brand-workspace.ts"), "utf8");
const route = fs.readFileSync(path.join(process.cwd(), "src/app/api/workspaces/[brandKey]/growth/route.ts"), "utf8");
const page = fs.readFileSync(path.join(process.cwd(), "src/app/(realty)/workspace/[brandKey]/page.tsx"), "utf8");

test("workspace access carries verified global OWNER role without broadening employee grants", () => {
  assert.match(guard, /role: AccessRole/);
  assert.match(guard, /role: context\.role/);
  assert.match(guard, /if \(role === "OWNER"\) return true/);
  assert.match(guard, /hasVerifiedBrandGrant/);
});

test("owner Growth read bypasses employee membership snapshot only after scoped owner access", () => {
  assert.match(route, /const access = await growthReadAccess/);
  assert.match(route, /access\.value\.role === "OWNER"/);
  assert.match(route, /ownerGrowthSnapshot\(access\.value\.supabase, params\.brandKey\)/);
  assert.match(route, /workspace_brand_growth_snapshot/);
  assert.match(route, /if \(!access\.value\.verifiedUserId\) return fail\(403, "STAFF_ONLY"\)/);
});

test("direct SoMe Studio does not mount unrelated Growth Corporate snapshot", () => {
  assert.match(page, /showGrowthTools && requestedFocus !== "social"/);
  assert.match(page, /id="workspace-focus-social"/);
  assert.match(page, /WorkspaceMarketingPanel/);
});
