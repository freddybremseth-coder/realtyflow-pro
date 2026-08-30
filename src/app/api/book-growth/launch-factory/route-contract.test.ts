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
test("generation, approval and calendar activation never activate marketing", () => {
  assert.match(route, /publishing_stage_launch_campaign/);
  assert.match(route, /publishing_decide_launch_campaign/);
  assert.match(route, /publishing_activate_launch_campaign/);
  assert.match(route, /action: z\.literal\("activate"\)/);
  assert.match(route, /p_start_date: parsed\.data\.startDate/);
  assert.match(route, /p_timezone: parsed\.data\.timezone/);
  assert.doesNotMatch(route, /createCampaignDraft/);
  assert.doesNotMatch(route, /runApprovedPublication/);
  assert.doesNotMatch(route, /marketing_publications/);
});

test("launch factory exposes traceable internal calendar state", () => {
  assert.match(route, /publishing_launch_activations/);
  assert.match(route, /publishing_launch_calendar_items/);
  assert.match(route, /activeCalendars/);
  assert.match(route, /draftItems/);
  assert.match(route, /calendar_review/);
  assert.match(route, /publishing_launch_calendar_item_versions/);
  assert.match(route, /publishing_launch_calendar_item_decisions/);
  assert.match(route, /publishing_edit_launch_calendar_item/);
  assert.match(route, /publishing_decide_launch_calendar_item/);
  assert.match(route, /publishing_launch_channel_handoffs/);
  assert.match(route, /publishing_prepare_launch_channel_handoff/);
  assert.match(route, /publishing_decide_launch_channel_handoff/);
  assert.match(route, /action: z\.literal\("prepare_handoff"\)/);
  assert.match(route, /decision: z\.enum\(\["queue", "withdraw"\]\)/);
  assert.doesNotMatch(route, /\.from\("marketing_publications"\)/);
  assert.doesNotMatch(route, /\.from\("content_publications"\)/);
});
