import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const route = fs.readFileSync(
  path.join(process.cwd(), "src/app/api/workspaces/[brandKey]/nexus-insights/route.ts"),
  "utf8",
);
const panel = fs.readFileSync(
  path.join(process.cwd(), "src/components/workspaces/nexus-insights-panel.tsx"),
  "utf8",
);

test("Nexus Insights requires exact workspace nexus.read permission", () => {
  assert.match(route, /requireBrandWorkspace\(request, params\.brandKey, "nexus\.read"\)/);
  assert.match(route, /\.eq\("brand_id", brandKey\)/);
  assert.match(route, /\.like\("scope"/);
});

test("Nexus Insights is a GET-only read surface", () => {
  assert.match(route, /export async function GET/);
  assert.doesNotMatch(route, /export async function (POST|PUT|PATCH|DELETE)/);
  assert.doesNotMatch(panel, /method:\s*"(POST|PUT|PATCH|DELETE)"/);
});

test("Nexus Insights does not read runtime, autonomy, approvals or customer identity", () => {
  assert.doesNotMatch(route, /\.from\("nexus_runtime_controls"\)/);
  assert.doesNotMatch(route, /\.from\("nexus_autonomy_policies"\)/);
  assert.doesNotMatch(route, /\.from\("agentic_approvals"\)/);
  assert.doesNotMatch(route, /\.from\("contacts"\)/);
  assert.doesNotMatch(route, /\.from\("nexus_business_opportunities"\)/);
});

test("Nexus Insights hides raw source payload and identifiers", () => {
  assert.match(route, /marketing_source_queue/);
  assert.doesNotMatch(route, /\.select\("[^"]*(payload|source_id|source_url)[^"]*"\)/);
  assert.match(route, /readOnly: true/);
  assert.match(route, /execution_actions/);
});
