import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync("src/app/api/nexus/presentation-reviews/route.ts", "utf8");
const page = readFileSync("src/app/(content)/nexus-os/presentation-review/page.tsx", "utf8");

test("final presentation review is admin-only and requires explicit approval", () => {
  assert.match(source, /requireAdminApi/);
  assert.match(source, /getRequestAccessContext/);
  assert.match(source, /explicitApproval !== true/);
  assert.match(source, /presentation_review_required/);
});

test("final review only advances after completed shortlist review and at least one client-ready property", () => {
  assert.match(source, /shortlist_human_review_complete !== true/);
  assert.match(source, /quality_review_status/);
  assert.match(source, /reviewStates\.some\(\(status\) => status === "needs_review"\)/);
  assert.match(source, /reviewStates\.includes\("client_ready"\)/);
});

test("final review authorizes only the governed matched-property send path", () => {
  assert.match(source, /lead_property_shortlists/);
  assert.match(source, /lead_customer_presentations/);
  assert.match(source, /lead_customer_message_drafts/);
  assert.match(source, /status: "approved"/);
  assert.match(source, /presentation_send_preflight_required: true/);
  assert.match(source, /property_recommendation_auto_send_authorized: true/);
  assert.match(source, /presentation_customer_send_allowed: false/);
  assert.match(source, /automaticSendAfterFreshPreflight: true/);
  assert.doesNotMatch(source, /sendBrandEmail/);
  assert.doesNotMatch(source, /sendEmail\(/);
});

test("focused review UI makes the automatic post-preflight send consequence explicit", () => {
  assert.match(page, /Godkjenn og autoriser utsending/);
  assert.match(page, /Automatisk først etter grønn preflight/);
  assert.match(page, /sendes boligforslagene automatisk/);
  assert.match(page, /varig send-receipt hindrer dobbeltsending/);
  assert.match(page, /\/api\/nexus\/presentation-reviews/);
});
