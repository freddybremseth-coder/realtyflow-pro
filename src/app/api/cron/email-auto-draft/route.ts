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
const MAX_DRAFT_ATTEMPTS = 5;
const CLAIM_LEASE_MS = 10 * 60 * 1000;
const RETRY_DELAYS_MS = [15 * 60 * 1000, 60 * 60 * 1000, 6 * 60 * 60 * 1000, 24 * 60 * 60 * 1000] as const;

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

function sanitizedError(error: unknown) {
  const value = error instanceof Error ? error.message : String(error);
  return value
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 500) || "Unknown auto-draft failure";
}

function retryAfter(attempt: number, nowMs: number) {
  const index = Math.max(0, Math.min(RETRY_DELAYS_MS.length - 1, attempt - 1));
  return new Date(nowMs + RETRY_DELAYS_MS[index]).toISOString();
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
  const selectionNow = new Date().toISOString();

  const { data: candidates, error } = await supabase
    .from("email_messages")
    .select("id,brand_id,from_address,subject,received_at,is_read,has_draft_reply,ai_draft_attempt_count,ai_draft_retry_after,ai_draft_quarantined_at")
    .eq("direction", "inbound")
    .eq("is_archived", false)
    .eq("has_draft_reply", false)
    .is("ai_draft_quarantined_at", null)
    .or(`ai_draft_retry_after.is.null,ai_draft_retry_after.lte.${selectionNow}`)
    .order("received_at", { ascending:true })
    .limit(maxPerRun);
  if (error) return NextResponse.json({ error:error.message }, { status:500 });

  const results:Array<{
    id:string;
    brand:string;
    status:"drafted"|"filtered"|"retry_scheduled"|"quarantined"|"claim_skipped";
    kind?:string;
    attempt?:number;
    retryAfter?:string|null;
    error?:string;
  }> = [];

  for (const row of candidates ?? []) {
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
        ai_draft_attempt_count: 0,
        ai_draft_last_attempt_at: now,
        ai_draft_retry_after: null,
        ai_draft_last_error: null,
        ai_draft_quarantined_at: null,
      }).eq("id", row.id);
      if (markError) {
        const message = sanitizedError(markError);
        results.push({ id:String(row.id), brand:String(row.brand_id), status:"retry_scheduled", kind, error:message });
      } else {
        results.push({ id:String(row.id), brand:String(row.brand_id), status:"filtered", kind });
      }
      continue;
    }

    const currentAttempts = Math.max(0, Number(row.ai_draft_attempt_count || 0));
    const attempt = currentAttempts + 1;
    const nowMs = Date.now();
    const attemptedAt = new Date(nowMs).toISOString();
    const leaseUntil = new Date(nowMs + CLAIM_LEASE_MS).toISOString();

    const { data: claim, error: claimError } = await supabase
      .from("email_messages")
      .update({
        ai_draft_attempt_count: attempt,
        ai_draft_last_attempt_at: attemptedAt,
        ai_draft_retry_after: leaseUntil,
      })
      .eq("id", row.id)
      .eq("has_draft_reply", false)
      .eq("ai_draft_attempt_count", currentAttempts)
      .is("ai_draft_quarantined_at", null)
      .select("id")
      .maybeSingle();

    if (claimError || !claim) {
      results.push({
        id:String(row.id),
        brand:String(row.brand_id),
        status:"claim_skipped",
        attempt,
        ...(claimError ? { error:sanitizedError(claimError) } : {}),
      });
      continue;
    }

    try {
      await processEmailMessage(supabase, String(row.id));
      const { error: resetError } = await supabase.from("email_messages").update({
        ai_draft_attempt_count: 0,
        ai_draft_retry_after: null,
        ai_draft_last_error: null,
        ai_draft_quarantined_at: null,
      }).eq("id", row.id);
      if (resetError) console.warn("[email-auto-draft] retry-state reset failed", sanitizedError(resetError));
      results.push({ id:String(row.id), brand:String(row.brand_id), status:"drafted", attempt });
    } catch (e) {
      const message = sanitizedError(e);
      const quarantined = attempt >= MAX_DRAFT_ATTEMPTS;
      const nextRetry = quarantined ? null : retryAfter(attempt, nowMs);
      const { error: retryStateError } = await supabase.from("email_messages").update({
        has_draft_reply: false,
        ai_draft_retry_after: nextRetry,
        ai_draft_last_error: message,
        ai_draft_quarantined_at: quarantined ? new Date().toISOString() : null,
      }).eq("id", row.id);
      if (retryStateError) console.error("[email-auto-draft] retry-state write failed", sanitizedError(retryStateError));
      results.push({
        id:String(row.id),
        brand:String(row.brand_id),
        status:quarantined ? "quarantined" : "retry_scheduled",
        attempt,
        retryAfter:nextRetry,
        error:message,
      });
    }
  }

  const drafted = results.filter(x=>x.status==="drafted").length;
  const filtered = results.filter(x=>x.status==="filtered").length;
  const retried = results.filter(x=>x.status==="retry_scheduled").length;
  const quarantined = results.filter(x=>x.status==="quarantined").length;
  const claimSkipped = results.filter(x=>x.status==="claim_skipped").length;
  const failed = retried + quarantined;
  const errorSamples = results
    .filter((x) => x.error)
    .slice(0, 5)
    .map((x) => ({ status:x.status, attempt:x.attempt || null, error:x.error }));

  const { error: logError } = await supabase.from("automation_logs").insert({
    action:"email_auto_draft",
    agent_name:"elena_email_ai",
    status: failed ? (drafted || filtered ? "partial" : "failed") : "success",
    details:{
      scanned:(candidates??[]).length,
      drafted,
      filtered,
      failed,
      retried,
      quarantined,
      claim_skipped:claimSkipped,
      max_attempts:MAX_DRAFT_ATTEMPTS,
      error_samples:errorSamples,
      runtime_control:`cron:${PATH}`,
      max_per_run:maxPerRun,
    },
  });
  if (logError) console.error("[email-auto-draft] automation log failed", logError.message);
  return NextResponse.json({ success:failed===0, scanned:(candidates??[]).length, drafted, filtered, failed, retried, quarantined, claimSkipped, results, logged:!logError });
}
