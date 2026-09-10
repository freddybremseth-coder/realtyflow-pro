import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const page = fs.readFileSync(path.join(process.cwd(), "src/app/(content)/marketing-canary-facebook/page.tsx"), "utf8");
const route = fs.readFileSync(path.join(process.cwd(), "src/app/api/marketing/campaign-draft/route.ts"), "utf8");

test("ZenEco Facebook Canary locks the draft to the property selected by preflight", () => {
  assert.match(page, /const propertyId = preflight\?\.inventoryProperty\?\.id/);
  assert.match(page, /propertyId,/);
  assert.match(page, /first\.propertyId !== propertyId/);
});

test("ZenEco Facebook Canary explicitly requests a manual-review-only draft", () => {
  assert.match(page, /forceManualReview: true/);
  assert.match(page, /first\.mode !== "manual-review"/);
});

test("ZenEco Facebook Canary keeps readable foregrounds on light card surfaces", () => {
  assert.match(page, /const box: React\.CSSProperties = \{[^\n]*background: "#ffffff"[^\n]*color: "#111827"/);
  assert.match(page, /const pre: React\.CSSProperties = \{[^\n]*background: "#f8fafc"[^\n]*color: "#111827"/);
  assert.match(page, /<textarea[^>]*background: "#ffffff", color: "#111827"/);
  assert.match(page, /color: enabled \? "#ffffff" : "#374151"/);
});

test("campaign draft route rejects manual-review requests for channels already enabled in controlled-auto", () => {
  assert.match(route, /body\.forceManualReview === true/);
  assert.match(route, /marketing_brand_growth_plans/);
  assert.match(route, /configuredAutopilotChannels/);
  assert.match(route, /MANUAL_REVIEW_CHANNEL_ALREADY_LIVE/);
  assert.match(route, /channelAlreadyLive/);
});

test("manual-review contract is checked before createCampaignDraft is invoked", () => {
  const guard = route.indexOf("MANUAL_REVIEW_CHANNEL_ALREADY_LIVE");
  const create = route.indexOf("const res = await createCampaignDraft");
  assert.ok(guard >= 0 && create > guard, "manual-review live-channel guard must execute before campaign creation");
});
