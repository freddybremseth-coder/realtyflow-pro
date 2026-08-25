export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireCronApi } from "@/lib/api-cron";
import { evaluateCronSafeMode } from "@/lib/cron/safe-mode";
import { processEmailMessage } from "@/services/email/process-email-message";
import { getRuntimeControl } from "@/lib/nexus/runtime-controls";

export const maxDuration = 300;
const PATH = "/api/cron/email-auto-draft";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function GET(request: NextRequest) {
  const unauthorized = requireCronApi(request);
  if (unauthorized) return unauthorized;

  const safeMode = await evaluateCronSafeMode(PATH);
  if (safeMode.skip) return NextResponse.json({ success:true, skipped:true, mode:safeMode.mode, reason:safeMode.reason });

  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error:"Supabase not configured" }, { status:500 });

  const control = await getRuntimeControl(`cron:${PATH}`);
  const maxPerRun = Math.max(1, Math.min(25, Number(control?.config?.max_per_run || 10)));

  const { data: candidates, error } = await supabase
    .from("email_messages")
    .select("id,brand_id,subject,received_at,is_read,has_draft_reply")
    .eq("direction", "inbound")
    .eq("is_archived", false)
    .eq("has_draft_reply", false)
    .order("received_at", { ascending:true })
    .limit(maxPerRun);
  if (error) return NextResponse.json({ error:error.message }, { status:500 });

  const results:Array<{id:string;brand:string;status:"drafted"|"failed";error?:string}> = [];
  for (const row of candidates ?? []) {
    try {
      await processEmailMessage(supabase, String(row.id));
      results.push({ id:String(row.id), brand:String(row.brand_id), status:"drafted" });
    } catch (e) {
      results.push({ id:String(row.id), brand:String(row.brand_id), status:"failed", error:e instanceof Error?e.message:String(e) });
    }
  }

  const drafted = results.filter(x=>x.status==="drafted").length;
  const failed = results.length - drafted;
  await supabase.from("automation_logs").insert({
    type:"email_auto_draft",
    status: failed ? (drafted ? "partial" : "failed") : "success",
    details:{ scanned:(candidates??[]).length, drafted, failed, runtime_control:`cron:${PATH}` },
  }).then(()=>{}).then(undefined,()=>{});

  return NextResponse.json({ success:true, scanned:(candidates??[]).length, drafted, failed, results });
}
