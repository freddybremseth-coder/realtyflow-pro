import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const page = fs.readFileSync(path.join(process.cwd(), "src/app/(content)/marketing-canary-facebook/page.tsx"), "utf8");
const route = fs.readFileSync(path.join(process.cwd(), "src/app/api/marketing/campaign-draft/route.ts"), "utf8");
const preflightRoute = fs.readFileSync(path.join(process.cwd(), "src/app/api/marketing/preflight/route.ts"), "utf8");
const creative = fs.readFileSync(path.join(process.cwd(), "src/lib/marketing/autonomous/creative.ts"), "utf8");
const inventory = fs.readFileSync(path.join(process.cwd(), "src/services/marketing/inventory-property-adapter.ts"), "utf8");

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
  assert.match(page, /border: "1px solid #9ca3af", background: "#ffffff", color: "#111827"/);
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
  const create = route.indexOf("await createCampaignDraft");
  assert.ok(guard >= 0 && create > guard, "manual-review live-channel guard must execute before campaign creation");
});

test("Canary automatically retries AI drafts rejected only by the novelty gate", () => {
  assert.match(route, /MAX_MANUAL_REVIEW_NOVELTY_ATTEMPTS = 3/);
  assert.match(route, /item\.state === "regenerate"/);
  assert.match(route, /noveltyRetryMasterIdea/);
  assert.match(route, /Drømmer du om et hjem i solen/);
});

test("Canary preserves fail-closed semantics after novelty retries are exhausted", () => {
  assert.match(route, /NOVELTY_REGENERATION_EXHAUSTED/);
  assert.match(route, /unexpected\.error/);
  assert.match(route, /state=\$\{unexpected\.state\}/);
  assert.match(route, /propertyRef: unexpected\.propertyRef/);
});

test("Inventory-generated assets put property identity into the novelty genome", () => {
  assert.match(creative, /propertyId: req\.propertyIds\[0\]/);
  assert.match(creative, /propertyType: genomeValue\(propertyType\)/);
  assert.match(creative, /CREATIVE_PROMPT_VERSION = "cg-1\.8"/);
});

test("automatic Inventory selection rotates away from recently attempted property drafts", () => {
  assert.match(inventory, /RECENT_SELECTION_ATTEMPT_HOURS = 24/);
  assert.match(inventory, /from\("marketing_assets"\)/);
  assert.match(inventory, /property_ids, genome, created_at/);
  assert.match(inventory, /recentlyUsedPropertyIds/);
  assert.match(inventory, /not_recently_used/);
});

test("broad Costa regions are not accepted as a concrete town and source text is used as fallback", () => {
  assert.match(inventory, /north\|south\|nord\|sør\|norte\|sur/);
  assert.match(inventory, /deriveSpecificLocationFromDescription\(row\.description\)/);
  assert.match(preflightRoute, /deriveSpecificLocationFromDescription\(property\.description\)/);
});

test("property prompt forbids unsupported property-specific filler claims", () => {
  assert.match(creative, /ALLE boligspesifikke fakta og egenskaper/);
  assert.match(creative, /nærhet til strand/);
  assert.match(creative, /lokale fasiliteter/);
});
