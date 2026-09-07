export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireNexusSchedulerApi } from "@/lib/nexus/scheduler-auth";
import { evaluateCronSafeMode } from "@/lib/cron/safe-mode";
import { applyInboundCrmActions } from "@/services/email/apply-inbound-crm-actions";

export const maxDuration = 300;
const PATH = "/api/cron/email-crm-sync";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
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
    .from("email_messages")
    .select("id,brand_id,from_address,subject,body_text,body_html,ai_summary,ai_urgency,ai_suggested_action,crm_processed_at")
    .eq("direction", "inbound")
    .eq("has_draft_reply", true)
    .is("crm_processed_at", null)
    .order("received_at", { ascending: true })
    .limit(50);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const results: Array<{ id: string; classification?: string; contactId?: string | null; status: "processed" | "failed"; error?: string }> = [];

  for (const row of rows ?? []) {
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

      const processedAt = new Date().toISOString();
      const { error: markError } = await supabase
        .from("email_messages")
        .update({
          crm_processed_at: processedAt,
          crm_reply_classification: action.classification,
          crm_contact_id: action.contactId,
        })
        .eq("id", row.id)
        .is("crm_processed_at", null);
      if (markError) throw new Error(`Email CRM marker failed: ${markError.message}`);

      results.push({ id: String(row.id), classification: action.classification, contactId: action.contactId, status: "processed" });
    } catch (e) {
      results.push({ id: String(row.id), status: "failed", error: e instanceof Error ? e.message : String(e) });
    }
  }

  const processed = results.filter((x) => x.status === "processed").length;
  const failed = results.length - processed;
  await supabase.from("automation_logs").insert({
    action: "email_crm_sync",
    agent_name: "nexus_email_crm_sync_cron",
    status: failed ? (processed ? "partial" : "failed") : "success",
    details: {
      scanned: (rows ?? []).length,
      processed,
      failed,
      runtime_control: `cron:${PATH}`,
      classifications: results.reduce<Record<string, number>>((acc, item) => {
        if (item.classification) acc[item.classification] = (acc[item.classification] || 0) + 1;
        return acc;
      }, {}),
    },
  }).then(() => {}).then(undefined, () => {});

  return NextResponse.json({ success: true, scanned: (rows ?? []).length, processed, failed, results });
}
