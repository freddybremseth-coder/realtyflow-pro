import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const source = fs.readFileSync(path.join(process.cwd(), "src/app/api/customers/[contactId]/sales-assistant-note/route.ts"), "utf8");

test("sales assistant note route requires customer write access", () => {
  assert.match(source, /getRequestAccessContext/);
  assert.match(source, /customers\.write/);
});

test("original note is preserved and AI output becomes an internal timeline interaction", () => {
  assert.match(source, /original_note: body\.data\.note/);
  assert.match(source, /polished_note: analysis\.polishedNote/);
  assert.match(source, /direction: "internal"/);
  assert.match(source, /no_customer_contact: true/);
});

test("follow-up requires at least 90 percent confidence", () => {
  assert.match(source, /analysis\.followupConfidence >= 0\.9/);
  assert.match(source, /updates\.next_followup = followupAt/);
});

test("Buyer Profile evidence is source-verified and remains human-review first", () => {
  assert.match(source, /verifiedBuyerCriteria\(analysis, body\.data\.note\)/);
  assert.match(source, /buyer_profile_evidence_candidates/);
  assert.match(source, /buyer_profile_evidence_conflicts/);
  assert.match(source, /buyer_profile_evidence_brand/);
  assert.match(source, /reviewRecommended/);
  assert.match(source, /persisted: false as const/);
  assert.match(source, /buyerProfileEvidencePersisted: false/);
  assert.match(source, /hardBuyerProfileFactsChanged: false/);
});

test("Buyer Profile evidence compares against current approved profile and surfaces conflicts instead of overwriting", () => {
  assert.match(source, /from\("buyer_profiles"\)/);
  assert.match(source, /from\("buyer_profile_criteria"\)/);
  assert.match(source, /alreadyKnownCount/);
  assert.match(source, /existingValues/);
  assert.match(source, /Ny kundedokumentert verdi avviker fra aktiv Buyer Profile/);
});

test("real-estate brand is validated before inline Buyer Profile review is offered", () => {
  assert.match(source, /isLeadIntelligenceRealEstateBrand\(contactBrand\)/);
  assert.match(source, /const evidenceBrand/);
  assert.match(source, /reviewRecommended = Boolean\(evidenceBrand && candidates\.length > 0\)/);
});

test("explicit follow-up creates a CRM work item with the conversation brief for Nexus Today", () => {
  assert.match(source, /from\("work_items"\)/);
  assert.match(source, /source: "crm-sales-assistant"/);
  assert.match(source, /next_action: followupBrief/);
  assert.match(source, /due_date: followupAt\.slice\(0, 10\)/);
  assert.match(source, /followup_brief: followupBrief/);
  assert.match(source, /status: "CANCELLED"/);
  assert.match(source, /Erstattet av nyere CRM salgsassistent-oppfølging/);
});

test("calendar is best effort after CRM persistence and Nexus work item persistence", () => {
  const saveIndex = source.indexOf('from("contacts").update(updates)');
  const workItemIndex = source.indexOf('from("work_items").insert');
  const calendarIndex = source.indexOf("calendar = await createGoogleFollowupEvent");
  assert.ok(saveIndex > 0);
  assert.ok(workItemIndex > saveIndex);
  assert.ok(calendarIndex > workItemIndex);
});

test("route does not change pipeline, approve criteria or send customer communication", () => {
  assert.doesNotMatch(source, /pipeline_status\s*:/);
  assert.doesNotMatch(source, /sendEmail|sendMail|email\.send/);
  assert.doesNotMatch(source, /approval_status:\s*["']approved["']/);
  assert.match(source, /pipelineChanged: false/);
  assert.match(source, /customerContactSent: false/);
});
