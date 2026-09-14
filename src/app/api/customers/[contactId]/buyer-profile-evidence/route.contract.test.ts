import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const source = fs.readFileSync(path.join(process.cwd(), "src/app/api/customers/[contactId]/buyer-profile-evidence/route.ts"), "utf8");

test("inline Buyer Profile approval requires CRM write access and a validated real-estate brand", () => {
  assert.match(source, /getRequestAccessContext/);
  assert.match(source, /customers\.write/);
  assert.match(source, /LeadIntelligenceRealEstateBrandSchema/);
  assert.match(source, /crm-buyer-profile-evidence-review/);
});

test("server only accepts criteria previously stored on the source CRM interaction", () => {
  assert.match(source, /buyer_profile_evidence_candidates/);
  assert.match(source, /sourceInteraction/);
  assert.match(source, /criterionSignature/);
  assert.match(source, /UNVERIFIED_CRITERION/);
  assert.match(source, /buyer_profile_evidence_brand/);
});

test("approved evidence creates a versioned approved Buyer Profile and preserves unrelated criteria", () => {
  assert.match(source, /withLeadIntelligenceTransaction/);
  assert.match(source, /insert into public\.buyer_profiles/);
  assert.match(source, /status in \('approved', 'draft'\)/);
  assert.match(source, /insert into public\.buyer_profile_criteria/);
  assert.match(source, /approval_status = 'approved'/);
  assert.match(source, /status = 'superseded'/);
});

test("selected criterion slots replace old values rather than creating contradictory duplicates", () => {
  assert.match(source, /delete from public\.buyer_profile_criteria/);
  assert.match(source, /coalesce\(other_key, ''\) = \$3/);
  assert.match(source, /customer_confirmed/);
  assert.match(source, /'customer_confirmed'/);
});

test("explicit selected budget may update Buyer Profile but pipeline value is never used as inferred budget", () => {
  assert.match(source, /selectedBudget/);
  assert.doesNotMatch(source, /pipeline_value/);
});

test("route has no customer communication, pipeline transition, shortlist or automatic matching side effect", () => {
  assert.match(source, /itemLevelHumanApproval: true/);
  assert.match(source, /sourceInteractionVerified: true/);
  assert.match(source, /customerContactSent: false/);
  assert.match(source, /pipelineChanged: false/);
  assert.match(source, /matchingTriggered: false/);
  assert.match(source, /shortlistCreated: false/);
  assert.doesNotMatch(source, /sendEmail|sendMail|email\.send/);
});
