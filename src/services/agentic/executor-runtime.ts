/**
 * Production executor composition root.
 *
 * Safe default: dry-run. Real sending requires AGENTIC_EXECUTOR_LIVE=true.
 * Execution receipts describe what actually ran; estimated opportunity value is
 * metadata only and never masquerades as realized revenue impact.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { buildRevenueEventDedupeKey, insertRevenueEvent } from "@/lib/revenue/events";
import type { ExecutorDeps, ExecutorSender } from "@/lib/agentic/executor";
import { sendBrandEmail } from "@/services/email/send-brand-email";
import { makeExecutorStore } from "@/services/agentic/adapters";
import { resolveReceiptIdentity } from "@/services/agentic/receipt-identity";

const EXECUTOR_LIVE = process.env.AGENTIC_EXECUTOR_LIVE === "true";
const DEFAULT_BRAND = process.env.AGENTIC_DEFAULT_BRAND_ID || "soleada";

export function makeEmailSender(supabase: SupabaseClient, live = EXECUTOR_LIVE): ExecutorSender {
  return {
    sendEmail: async ({ to, subject, body, brandId }) => {
      if (!live) return { detail: "dry-run (sett AGENTIC_EXECUTOR_LIVE=true for ekte utsending)", dryRun: true };
      const r = await sendBrandEmail(supabase, { brandId: brandId || DEFAULT_BRAND, to: [to], subject, bodyText: body });
      if (!r.success) throw new Error(r.error || (r.skipped ? "ingen aktiv SMTP-konfig for merket" : "e-post-send feilet"));
      return { detail: r.messageId || "sendt", dryRun: false };
    },
  };
}

export function buildExecutorDeps(supabase: SupabaseClient): ExecutorDeps {
  return {
    store: makeExecutorStore(supabase),
    sender: makeEmailSender(supabase),
    publishEvent: async (event) => {
      const identity = await resolveReceiptIdentity(supabase, event.customerRef);
      await insertRevenueEvent(supabase, {
        eventType: "automation_executed",
        title: event.title,
        contactId: identity.contactId,
        brandId: identity.brandId,
        sourceSystem: "agentic_executor",
        sourceType: event.gatedActionClass,
        sourceId: event.approvalId,
        actorType: "system",
        revenueImpactEur: null,
        dedupeKey: buildRevenueEventDedupeKey(["agentic-executor", "execution", event.approvalId]),
        metadata: {
          approval_id: event.approvalId,
          run_id: event.runId ?? null,
          correlation_id: event.correlationId ?? null,
          agentic_outcome: "executed",
          gated_action_class: event.gatedActionClass,
          subject_type: event.subjectType,
          subject_ref: event.subjectRef ?? null,
          customer_ref: event.customerRef ?? null,
          contact_resolution: identity.resolution,
          estimated_opportunity_eur: event.revenueImpactEur ?? null,
          execution_proof: true,
        },
        createdBy: "agentic-executor",
      });
    },
  };
}
