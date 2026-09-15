import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const route = fs.readFileSync(
  path.join(process.cwd(), "src/app/api/nexus/marketing-actions/route.ts"),
  "utf8",
);
const manualReview = fs.readFileSync(
  path.join(process.cwd(), "src/services/marketing/manual-review-campaign.ts"),
  "utf8",
);

test("Nexus marketing executor re-verifies deterministic proposal server-side", () => {
  assert.match(route, /requireAdminApi/);
  assert.match(route, /buildNexusMarketingActionProposals\(\{ message: requestText \}\)/);
  assert.match(route, /verified\.id !== proposalId/);
  assert.match(route, /verified\.brandId !== brandId/);
  assert.match(route, /verified\.focus !== focus/);
  assert.match(route, /sameChannels\(verified\.channels, channels\)/);
});

test("Nexus marketing executor is idempotent per proposal and reuses existing campaign", () => {
  assert.match(route, /mrun_nexus_/);
  assert.match(route, /existingCampaign\(supabase, marketingRunId\)/);
  assert.match(route, /marketing_publications/);
  assert.match(route, /agentic_approvals/);
  assert.match(route, /i stedet for å lage duplikater/);
});

test("illustrative property is selected dynamically and never asserted as focus-place property", () => {
  assert.match(route, /property_brand_visibility/);
  assert.match(route, /model_name/);
  assert.match(route, /illustrasjon av moderne boligdesign/);
  assert.match(route, /ikke skriv eller antyd at denne konkrete boligen ligger i/);
  assert.match(route, /Ikke påstå at en konkret modell kan bygges på en bestemt tomt/);
  assert.match(route, /regulering, teknisk vurdering og nødvendige tillatelser/);
  assert.doesNotMatch(route, /N9950|Alma/);
});

test("chat marketing execution forces manual review and exposes no direct publisher", () => {
  assert.match(route, /createManualReviewCampaignDraft/);
  assert.match(route, /manualReviewForced: true/);
  assert.match(route, /publishedByThisAction: false/);
  assert.match(manualReview, /autonomy_mode: "copilot"/);
  assert.match(manualReview, /autopilot_channels: \[\]/);
  assert.doesNotMatch(route, /runApprovedPublication|makeConfiguredMetaPublisher|publish\(/);
});

test("successful action ends in Approval Center and explicitly says nothing is published", () => {
  assert.match(route, /state: "waiting_approval"/);
  assert.match(route, /href: "\/approvals"/);
  assert.match(route, /Ingenting er publisert/);
  assert.match(route, /approvalResults/);
});
