export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireNexusSchedulerApi } from "@/lib/nexus/scheduler-auth";
import { evaluateCronSafeMode } from "@/lib/cron/safe-mode";
import { sendApprovedPropertyRecommendation } from "@/services/email/property-recommendation-send";

export const maxDuration = 300;
const PATH = "/api/cron/nexus-property-recommendation-send";
const OPEN_STATUSES = ["TO_DO", "IN_PROGRESS", "REVIEW"];
const ACTOR = "Nexus Property Recommendation Autopilot";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function GET(request: NextRequest) {
  const unauthorized = await requireNexusSchedulerApi(request);
  if (unauthorized) return unauthorized;
  const safeMode = await evaluateCronSafeMode(PATH);
  if (safeMode.skip) return NextResponse.json({ success: true, skipped: true, mode: safeMode.mode, reason: safeMode.reason });

  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  const work = await supabase.from("work_items")
    .select("id,brand_id,status,metadata,updated_at")
    .eq("source_type", "crm")
    .in("status", OPEN_STATUSES)
    .eq("metadata->>property_recommendation_auto_send_authorized", "true")
    .eq("metadata->>send_preflight_ready", "true")
    .order("updated_at", { ascending: true })
    .limit(25);
  if (work.error) return NextResponse.json({ error: work.error.message }, { status: 500 });

  let considered = 0;
  let sent = 0;
  let duplicates = 0;
  let blocked = 0;
  let failed = 0;
  const results: Array<{ workItemId: string; outcome: string; reason?: string }> = [];

  for (const row of work.data || []) {
    considered += 1;
    try {
      const result = await sendApprovedPropertyRecommendation({ supabase, workItemId: String(row.id), actor: ACTOR });
      if (result.sent) {
        if (result.duplicate) duplicates += 1;
        else sent += 1;
        results.push({ workItemId: String(row.id), outcome: result.duplicate ? "duplicate_already_sent" : "sent" });
      } else {
        if (result.blocked) blocked += 1;
        else failed += 1;
        results.push({ workItemId: String(row.id), outcome: result.blocked ? "blocked" : "failed", reason: result.reason });
      }
    } catch (error) {
      failed += 1;
      const reason = error instanceof Error ? error.message : String(error);
      results.push({ workItemId: String(row.id), outcome: "failed", reason });
      console.warn("[nexus-property-recommendation-send] work item failed", { workItemId: row.id, error: reason });
    }
  }

  await supabase.from("automation_logs").insert({
    action: "nexus_property_recommendation_send",
    agent_name: "nexus_property_recommendation_send",
    status: failed ? (sent || duplicates || blocked ? "partial" : "failed") : "success",
    details: {
      considered,
      sent,
      duplicates,
      blocked,
      failed,
      runtime_control: `cron:${PATH}`,
      exact_policy: "property_recommendation_send_preapproved",
      final_human_approval_required: true,
      fresh_preflight_required: true,
      durable_send_receipt_required: true,
      results: results.slice(0, 25),
    },
  }).then(() => {}).then(undefined, () => {});

  return NextResponse.json({ success: true, considered, sent, duplicates, blocked, failed, results });
}
