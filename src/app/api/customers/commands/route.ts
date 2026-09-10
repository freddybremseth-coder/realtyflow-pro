import { NextRequest, NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { requireAdminApi } from "@/lib/api-admin";
import { buildCustomerCommunicationState, summarizeNurtureEvents } from "@/lib/customers/communication-status";
import { isNurtureLiveEnabled } from "@/lib/nexus/runtime-controls";
import { runNurtureCycle } from "@/services/growth/nurture-engine";
import {
  evaluateNurtureSendability,
  normalizeNurtureEmail,
  type NurtureSendabilityReason,
} from "@/services/growth/nurture-sendability";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 120;

const BATCH_SIZE = 25;
const COMMAND_ACTION = "crm_safe_nurture_command";

type CommandId = "send_first_email_safe";
type CommandMode = "preview" | "execute";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

function incrementReason(target: Record<string, number>, reason: string, amount = 1) {
  target[reason] = (target[reason] || 0) + amount;
}

async function writeCommandAudit(
  supabase: SupabaseClient,
  status: "success" | "error",
  details: Record<string, unknown>,
) {
  const { error } = await supabase.from("automation_logs").insert({
    action: COMMAND_ACTION,
    agent_name: "crm_command_menu",
    status,
    details,
  });
  if (error) console.warn("[crm-command] audit log insert failed", error.message);
  return !error;
}

export async function POST(request: NextRequest) {
  const denied = await requireAdminApi(request);
  if (denied) return denied;

  const body = await request.json().catch(() => ({}));
  const command = String(body?.command || "") as CommandId;
  const mode = String(body?.mode || "preview") as CommandMode;
  const brandId = typeof body?.brandId === "string" && body.brandId.trim() ? body.brandId.trim() : null;

  if (command !== "send_first_email_safe") {
    return NextResponse.json({ error: "Unknown CRM command" }, { status: 400 });
  }
  if (!["preview", "execute"].includes(mode)) {
    return NextResponse.json({ error: "mode must be preview or execute" }, { status: 400 });
  }

  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });

  let contactsQuery = supabase
    .from("contacts")
    .select("id,name,email,brand_id,brand,pipeline_status,nurture_status,do_not_contact,email_suppressed,suppression_reason,last_inbound_reply_at")
    .limit(2500);
  if (brandId) contactsQuery = contactsQuery.eq("brand_id", brandId);

  const { data: contacts, error: contactsError } = await contactsQuery;
  if (contactsError) return NextResponse.json({ error: contactsError.message }, { status: 500 });

  const ids = (contacts || []).map((contact) => String(contact.id)).filter(Boolean);
  const events = ids.length
    ? await supabase
        .from("lead_nurture_events")
        .select("contact_id,status,dry_run,sent_at,created_at,error")
        .in("contact_id", ids)
    : { data: [], error: null };
  if (events.error) return NextResponse.json({ error: events.error.message }, { status: 500 });

  const summaries = summarizeNurtureEvents((events.data || []) as Array<Record<string, any>>);
  const duplicateCounts = new Map<string, number>();
  for (const contact of contacts || []) {
    const email = normalizeNurtureEmail(contact.email);
    const brand = String(contact.brand_id || contact.brand || "").trim().toLowerCase();
    if (!email) continue;
    const key = `${brand}:${email}`;
    duplicateCounts.set(key, (duplicateCounts.get(key) || 0) + 1);
  }

  const blockedReasons: Record<string, number> = {};
  const candidates = (contacts || []).filter((contact) => {
    const summary = summaries.get(String(contact.id)) || {
      sentCount: 0,
      lastSentAt: null,
      failedCount: 0,
      lastFailedAt: null,
      lastError: null,
    };
    const state = buildCustomerCommunicationState(contact, summary);
    if (state.status !== "READY_NOT_STARTED" || !state.shouldReceiveEmail) return false;

    const normalizedEmail = normalizeNurtureEmail(contact.email);
    const brand = String(contact.brand_id || contact.brand || "").trim().toLowerCase();
    const decision = evaluateNurtureSendability({
      email: contact.email,
      normalizedEmailCount: normalizedEmail ? duplicateCounts.get(`${brand}:${normalizedEmail}`) || 1 : 1,
      doNotContact: contact.do_not_contact,
      emailSuppressed: contact.email_suppressed,
      pipelineStatus: contact.pipeline_status,
      lastInboundReplyAt: contact.last_inbound_reply_at,
      lastRealSendAt: summary.lastSentAt,
    });

    if (!decision.sendable || !decision.normalizedEmail) {
      incrementReason(blockedReasons, decision.reason);
      return false;
    }
    return true;
  });

  const byBrand = candidates.reduce<Record<string, number>>((acc, contact) => {
    const brand = String(contact.brand_id || contact.brand || "unknown");
    acc[brand] = (acc[brand] || 0) + 1;
    return acc;
  }, {});

  const blockedCount = Object.values(blockedReasons).reduce((sum, count) => sum + count, 0);
  const preview = {
    command,
    candidateCount: candidates.length,
    blockedCount,
    blockedReasons,
    byBrand,
    batchSize: BATCH_SIZE,
    sample: candidates.slice(0, 8).map((contact) => ({
      id: contact.id,
      name: contact.name || contact.email,
      email: normalizeNurtureEmail(contact.email) || String(contact.email || ""),
      brandId: contact.brand_id || contact.brand || null,
    })),
  };

  if (mode === "preview") {
    const auditLogged = await writeCommandAudit(supabase, "success", {
      mode,
      command,
      outcome: "preview",
      brand_id: brandId,
      candidate_count: preview.candidateCount,
      blocked_count: preview.blockedCount,
      blocked_reasons: preview.blockedReasons,
      by_brand: preview.byBrand,
      batch_size: BATCH_SIZE,
      sends_started: 0,
    });
    return NextResponse.json({ ok: true, mode, ...preview, auditLogged });
  }

  const live = await isNurtureLiveEnabled();
  if (!live) {
    const auditLogged = await writeCommandAudit(supabase, "error", {
      mode,
      command,
      outcome: "blocked",
      reason: "NURTURE_LIVE_OFF",
      brand_id: brandId,
      candidate_count: preview.candidateCount,
      blocked_count: preview.blockedCount,
      blocked_reasons: preview.blockedReasons,
      by_brand: preview.byBrand,
      batch_size: BATCH_SIZE,
    });
    return NextResponse.json({
      error: "Nurture LIVE er av. Slå på feature:nurture_live i Nexus før denne kommandoen kan starte oppfølging.",
      ...preview,
      auditLogged,
    }, { status: 409 });
  }

  const batch = candidates.slice(0, BATCH_SIZE);
  let sent = 0;
  let started = 0;
  let failed = 0;
  let notStarted = 0;
  let engineSkipped = 0;
  let engineSendabilityBlocked = 0;
  let engineSendabilityReview = 0;
  const engineSendabilityReasons: Record<string, number> = {};
  const results: Array<Record<string, unknown>> = [];

  for (const contact of batch) {
    const email = normalizeNurtureEmail(contact.email) || String(contact.email || "").trim();
    const contactBrand = String(contact.brand_id || contact.brand || "");
    try {
      const result = await runNurtureCycle(supabase, {
        dryRun: false,
        brandId: contactBrand || undefined,
        email,
        limit: 1,
      });
      sent += result.sent;
      failed += result.failed;
      engineSkipped += result.skipped;
      engineSendabilityBlocked += result.sendabilityBlocked;
      engineSendabilityReview += result.sendabilityReview;
      for (const [reason, count] of Object.entries(result.sendabilityReasons)) {
        if (count) incrementReason(engineSendabilityReasons, reason, count);
      }
      if (result.sent > 0) started += 1;
      else if (result.failed === 0) notStarted += 1;

      results.push({
        contactId: contact.id,
        email,
        sent: result.sent,
        failed: result.failed,
        skipped: result.skipped,
        sendabilityBlocked: result.sendabilityBlocked,
        sendabilityReview: result.sendabilityReview,
      });
    } catch (error) {
      failed += 1;
      results.push({
        contactId: contact.id,
        email,
        sent: 0,
        failed: 1,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  const remaining = Math.max(0, candidates.length - batch.length);
  const outcome = failed > 0 ? (started > 0 ? "partial" : "failed") : "success";
  const auditLogged = await writeCommandAudit(supabase, failed > 0 ? "error" : "success", {
    mode,
    command,
    outcome,
    brand_id: brandId,
    candidate_count: preview.candidateCount,
    blocked_count: preview.blockedCount,
    blocked_reasons: preview.blockedReasons,
    by_brand: preview.byBrand,
    batch_size: BATCH_SIZE,
    attempted: batch.length,
    started,
    sent,
    failed,
    not_started: notStarted,
    remaining,
    engine_skipped: engineSkipped,
    engine_sendability_blocked: engineSendabilityBlocked,
    engine_sendability_review: engineSendabilityReview,
    engine_sendability_reasons: engineSendabilityReasons,
  });

  return NextResponse.json({
    ok: true,
    mode,
    ...preview,
    attempted: batch.length,
    started,
    sent,
    failed,
    notStarted,
    remaining,
    engineSkipped,
    engineSendabilityBlocked,
    engineSendabilityReview,
    engineSendabilityReasons: engineSendabilityReasons as Partial<Record<NurtureSendabilityReason, number>>,
    auditLogged,
    results,
    nexusHref: "/nexus-os/communications",
    note: "Kontakter som fikk første steg sendt er nå startet i eksisterende nurture-sekvens. Videre steg håndteres av nurture-automatikken. Kommandoen behandler maks 25 trygge kandidater per manuell kjøring; resten blir liggende urørt til neste batch.",
  });
}
