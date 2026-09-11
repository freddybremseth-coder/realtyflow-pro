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

test("final review approves canonical parent records but never sends customer communication", () => {
  assert.match(source, /lead_property_shortlists/);
  assert.match(source, /lead_customer_presentations/);
  assert.match(source, /lead_customer_message_drafts/);
  assert.match(source, /status: "approved"/);
  assert.match(source, /presentation_customer_send_allowed: false/);
  assert.match(source, /presentation_send_preflight_required: true/);
  assert.match(source, /customerMessageSent: false/);
  assert.doesNotMatch(source, /sendBrandEmail/);
  assert.doesNotMatch(source, /sendEmail\(/);
});

test("focused review UI tells Freddy that approval does not send", () => {
  assert.match(page, /Godkjenn sluttresultat – sender ikke/);
  assert.match(page, /Ingen automatisk utsending/);
  assert.match(page, /send-preflight/);
  assert.match(page, /\/api\/nexus\/presentation-reviews/);
});
