import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const source = fs.readFileSync(
  path.join(process.cwd(), "src/services/email/inbound-buyer-profile-revision.ts"),
  "utf8",
);
const worker = fs.readFileSync(
  path.join(process.cwd(), "src/app/api/cron/nexus-buyer-profile-sync/route.ts"),
  "utf8",
);

test("automatic profile revision requires stricter explicit customer evidence", () => {
  assert.match(source, /MIN_REVISION_CONFIDENCE = 0\.92/);
  assert.match(source, /evidenceIsExplicit/);
  assert.match(source, /verified\.length !== candidates\.length/);
  assert.match(source, /partial_or_uncertain_change_set/);
});

test("automatic profile revision is restricted to concrete matching dimensions", () => {
  assert.match(source, /AUTO_REVISION_KEYS/);
  for (const key of ["location", "property_type", "total_budget", "bedrooms", "bathrooms"]) {
    assert.match(source, new RegExp(`"${key}"`));
  }
  assert.doesNotMatch(source, /AUTO_REVISION_KEYS[\s\S]{0,500}"legal_notes"/);
});

test("automatic profile revision is versioned and supersedes the old profile", () => {
  assert.match(source, /coalesce\(max\(version\), 0\)::int \+ 1/);
  assert.match(source, /status = 'superseded'/);
  assert.match(source, /status = 'approved'/);
  assert.match(source, /nexus-email-revision:/);
});

test("unaffected criteria are copied while explicit changed keys are replaced", () => {
  assert.match(source, /not \(key = any\(\$3::text\[\]\)\)/);
  assert.match(source, /'customer_confirmed'/);
  assert.match(source, /customer_confirmed,[\s\S]*'approved'/);
});

test("worker continues to matching only after safe revision and routes uncertainty to review", () => {
  assert.match(worker, /autoReviseBuyerProfileFromInboundEvidence/);
  assert.match(worker, /revision\.status === "revised"/);
  assert.match(worker, /buyer_profile_status = revision\.buyerProfileStatus/);
  assert.match(worker, /buyer_profile_auto_revised = true/);
  assert.match(worker, /ensureReviewWorkItem/);
  assert.match(worker, /buyer_profile_revision_reason = revision\.reason/);
});
