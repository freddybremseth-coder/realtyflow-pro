import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const source = readFileSync(path.resolve(process.cwd(), "src/app/api/nexus/profile-activation-priority/evidence-draft/review/route.ts"), "utf8");

test("draft review route revalidates profile contact brand stage and suppression transactionally", () => {
  assert.match(source, /withLeadIntelligenceTransaction\(parsed\.data\.brand/);
  assert.match(source, /for update/);
  assert.match(source, /profile\.status !== "draft"/);
  assert.match(source, /contactBrand !== parsed\.data\.brand/);
  assert.match(source, /ACTIVE_STAGES/);
  assert.match(source, /do_not_contact/);
  assert.match(source, /email_suppressed/);
});

test("draft review route only accepts explicit approve reject decisions", () => {
  assert.match(source, /z\.enum\(\["approve", "reject"\]\)/);
  assert.match(source, /Duplicate criterion decisions are not allowed/);
  assert.match(source, /Only pending or edited criteria can be reviewed/);
  assert.match(source, /approval_status = 'approved'/);
  assert.match(source, /approval_status = 'rejected'/);
});

test("draft promotion requires canonical completeness policy and has no downstream execution", () => {
  assert.match(source, /decideBuyerProfileDraftPromotion/);
  assert.match(source, /if \(promotion\.canPromote\)/);
  assert.match(source, /set status = 'approved'/);
  assert.match(source, /matchingTriggered: false/);
  assert.match(source, /shortlistCreated: false/);
  assert.match(source, /propertyDeliveryTriggered: false/);
  assert.match(source, /crmUpdated: false/);
  assert.match(source, /pipelineUpdated: false/);
  assert.match(source, /emailSent: false/);
  assert.match(source, /externalActionExecuted: false/);
});
