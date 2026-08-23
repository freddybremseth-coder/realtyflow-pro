/**
 * Executor komposisjons-rot (produksjon). Kobler executor-portene til ekte
 * e-post (sendBrandEmail) + revenue_events.
 *
 * TRYGG DEFAULT: dry-run. Ekte utsending krever AGENTIC_EXECUTOR_LIVE=true.
 * Slik sender vi ikke ekte kunde-e-post ved et uhell — selv etter godkjenning
 * må live-modus slås på bevisst.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { insertRevenueEvent } from "@/lib/revenue/events";
import type { ExecutorDeps, ExecutorSender } from "@/lib/agentic/executor";
import { sendBrandEmail } from "@/services/email/send-brand-email";
import { makeExecutorStore } from "@/services/agentic/adapters";

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
    publishEvent: async (e) => {
      await insertRevenueEvent(supabase, {
        eventType: "automation_executed",
        title: e.title,
        actorType: "system",
        revenueImpactEur: e.revenueImpactEur ?? null,
        metadata: { run_id: e.runId, agentic_outcome: "executed", subject_type: e.subjectType, subject_ref: e.subjectRef },
      });
    },
  };
}
