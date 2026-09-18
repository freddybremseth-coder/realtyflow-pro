import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const worker = fs.readFileSync(new URL("./history-backfill-worker.ts", import.meta.url), "utf8");
const safeResolver = fs.readFileSync(new URL("./apply-inbound-crm-actions-safe.ts", import.meta.url), "utf8");
const cron = fs.readFileSync(new URL("../../app/api/cron/email-history-backfill/route.ts", import.meta.url), "utf8");
const vercel = fs.readFileSync(new URL("../../../vercel.json", import.meta.url), "utf8");

test("history worker advances with existing Message-IDs and never sends email", () => {
  assert.match(worker, /fetchHistoricalMailboxBatch/);
  assert.match(worker, /existingMessageIds/);
  assert.match(worker, /is_archived:\s*true/);
  assert.match(worker, /crm_contact_id:\s*contactId/);
  assert.doesNotMatch(worker, /sendEmail|smtp|transporter\.send/);
});

test("historical CRM linking requires exactly one contact candidate", () => {
  assert.match(worker, /ids\.length === 1/);
  assert.match(worker, /candidates\.size === 1/);
  assert.match(safeResolver, /rows\.length === 1/);
  assert.match(safeResolver, /brand_id/);
});

test("backfill cron is scheduler-protected and scheduled", () => {
  assert.match(cron, /requireNexusSchedulerApi/);
  assert.match(cron, /evaluateCronSafeMode/);
  assert.match(cron, /exact_unique_crm_linking_only:\s*true/);
  assert.match(vercel, /\/api\/cron\/email-history-backfill/);
});


test("history backfill defers transient storage contention instead of aborting the batch", () => {
  assert.match(worker, /isStorageContentionError/);
  assert.match(worker, /statement timeout\\|lock timeout/);
  assert.match(worker, /History contention reconcile failed/);
  assert.match(worker, /history_storage_retry/);
  assert.match(worker, /storage_deferred/);
});

test("non-contention history insert failures still fail closed", () => {
  assert.match(worker, /History message insert failed/);
});
