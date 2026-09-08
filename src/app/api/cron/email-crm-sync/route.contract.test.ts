import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const source = fs.readFileSync(path.join(process.cwd(), "src/app/api/cron/email-crm-sync/route.ts"), "utf8");

test("CRM sync analyzes every recent unprocessed inbound message without depending on reply-draft readiness", () => {
  assert.match(source, /\.eq\("direction", "inbound"\)/);
  assert.match(source, /\.is\("crm_processed_at", null\)/);
  assert.match(source, /\.gte\("received_at", automaticCutoff\)/);
  assert.doesNotMatch(source, /\.eq\("has_draft_reply", true\)/);
});

test("CRM sync still filters non-customer mail and sends customer mail through inbound CRM actions", () => {
  assert.match(source, /classifyInboundMailSource/);
  assert.match(source, /kind !== "customer"/);
  assert.match(source, /applyInboundCrmActions/);
  assert.match(source, /crm_reply_classification: action\.classification/);
  assert.match(source, /crm_processed_at: processedAt/);
});
