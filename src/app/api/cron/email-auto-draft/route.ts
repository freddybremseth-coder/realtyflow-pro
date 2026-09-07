export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireNexusSchedulerApi } from "@/lib/nexus/scheduler-auth";
import { evaluateCronSafeMode } from "@/lib/cron/safe-mode";
import { processEmailMessage } from "@/services/email/process-email-message";
import { getRuntimeControl } from "@/lib/nexus/runtime-controls";
import { classifyInboundMailSource } from "@/services/email/inbound-mail-filter";

export const maxDuration = 300;
const PATH = "/api/cron/email-auto-draft";

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
  if (safeMode.skip) return NextResponse.json({ success:true, skipped:true, mode:safeMode.mode, reason:safeMode.reason });

  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error:"Supabase not configured" }, { status:500 });
  const control = await getRuntimeControl(`cron:${PATH}`);
  const maxPerRun = Math.max(1, Math.min(25, Number(control?.config?.max_per_run || 10)));

  const { data: candidates, error } = await supabase
    .from("email_messages")
    .select("id,brand_id,from_address,subject,received_at,is_read,has_draft_reply")
    .eq("direction", "inbound")
    .eq("is_archived", false)
    .eq("has_draft_reply", false)
    .order("received_at", { ascending:true })
    .limit(maxPerRun);
  if (error) return NextResponse.json({ error:error.message }, { status:500 });

  const results:Array<{id:string;brand:string;status:"drafted"|"filtered"|"failed";kind?:string;error?:string}> = [];
  for (const row of candidates ?? []) {
    try {
      const kind = classifyInboundMailSource({ fromAddress: row.from_address, subject: row.subject });
      if (kind !== "customer") {
        const now = new Date().toISOString();
        const { error: markError } = await supabase.from("email_messages").update({
          is_archived: true,
          has_draft_reply: true,
          crm_processed_at: now,
          crm_reply_classification: "informational",
          crm_contact_id: null,
          ai_summary: `Filtered ${kind} inbound mail`,
          ai_suggested_action: "No sales action required.",
        }).eq("id", row.id);
        if (markError) throw new Error(markError.message);
        results.push({ id:String(row.id), brand:String(row.brand_id), status:"filtered", kind });
        continue;
      }
      await processEmailMessage(supabase, String(row.id));
      results.push({ id:String(row.id), brand:String(row.brand_id), status:"drafted" });
    } catch (e) {
      results.push({ id:String(row.id), brand:String(row.brand_id), status:"failed", error:e instanceof Error?e.message:String(e) });
    }
  }

  const drafted = results.filter(x=>x.status==="drafted").length;
  const filtered = results.filter(x=>x.status==="filtered").length;
  const failed = results.filter(x=>x.status==="failed").length;
  const { error: logError } = await supabase.from("automation_logs").insert({
    action:"email_auto_draft",
    agent_name:"nexus_email_auto_draft_cron",
    status: failed ? (drafted || filtered ? "partial" : "failed") : "success",
    details:{ scanned:(candidates??[]).length, drafted, filtered, failed, runtime_control:`cron:${PATH}`, max_per_run:maxPerRun },
  });
  if (logError) console.error("[email-auto-draft] automation log failed", logError.message);
  return NextResponse.json({ success:true, scanned:(candidates??[]).length, drafted, filtered, failed, results, logged:!logError });
}
