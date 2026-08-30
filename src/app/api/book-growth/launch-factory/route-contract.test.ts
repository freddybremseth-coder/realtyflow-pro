import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const route = fs.readFileSync(new URL("./route.ts", import.meta.url), "utf8");
test("launch factory is admin-only and requires exact approved package assets", () => {
  assert.match(route, /requireAdminApi\(request\)/g);
  assert.match(route, /new Set\(exactPackages\.map/);
  assert.match(route, /asset_type === "epub"/);
  assert.match(route, /asset_type === "cover"/);
  assert.match(route, /proposeBookLaunch/);
});
test("generation and one approval never activate marketing", () => {
  assert.match(route, /publishing_stage_launch_campaign/);
  assert.match(route, /publishing_decide_launch_campaign/);
  assert.doesNotMatch(route, /createCampaignDraft/);
  assert.doesNotMatch(route, /runApprovedPublication/);
  assert.doesNotMatch(route, /marketing_publications/);
});
