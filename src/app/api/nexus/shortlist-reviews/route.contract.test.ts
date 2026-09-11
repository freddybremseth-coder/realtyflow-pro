import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const route = fs.readFileSync(
  path.join(process.cwd(), "src/app/api/nexus/shortlist-reviews/route.ts"),
  "utf8",
);
const page = fs.readFileSync(
  path.join(process.cwd(), "src/app/(content)/nexus-os/shortlist-review/page.tsx"),
  "utf8",
);

test("shortlist review API only exposes CRM work explicitly awaiting human review", () => {
  assert.match(route, /requireAdminApi\(request\)/);
  assert.match(route, /metadata->>shortlist_review_required/);
  assert.match(route, /source_type", "crm/);
  assert.match(route, /reviewHref: `\/nexus-os\/shortlist-review\?workItemId=/);
});

test("shortlist review validates candidate ownership and requires one decision for every candidate", () => {
  assert.match(route, /allowedIds/);
  assert.match(route, /submittedIds\.size !== normalized\.length/);
  assert.match(route, /submittedIds\.size !== allowedIds\.size/);
  assert.match(route, /REVIEW_STATUSES/);
  assert.match(route, /quality_review_status/);
  assert.match(route, /quality_review_checked_by: context\.email/);
});

test("shortlist review only resumes presentation autopilot after human review is complete", () => {
  assert.match(route, /const reviewComplete = unresolvedCount === 0/);
  assert.match(route, /shortlist_human_review_complete: reviewComplete/);
  assert.match(route, /presentationWillPrepareAutomatically = reviewComplete && clientReadyCount > 0/);
  assert.match(route, /customerMessageSent: false/);
  assert.match(route, /presentationPublished: false/);
  assert.doesNotMatch(route, /sendMail\s*\(/);
  assert.doesNotMatch(route, /sendEmail\s*\(/);
});

test("focused shortlist review page exposes the minimum human decisions", () => {
  assert.match(page, /Klar for kunde/);
  assert.match(page, /Bekreft pris\/tilgjengelighet/);
  assert.match(page, /Spør megler\/utbygger/);
  assert.match(page, /Må vurderes mer/);
  assert.match(page, /Avvis/);
  assert.match(page, /Lagre review og fortsett/);
  assert.match(page, /Nexus kan lage presentasjons- og e-postutkast/);
});
