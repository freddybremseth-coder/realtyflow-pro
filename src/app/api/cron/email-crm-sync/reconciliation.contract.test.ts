import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const route = fs.readFileSync(path.join(process.cwd(), "src/app/api/cron/email-crm-sync/route.ts"), "utf8");
const service = fs.readFileSync(path.join(process.cwd(), "src/services/email/inbound-reply-reconciliation.ts"), "utf8");

test("historical reconciliation is bounded and only scans processed recent inbound mail", () => {
  assert.match(route, /RECONCILIATION_AGE_DAYS = 30/);
  assert.match(route, /RECONCILIATION_SCAN_LIMIT = 250/);
  assert.match(route, /RECONCILIATION_APPLY_LIMIT = 20/);
  assert.match(route, /eq\("direction", "inbound"\)/);
  assert.match(route, /not\("crm_processed_at", "is", null\)/);
  assert.match(route, /reconcileInboundReplies/);
});

test("reconciliation reuses canonical latest reply parser and CRM writer", () => {
  assert.match(service, /extractLatestReplyText/);
  assert.match(service, /classifyInboundReply/);
  assert.match(service, /classifyInboundMailSource/);
  assert.match(service, /applyInboundCrmActions/);
});

test("only explicit terminal intents are reconciliation eligible", () => {
  assert.match(service, /"do_not_contact"/);
  assert.match(service, /"purchased_elsewhere"/);
  assert.match(service, /"no_longer_buying"/);
  assert.match(service, /TERMINAL_INTENTS\.has\(classification\.intent\)/);
  assert.match(service, /seenSenders/);
});

test("route reports reconciliation separately and never performs raw body-pattern repair", () => {
  assert.match(route, /reconciliation:/);
  for (const source of [route, service]) {
    assert.doesNotMatch(source, /~\*/);
    assert.doesNotMatch(source, /regexp_matches|regexp_replace|regexp_like/i);
    assert.doesNotMatch(source, /body_text[^\n]{0,80}\.ilike/i);
  }
});
