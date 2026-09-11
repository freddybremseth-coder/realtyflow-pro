export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireNexusSchedulerApi } from "@/lib/nexus/scheduler-auth";
import { evaluateCronSafeMode } from "@/lib/cron/safe-mode";
import { handleNoMatchClarification } from "@/services/email/no-match-clarification";
import { isLeadIntelligenceRealEstateBrand } from "@/services/lead-intelligence/brand-allowlist";

export const maxDuration = 300;
const PATH = "/api/cron/nexus-no-match-followup";
const OPEN_STATUSES = ["TO_DO", "IN_PROGRESS", "REVIEW"];
const ACTOR = "Nexus No-Match Autopilot";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export async function GET(request: NextRequest) {
  const unauthorized = await requireNexusSchedulerApi(request);
  if (unauthorized) return unauthorized;
  const safeMode = await evaluateCronSafeMode(PATH);
  if (safeMode.skip) {
    return NextResponse.json({ success: true, skipped: true, mode: safeMode.mode, reason: safeMode.reason });
  }

  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  const { data: rows, error } = await supabase
    .from("work_items")
    .select("id,brand_id,status,source_type,source_id,next_action,metadata,updated_at")
    .eq("source_type", "crm")
    .in("status", OPEN_STATUSES)
    .eq("metadata->>property_match_status", "NO_MATCHES_FOUND")
    .order("updated_at", { ascending: true })
    .limit(100);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let considered = 0;
  let sent = 0;
  let humanReview = 0;
  let skipped = 0;
  let failed = 0;

  for (const row of rows || []) {
    const metadata = record(row.metadata);
    if (metadata.no_match_followup_at || metadata.no_match_followup_status) continue;

    const brandId = String(row.brand_id || "");
    const contactId = String(metadata.contact_id || "");
    const buyerProfileId = String(metadata.buyer_profile_id || "");
    const buyerProfileStatus = String(metadata.buyer_profile_status || "").toUpperCase();
    if (!isLeadIntelligenceRealEstateBrand(brandId) || !contactId || !buyerProfileId || buyerProfileStatus !== "APPROVED") {
      skipped += 1;
      continue;
    }

    considered += 1;
    try {
      const result = await handleNoMatchClarification(supabase, {
        brandId,
        contactId,
        buyerProfileId,
      });
      const now = new Date().toISOString();
      const plan = "plan" in result ? result.plan : undefined;
      const nextMetadata = {
        ...metadata,
        no_match_followup_at: now,
        no_match_followup_by: ACTOR,
        no_match_followup_status: result.status.toUpperCase(),
        no_match_followup_reason: result.reason,
        no_match_missing_fields: plan?.missingFields || [],
        no_match_questions: plan?.questions || [],
        no_match_current_criteria: plan?.currentCriteriaLines || [],
        no_match_clarification_pending: result.status === "sent",
        no_match_clarification_message_id: result.status === "sent" ? result.messageId : null,
        no_match_review_required: result.status !== "sent",
      };

      let nextAction: string;
      if (result.status === "sent") {
        nextAction = "Nexus fant ingen gode treff med dagens kriterier og har bedt kunden om de manglende opplysningene. Vent på svar; nytt kundesvar oppdaterer Buyer Profile før ny matching.";
        sent += 1;
      } else if (result.status === "human_review") {
        nextAction = "Nexus fant ingen treff selv om Buyer Profile er konkret. Vurder om kunden bør spørres om fleksibilitet i område, budsjett eller boligtype. Kriteriene endres ikke automatisk.";
        humanReview += 1;
      } else if (result.status === "skipped") {
        nextAction = `Ingen automatisk avklaringsmail ble sendt (${result.reason}). Kontroller kunden manuelt før kriterier eller matching endres.`;
        skipped += 1;
      } else {
        nextAction = `Avklaringsmail etter null treff feilet (${result.reason}). Saken er stoppet for menneskelig kontroll; Nexus endrer ingen kriterier automatisk.`;
        failed += 1;
      }

      const update = await supabase
        .from("work_items")
        .update({ metadata: nextMetadata, next_action: nextAction, updated_at: now })
        .eq("id", row.id);
      if (update.error) throw update.error;
    } catch (workerError) {
      failed += 1;
      console.warn("[nexus-no-match-followup] work item failed", {
        workItemId: row.id,
        error: workerError instanceof Error ? workerError.message : String(workerError),
      });
    }
  }

  await supabase.from("automation_logs").insert({
    action: "nexus_no_match_followup",
    agent_name: "nexus_no_match_autopilot",
    status: failed ? (sent || humanReview ? "partial" : "failed") : "success",
    details: {
      considered,
      sent,
      human_review: humanReview,
      skipped,
      failed,
      runtime_control: `cron:${PATH}`,
      criteria_mutated: false,
    },
  }).then(() => {}).then(undefined, () => {});

  return NextResponse.json({ success: true, considered, sent, humanReview, skipped, failed });
}
