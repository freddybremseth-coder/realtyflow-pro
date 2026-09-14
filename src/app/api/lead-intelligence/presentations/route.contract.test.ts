import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const source = fs.readFileSync(
  path.join(process.cwd(), "src/app/api/lead-intelligence/presentations/route.ts"),
  "utf8",
);

test("manual presentation creation validates final shortlist review before persistence", () => {
  assert.match(source, /validateManualPresentationReviewContext/);
  assert.match(source, /Buyer Profile must be approved and linked to a CRM customer/);
  assert.match(source, /Customer email is required before a presentation can enter final review/);
  assert.match(source, /Shortlist does not belong to the approved Buyer Profile/);
  assert.match(source, /reviewStates\.some\(\(status\) => status === "needs_review"\)/);
  assert.match(source, /clientReadyCount < 1/);
  assert.match(source, /Every shortlist candidate must have a final review decision and at least one must be client-ready/);
});

test("presentation draft and Approval Center work item are created in the same transaction", () => {
  assert.match(source, /withLeadIntelligenceTransaction\(parsed\.data\.brand, async \(client\) =>/);
  assert.match(source, /saveLeadCustomerPresentationDraft/);
  assert.match(source, /ensureManualPresentationReviewWorkItem/);
  assert.match(source, /return \{ draft, review \}/);
});

test("review handoff is idempotent across source id and presentation id", () => {
  assert.match(source, /presentation-review:\$\{input\.presentationId\}/);
  assert.match(source, /pg_advisory_xact_lock\(hashtext\(\$1\)\)/);
  assert.match(source, /metadata->>'presentation_id' = \$2/);
  assert.match(source, /alreadyQueued: true/);
  assert.match(source, /LeadIntelligenceError\("INVALID_REQUEST", "An existing final-review work item points to different presentation dependencies", 409\)/);
});

test("queued review work is visible to final review but never pre-authorizes customer sending", () => {
  assert.match(source, /status, priority, due_date, brand_id, source_type, source_id/);
  assert.match(source, /'REVIEW', 'HIGH'/);
  assert.match(source, /presentation_review_required: true/);
  assert.match(source, /shortlist_human_review_complete: true/);
  assert.match(source, /presentation_customer_send_allowed: false/);
  assert.match(source, /property_recommendation_auto_send_authorized: false/);
  assert.match(source, /send_preflight_ready: false/);
  assert.match(source, /explicitApprovalRequired: true/);
  assert.match(source, /automaticSendAuthorized: false/);
  assert.doesNotMatch(source, /sendBrandEmail|sendMail|email\.send/);
  assert.doesNotMatch(source, /explicitApproval:\s*true/);
});

test("presentation response returns direct review and Approval Center destinations", () => {
  assert.match(source, /\/nexus-os\/presentation-review\?workItemId=/);
  assert.match(source, /approvalCenterHref: "\/approvals"/);
  assert.match(source, /reviewQueued: true/);
});
