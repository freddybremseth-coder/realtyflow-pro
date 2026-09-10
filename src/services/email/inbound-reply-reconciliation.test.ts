import assert from "node:assert/strict";
import test from "node:test";
import { planInboundReplyReconciliation, type ReconciliationEmailRow } from "./inbound-reply-reconciliation";

function row(overrides: Partial<ReconciliationEmailRow>): ReconciliationEmailRow {
  return {
    id: overrides.id || crypto.randomUUID(),
    brand_id: overrides.brand_id || "zeneco",
    from_address: overrides.from_address || "customer@example.com",
    subject: overrides.subject ?? "Re: Er bolig i Spania fortsatt aktuelt for deg?",
    body_text: overrides.body_text ?? "Takk for info",
    body_html: overrides.body_html ?? null,
    ai_summary: overrides.ai_summary ?? null,
    ai_urgency: overrides.ai_urgency ?? null,
    ai_suggested_action: overrides.ai_suggested_action ?? null,
    crm_reply_classification: overrides.crm_reply_classification ?? "active_interest",
    crm_processed_at: overrides.crm_processed_at ?? "2026-09-08T10:00:00.000Z",
    received_at: overrides.received_at ?? "2026-09-08T10:00:00.000Z",
  };
}

test("reconciles explicit terminal latest reply even when quoted thread contains positive language", () => {
  const candidates = planInboundReplyReconciliation([
    row({
      id: "edith",
      body_text: "Ikke aktuelt lenger.\n________________________________\nFrom: Freddy <freddy@zenecohomes.com>\nSvar gjerne 'fortsatt interessert' hvis bolig fortsatt er aktuelt.",
      crm_reply_classification: "property_interest",
    }),
  ]);

  assert.equal(candidates.length, 1);
  assert.equal(candidates[0]?.classification, "no_longer_buying");
});

test("bare STOPP is reconciled as do-not-contact", () => {
  const candidates = planInboundReplyReconciliation([
    row({ id: "stop", body_text: "Stopp.\n\nSendt fra min iPhone", crm_reply_classification: "follow_up_later" }),
  ]);

  assert.equal(candidates.length, 1);
  assert.equal(candidates[0]?.classification, "do_not_contact");
});

test("only newest inbound message per sender may drive reconciliation", () => {
  const candidates = planInboundReplyReconciliation([
    row({
      id: "older-terminal",
      body_text: "Ikke aktuelt lenger",
      received_at: "2026-09-07T08:00:00.000Z",
      crm_reply_classification: "active_interest",
    }),
    row({
      id: "new-active",
      body_text: "Ja, vi er fortsatt interessert og ønsker å se på alternativer",
      received_at: "2026-09-08T08:00:00.000Z",
      crm_reply_classification: "active_interest",
    }),
  ]);

  assert.equal(candidates.length, 0);
});

test("already-correct terminal classifications are idempotently skipped", () => {
  const candidates = planInboundReplyReconciliation([
    row({ body_text: "Vi har allerede kjøpt bolig", crm_reply_classification: "purchased_elsewhere" }),
  ]);
  assert.equal(candidates.length, 0);
});

test("non-customer system mail is never reconciled", () => {
  const candidates = planInboundReplyReconciliation([
    row({ from_address: "MAILER-DAEMON@mailchannels.net", body_text: "Stopp", crm_reply_classification: "informational" }),
  ]);
  assert.equal(candidates.length, 0);
});
