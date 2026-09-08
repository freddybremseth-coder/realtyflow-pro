import type { SupabaseClient } from "@supabase/supabase-js";
import { classifyInboundReply, type InboundReplyIntent } from "@/lib/inbound-reply-intelligence";
import { classifyInboundMailSource } from "@/services/email/inbound-mail-filter";
import { applyInboundCrmActions } from "@/services/email/apply-inbound-crm-actions";

export type ReconciliationEmailRow = {
  id: string;
  brand_id: string;
  from_address: string | null;
  subject: string | null;
  body_text: string | null;
  body_html: string | null;
  ai_summary: string | null;
  ai_urgency: string | null;
  ai_suggested_action: string | null;
  crm_reply_classification: string | null;
  crm_processed_at: string | null;
  received_at: string | null;
};

export type ReconciliationCandidate = {
  row: ReconciliationEmailRow;
  classification: InboundReplyIntent;
};

const TERMINAL_INTENTS = new Set<InboundReplyIntent>([
  "do_not_contact",
  "purchased_elsewhere",
  "no_longer_buying",
]);

function normalizedEmail(value: string | null | undefined) {
  return String(value || "").trim().toLowerCase();
}

function receivedAtMs(value: string | null | undefined) {
  const time = new Date(String(value || "")).getTime();
  return Number.isFinite(time) ? time : 0;
}

/**
 * Selects only the newest inbound customer message per sender before deciding
 * whether historical CRM state is safe to reconcile. This prevents an older
 * terminal reply from closing a customer who later re-engaged.
 */
export function planInboundReplyReconciliation(rows: ReconciliationEmailRow[]) {
  const sorted = [...rows].sort((a, b) => receivedAtMs(b.received_at) - receivedAtMs(a.received_at));
  const seenSenders = new Set<string>();
  const candidates: ReconciliationCandidate[] = [];

  for (const row of sorted) {
    const sender = normalizedEmail(row.from_address);
    if (!sender || seenSenders.has(sender)) continue;
    seenSenders.add(sender);

    if (classifyInboundMailSource({ fromAddress: sender, subject: row.subject }) !== "customer") continue;

    const classification = classifyInboundReply({
      subject: row.subject,
      body: row.body_text || row.body_html || "",
    });

    if (!TERMINAL_INTENTS.has(classification.intent)) continue;
    if (String(row.crm_reply_classification || "") === classification.intent) continue;

    candidates.push({ row, classification: classification.intent });
  }

  return candidates;
}

export async function reconcileInboundReplies(
  supabase: SupabaseClient,
  rows: ReconciliationEmailRow[],
  maxApply = 20,
) {
  const candidates = planInboundReplyReconciliation(rows).slice(0, Math.max(0, maxApply));
  const results: Array<{
    id: string;
    fromAddress: string;
    previousClassification: string | null;
    classification: InboundReplyIntent;
    contactId: string | null;
    status: "reconciled" | "failed";
    error?: string;
  }> = [];

  for (const candidate of candidates) {
    const row = candidate.row;
    try {
      const action = await applyInboundCrmActions(supabase, {
        emailMessageId: String(row.id),
        brandId: String(row.brand_id),
        fromAddress: String(row.from_address || ""),
        subject: row.subject,
        body: row.body_text || row.body_html || "",
        summary: row.ai_summary,
        urgency: row.ai_urgency,
        suggestedAction: row.ai_suggested_action,
      });

      const marked = await supabase.from("email_messages").update({
        crm_reply_classification: action.classification,
        crm_contact_id: action.contactId,
        crm_processed_at: new Date().toISOString(),
      }).eq("id", row.id);
      if (marked.error) throw new Error(`Reconciliation marker failed: ${marked.error.message}`);

      results.push({
        id: String(row.id),
        fromAddress: normalizedEmail(row.from_address),
        previousClassification: row.crm_reply_classification,
        classification: action.classification,
        contactId: action.contactId,
        status: "reconciled",
      });
    } catch (error) {
      results.push({
        id: String(row.id),
        fromAddress: normalizedEmail(row.from_address),
        previousClassification: row.crm_reply_classification,
        classification: candidate.classification,
        contactId: null,
        status: "failed",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return {
    candidates: candidates.length,
    reconciled: results.filter((item) => item.status === "reconciled").length,
    failed: results.filter((item) => item.status === "failed").length,
    results,
  };
}
