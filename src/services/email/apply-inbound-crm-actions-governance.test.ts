import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const source = fs.readFileSync(path.join(process.cwd(), "src/services/email/apply-inbound-crm-actions.ts"), "utf8");

test("inbound CRM writer uses governed Reply Intelligence", () => {
  assert.match(source, /classifyInboundReply/);
  assert.match(source, /governInboundReply/);
  assert.match(source, /governance\.safety\.tier/);
});

test("explicit DNC is persisted as permanent stopped nurture", () => {
  assert.match(source, /classification\.intent === "do_not_contact"/);
  assert.match(source, /update\.do_not_contact = true/);
  assert.match(source, /update\.email_suppressed = true/);
  assert.match(source, /update\.nurture_status = "stopped"/);
});

test("purchased elsewhere does not auto-mutate terminal pipeline stage", () => {
  const purchasedBranch = source.split('classification.intent === "purchased_elsewhere"')[1]?.split('} else if')[0] || "";
  assert.doesNotMatch(purchasedBranch, /update\.pipeline_status\s*=\s*"LOST"/);
  assert.match(source, /purchased-outcome-review/);
  assert.match(source, /Bekreft LOST/);
});

test("work items use source-based idempotency lookup", () => {
  assert.match(source, /\.eq\("source_type", "crm"\)/);
  assert.match(source, /\.eq\("source_id", input\.sourceId\)/);
});

test("interaction history deduplicates the same inbound message", () => {
  assert.match(source, /interactionId = `email-reply-\$\{params\.emailMessageId\}`/);
  assert.match(source, /dedupedInteractions/);
});
