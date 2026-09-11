import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const source = fs.readFileSync(
  path.join(process.cwd(), "src/app/api/cron/nexus-presentation-prep/route.ts"),
  "utf8",
);
const vercel = fs.readFileSync(path.join(process.cwd(), "vercel.json"), "utf8");

test("presentation autopilot only advances after explicit client-ready review", () => {
  assert.match(source, /quality_review_status/);
  assert.match(source, /client_ready/);
  assert.match(source, /clientReadyCount === 0/);
  assert.match(source, /waitingForReview/);
});

test("presentation autopilot creates draft-only output and never sends to customer", () => {
  assert.match(source, /saveLeadCustomerPresentationDraft/);
  assert.match(source, /presentation_review_required:\s*true/);
  assert.match(source, /presentation_customer_send_allowed:\s*false/);
  assert.match(source, /customer_send:\s*false/);
  assert.match(source, /presentation_publish:\s*false/);
  assert.doesNotMatch(source, /sendMail\s*\(/);
  assert.doesNotMatch(source, /sendEmail\s*\(/);
  assert.doesNotMatch(source, /smtp/i);
});

test("presentation prep is scheduled after shortlist preparation", () => {
  const shortlist = vercel.indexOf('"/api/cron/nexus-shortlist-prep"');
  const presentation = vercel.indexOf('"/api/cron/nexus-presentation-prep"');
  assert.ok(shortlist >= 0 && presentation > shortlist);
  assert.match(vercel, /nexus-shortlist-prep[^\n]+5-59\/5/);
  assert.match(vercel, /nexus-presentation-prep[^\n]+6-59\/5/);
});
