export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireNexusSchedulerApi } from "@/lib/nexus/scheduler-auth";
import { evaluateCronSafeMode } from "@/lib/cron/safe-mode";
import { runNexusSendPreflight } from "@/services/email/nexus-send-preflight";

export const maxDuration = 300;
const PATH = "/api/cron/nexus-send-preflight";
const OPEN_STATUSES = ["TO_DO", "IN_PROGRESS", "REVIEW"];
const ACTOR = "Nexus Send Preflight";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
function record(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }

export async function GET(request: NextRequest) {
  const unauthorized = await requireNexusSchedulerApi(request);
  if (unauthorized) return unauthorized;
  const safeMode = await evaluateCronSafeMode(PATH);
  if (safeMode.skip) return NextResponse.json({ success: true, skipped: true, mode: safeMode.mode, reason: safeMode.reason });
  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });
  const work = await supabase.from("work_items").select("id,brand_id,status,next_action,metadata,updated_at").eq("source_type", "crm").in("status", OPEN_STATUSES).eq("metadata->>presentation_send_preflight_required", "true").order("updated_at", { ascending: true }).limit(100);
  if (work.error) return NextResponse.json({ error: work.error.message }, { status: 500 });
  let considered = 0, ready = 0, blocked = 0, failed = 0;
  for (const row of work.data || []) {
    const metadata = record(row.metadata);
    const brandId = String(row.brand_id || ""), buyerProfileId = String(metadata.buyer_profile_id || ""), shortlistId = String(metadata.shortlist_id || ""), presentationId = String(metadata.presentation_id || ""), messageDraftId = String(metadata.presentation_message_draft_id || "");
    if (!brandId || !buyerProfileId || !shortlistId || !presentationId || !messageDraftId) continue;
    considered += 1;
    try {
      const assessment = await runNexusSendPreflight({ supabase, brandId, buyerProfileId, shortlistId, presentationId, messageDraftId });
      const now = new Date().toISOString();
      const nextMetadata = { ...metadata, send_preflight_status: assessment.status, send_preflight_ready: assessment.ready, send_preflight_checked_at: now, send_preflight_checked_by: ACTOR, send_preflight_blockers: assessment.blockers.slice(0, 20), send_preflight_warnings: assessment.warnings.slice(0, 30), send_preflight_checks: assessment.checks, send_preflight_revalidate_at_send: true, presentation_customer_send_allowed: false, presentation_send_preflight_required: assessment.ready ? false : true };
      const nextAction = assessment.ready ? "Send-preflight er grønn. Ingen melding er sendt. Neste steg krever eksplisitt send-godkjenning, og alle sikkerhetssjekker skal kjøres på nytt rett før utsending." : `Send-preflight er blokkert: ${assessment.blockers.slice(0, 3).join(" ")}`;
      const update = await supabase.from("work_items").update({ metadata: nextMetadata, next_action: nextAction, updated_at: now }).eq("id", row.id);
      if (update.error) throw update.error;
      if (assessment.ready) ready += 1; else blocked += 1;
    } catch (error) {
      failed += 1;
      console.warn("[nexus-send-preflight] work item failed", { workItemId: row.id, error: error instanceof Error ? error.message : String(error) });
    }
  }
  await supabase.from("automation_logs").insert({ action: "nexus_send_preflight", agent_name: "nexus_send_preflight", status: failed ? (ready || blocked ? "partial" : "failed") : "success", details: { considered, ready, blocked, failed, runtime_control: `cron:${PATH}`, provider_send: false, customer_send_allowed: false, revalidate_at_send: true } }).then(() => {}).then(undefined, () => {});
  return NextResponse.json({ success: true, considered, ready, blocked, failed, providerSend: false });
}
