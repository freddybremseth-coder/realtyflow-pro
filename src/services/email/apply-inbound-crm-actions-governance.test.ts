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

test("inbound reply interactions carry an explicit Nexus automation audit actor", () => {
  assert.match(source, /source: "nexus-email-crm-sync"/);
  assert.match(source, /performed_by: "Nexus Email Autopilot"/);
  assert.match(source, /actor_type: "automation"/);
});

test("explicit DNC is persisted as permanent stopped nurture and closed pipeline", () => {
  assert.match(source, /classification\.intent === "do_not_contact"/);
  assert.match(source, /update\.pipeline_status = "LOST"/);
  assert.match(source, /update\.lost_reason = "do_not_contact"/);
  assert.match(source, /update\.do_not_contact = true/);
  assert.match(source, /update\.email_suppressed = true/);
  assert.match(source, /update\.nurture_status = "stopped"/);
  assert.match(source, /email-crm-sync:do-not-contact/);
});

test("explicit DNC also cancels all open sales work", () => {
  assert.match(source, /classification\.intent === "do_not_contact"[\s\S]*closeOpenSalesWorkItems/);
  assert.match(source, /kunden har bedt om stopp \/ ingen videre kontakt/);
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

test("later replies are parked instead of becoming immediate sales follow-up", () => {
  assert.match(source, /classification\.intent === "follow_up_later"/);
  assert.match(source, /update\.pipeline_status = "ON_HOLD"/);
  assert.match(source, /update\.waiting_on = "customer"/);
  assert.match(source, /update\.waiting_reason = "Kunden har bedt om oppfølging senere\."/);
  assert.match(source, /update\.waiting_until = requestedFollowUpAt/);
  assert.match(source, /update\.next_followup = null/);
  assert.match(source, /email-crm-sync:follow-up-later/);
  assert.match(source, /classification\.intent !== "follow_up_later"/);
});

test("vague later replies create only an internal date-review task", () => {
  assert.match(source, /follow-up-date-review/);
  assert.match(source, /Sett ventedato/);
  assert.match(source, /Ikke kontakt kunden før datoen er avklart/);
});

test("governed active interest auto-advances only NEW leads to CONTACT and keeps human follow-up work", () => {
  assert.match(source, /activeInterestAutoAdvance/);
  assert.match(source, /classification\.intent === "active_interest"[\s\S]*governance\.canApplyAutomatically/);
  assert.match(source, /normalizedPreviousPipelineStatus === "NEW"/);
  assert.match(source, /update\.pipeline_status = "CONTACT"/);
  assert.match(source, /update\.nurture_status = "paused"/);
  assert.match(source, /nextStatus: "CONTACT"/);
  assert.match(source, /createdBy: "email-crm-sync:active-interest"/);
  assert.match(source, /ensureWorkItem/);
});

test("terminal outcomes cancel stale CRM, portal and lead-intelligence sales tasks", () => {
  assert.match(source, /closeOpenSalesWorkItems/);
  assert.match(source, /status: "CANCELLED"/);
  assert.match(source, /source_type\.in\.\(crm,portal,ai_agent\)/);
  assert.match(source, /assigned_agent\.in\.\(sales,lead_intelligence\)/);
  assert.match(source, /metadata->>contact_id\.eq/);
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

test("hot lead SLA does not create a duplicate immediate CRM follow-up date", () => {
  assert.doesNotMatch(source, /requiresFastResponse\) update\.next_followup = now/);
  assert.match(source, /Real-time urgency is represented by the/);
});

test("hot lead routing reuses buyer profile and stage-readiness context", () => {
  assert.match(source, /from\("buyer_profiles"\)/);
  assert.match(source, /buyer_profile_id: buyerProfile\.profileId/);
  assert.match(source, /stage_readiness_href/);
  assert.match(source, /\/lead-intelligence\?buyerProfileId=/);
});


test("Corporate inbound bridge runs before the missing-contact return and enriches work metadata only with prospect linkage", () => {
  assert.match(source, /syncCorporateProspectFromInboundReply/);
  assert.match(source, /contactId: contact\?\.id/);
  assert.match(source, /workItemCreated: corporateInbound\.workItemCreated/);
  assert.match(source, /corporate_prospect_id: corporateInbound\.prospect\?\.prospectId/);
  assert.match(source, /corporate_match_method: corporateInbound\.prospect\?\.matchedBy/);
});
