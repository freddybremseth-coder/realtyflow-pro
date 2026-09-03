import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const meRoute = fs.readFileSync(path.join(process.cwd(), "src/app/api/personal-intelligence/me/route.ts"), "utf8");
const rejectRoute = fs.readFileSync(path.join(process.cwd(), "src/app/api/personal-intelligence/memory/reject/route.ts"), "utf8");
const mePage = fs.readFileSync(path.join(process.cwd(), "src/app/(content)/personal-intelligence/me/page.tsx"), "utf8");
const layout = fs.readFileSync(path.join(process.cwd(), "src/app/(content)/personal-intelligence/layout.tsx"), "utf8");

test("ME review remains owner-only and service mediated", () => {
  assert.match(meRoute, /access\.role !== "OWNER"/);
  assert.match(meRoute, /getPersonalIntelligenceSupabase/);
  assert.match(rejectRoute, /access\.role !== "OWNER"/);
});

test("ME review does not manufacture a profile when core is empty", () => {
  assert.match(meRoute, /onboardingState: activeClaims\.length === 0 && goals\.length === 0 && topics\.size === 0 \? "empty" : "learning"/);
  assert.match(mePage, /Freddy Core is active, but not learned yet/i);
  assert.match(mePage, /Ukjent betyr ukjent/i);
});

test("observations stay separate from canonical claims", () => {
  assert.match(meRoute, /observationsAreNotFacts: true/);
  assert.match(mePage, /Observations er tentative og holdes separat fra canonical claims/i);
});

test("forget rejects memory with audit and rollback instead of silent deletion", () => {
  assert.match(rejectRoute, /status: "rejected"/);
  assert.match(rejectRoute, /personal_memory_rejected_by_owner/);
  assert.match(rejectRoute, /prior_status/);
  assert.match(rejectRoute, /rollbackError/);
  assert.doesNotMatch(rejectRoute, /\.delete\(\).*from\("claims"\)/);
});

test("ME supports provenance-preserving correction through existing memory route", () => {
  assert.match(mePage, /\/api\/personal-intelligence\/memory\/correct/);
  assert.match(mePage, /superseder den gamle claimen/i);
});

test("ME is present in Personal Intelligence navigation", () => {
  assert.match(layout, /href="\/personal-intelligence\/me"/);
});
