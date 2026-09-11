import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const source = fs.readFileSync(
  path.join(process.cwd(), "src/app/api/cron/nexus-shortlist-prep/route.ts"),
  "utf8",
);
const vercel = fs.readFileSync(path.join(process.cwd(), "vercel.json"), "utf8");

test("Nexus shortlist prep only runs after prepared property matches and approved Buyer Profile", () => {
  assert.match(source, /metadata\.property_match_prepared_at/);
  assert.match(source, /property_match_count/);
  assert.match(source, /metadata\.shortlist_prepared_at/);
  assert.match(source, /buyerProfileStatus !== "APPROVED"/);
  assert.match(source, /isLeadIntelligenceRealEstateBrand\(brandId\)/);
});

test("Nexus shortlist prep revalidates canonical matching and location guard before persistence", () => {
  assert.match(source, /loadApprovedLeadMatchProfileWithDb/);
  assert.match(source, /previewLeadPropertyMatchesForProfile/);
  assert.match(source, /applyLeadPropertyLocationGuard/);
  assert.match(source, /match\.eligibility !== "rejected"/);
  assert.match(source, /\.slice\(0, 4\)/);
  assert.match(source, /saveLeadPropertyShortlistDraft/);
});

test("automatic shortlist remains a review-only draft and never becomes customer-ready", () => {
  assert.match(source, /decision: "maybe"/);
  assert.match(source, /status: "needs_review"/);
  assert.match(source, /shortlist_review_required: true/);
  assert.match(source, /ingenting sendes til kunden før review/);
  assert.match(source, /customer_send: false/);
  assert.doesNotMatch(source, /status: "client_ready"/);
  assert.doesNotMatch(source, /sendEmail|nodemailer|smtp|\/api\/email\/send/i);
});

test("automatic shortlist creation is idempotent per CRM work item", () => {
  assert.match(source, /idempotencySeed: `nexus-work:\$\{row\.id\}`/);
  assert.match(source, /DRAFT_ALREADY_EXISTS/);
  assert.match(source, /shortlist_prepared_at/);
});

test("Nexus shortlist prep is scheduled after property matching", () => {
  const match = vercel.indexOf('"/api/cron/nexus-property-match-prep"');
  const shortlist = vercel.indexOf('"/api/cron/nexus-shortlist-prep"');
  assert.ok(match >= 0 && shortlist > match);
  assert.match(vercel, /nexus-property-match-prep[^\n]+4-59\/5/);
  assert.match(vercel, /nexus-shortlist-prep[^\n]+5-59\/5/);
});
