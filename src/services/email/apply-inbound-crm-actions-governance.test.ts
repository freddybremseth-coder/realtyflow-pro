import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const source = fs.readFileSync(path.join(process.cwd(), "src/services/email/apply-inbound-crm-actions.ts"), "utf8");
const cronSource = fs.readFileSync(path.join(process.cwd(), "src/app/api/cron/email-crm-sync/route.ts"), "utf8");

test("inbound CRM writer uses governed Reply Intelligence", () => {
  assert.match(source, /classifyInboundReply/);
  assert.match(source, /governInboundReply/);
  assert.match(source, /governance\.safety\.tier/);
});

test("CRM sync analyzes recent inbound mail even when no reply draft exists", () => {
  assert.match(cronSource, /\.eq\("direction", "inbound"\)/);
  assert.match(cronSource, /\.is\("crm_processed_at", null\)/);
  assert.match(cronSource, /\.gte\("received_at", automaticCutoff\)/);
  assert.doesNotMatch(cronSource, /\.eq\("has_draft_reply", true\)/);
  assert.match(cronSource, /applyInboundCrmActions/);
});

test("explicit DNC is persisted as permanent stopped nurture", () => {
  assert.match(source, /classification\.intent === "do_not_contact"/);
  assert.match(source, /update\.do_not_contact = true/);
  assert.match(source, /update\.email_suppressed = true/);
  assert.match(source, /update\.nurture_status = "stopped"/);
});

test("explicit terminal customer outcomes auto-close sales pipeline and follow-up", () => {
  assert.match(source, /isTerminalSalesOutcome/);
  assert.match(source, /terminalAutoClose/);
  assert.match(source, /update\.pipeline_status = "LOST"/);
  assert.match(source, /update\.lost_reason = lostReasonForIntent/);
  assert.match(source, /update\.next_followup = null/);
  assert.match(source, /nextPipelineStatus = "LOST"/);
  assert.match(source, /recordPipelineTransition/);
});

test("terminal outcomes cancel stale CRM and portal sales tasks instead of creating a hot lead", () => {
  assert.match(source, /closeOpenSalesWorkItems/);
  assert.match(source, /status: "CANCELLED"/);
  assert.match(source, /\.in\("source_type", \["crm", "portal"\]\)/);
  assert.match(source, /\.contains\("metadata", \{ contact_id: contactId \}\)/);
  assert.match(source, /!terminalAutoClose && classification\.intent !== "do_not_contact"/);
});

test("terminal fallback still requires review when governance does not allow AUTO", () => {
  assert.match(source, /terminal-outcome-review/);
  assert.match(source, /Bekreft terminal kundeutfall/);
});

test("work items use source-based idempotency lookup", () => {
  assert.match(source, /\.eq\("source_type", "crm"\)/);
  assert.match(source, /\.eq\("source_id", input\.sourceId\)/);
});

test("interaction history deduplicates the same inbound message", () => {
  assert.match(source, /interactionId = `email-reply-\$\{params\.emailMessageId\}`/);
  assert.match(source, /dedupedInteractions/);
});

test("hot lead SLA is persisted into work-item metadata", () => {
  assert.match(source, /decideHotLeadSla\(classification\)/);
  assert.match(source, /responseDueAt\(now, sla\.responseMinutes\)/);
  assert.match(source, /response_due_at: responseDue/);
  assert.match(source, /response_sla_minutes: sla\.responseMinutes/);
  assert.match(source, /operational_target: sla\.operationalTarget/);
});

test("hot lead routing reuses buyer profile and stage-readiness context", () => {
  assert.match(source, /from\("buyer_profiles"\)/);
  assert.match(source, /buyer_profile_id: buyerProfile\.profileId/);
  assert.match(source, /stage_readiness_href/);
  assert.match(source, /\/lead-intelligence\?buyerProfileId=/);
});
