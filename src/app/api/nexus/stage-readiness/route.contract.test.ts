import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const routePath = path.resolve(process.cwd(), "src/app/api/nexus/stage-readiness/route.ts");
const source = readFileSync(routePath, "utf8");

test("Stage Readiness deep-links only shortlist workflow blockers into Lead Intelligence", () => {
  assert.match(source, /READY_FOR_SHORTLIST/);
  assert.match(source, /MATCHING_WITHOUT_SHORTLIST/);
  assert.match(source, /\/lead-intelligence\?buyerProfileId=/);
  assert.match(source, /\/customers\?contactId=/);
  assert.match(source, /LEAD_INTELLIGENCE_READINESS\.has\(readiness\)/);
});

test("Stage Readiness stays read-only", () => {
  assert.doesNotMatch(source, /\.from\("contacts"\)\.update/);
  assert.doesNotMatch(source, /\.from\("buyer_profiles"\)\.insert/);
  assert.doesNotMatch(source, /\.from\("lead_property_shortlists"\)\.insert/);
});
