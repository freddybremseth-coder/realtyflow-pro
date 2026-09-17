import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const admission = fs.readFileSync(new URL("./customer-mail-admission.ts", import.meta.url), "utf8");
const ingest = fs.readFileSync(new URL("../../app/api/cron/email-ingest/route.ts", import.meta.url), "utf8");
const history = fs.readFileSync(new URL("./history-backfill-worker.ts", import.meta.url), "utf8");

test("customer admission fails closed for non-customer and unknown identities", () => {
  assert.match(admission, /kind !== "customer"/);
  assert.match(admission, /internal_same_domain/);
  assert.match(admission, /duplicate_brand_contact_email/);
  assert.match(admission, /unknown_sender_candidate/);
  assert.match(admission, /vendor_outreach/);
});

test("exact customer and customer-thread evidence can pass admission", () => {
  assert.match(admission, /exact_brand_contact/);
  assert.match(admission, /resolved_customer_thread/);
  assert.match(admission, /outbound_exact_brand_contact/);
});

test("non-customer decisions are quarantined instead of becoming CRM messages", () => {
  assert.match(admission, /email_admission_queue/);
  assert.match(admission, /admission_status/);
  assert.match(admission, /keepBody = input\.decision\.status === "review"/);
});

test("live ingest gates every new message before email_messages insert", () => {
  const decisionIndex = ingest.indexOf("decideCustomerMailAdmission");
  const insertIndex = ingest.indexOf('.from("email_messages").insert');
  assert.ok(decisionIndex >= 0);
  assert.ok(insertIndex > decisionIndex);
  assert.match(ingest, /decision\.status !== "accept"/);
  assert.match(ingest, /recordCustomerMailAdmission/);
  assert.match(ingest, /total_filtered/);
  assert.match(ingest, /total_review/);
});

test("history backfill uses the same customer admission boundary", () => {
  assert.match(history, /decideCustomerMailAdmission/);
  assert.match(history, /recordCustomerMailAdmission/);
  assert.match(history, /total_filtered/);
  assert.match(history, /total_review/);
  assert.match(history, /loadCustomerMailAdmissionIds/);
});
