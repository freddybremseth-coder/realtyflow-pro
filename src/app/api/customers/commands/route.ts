import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminApi } from "@/lib/api-admin";
import { buildCustomerCommunicationState, summarizeNurtureEvents } from "@/lib/customers/communication-status";
import { isNurtureLiveEnabled } from "@/lib/nexus/runtime-controls";
import { runNurtureCycle } from "@/services/growth/nurture-engine";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 120;

type CommandId = "send_first_email_safe";
type CommandMode = "preview" | "execute";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

function normalizedEmail(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

function validSingleEmail(value: unknown) {
  const email = normalizedEmail(value);
  if (!email || /[,;\s].*[,;]/.test(email) || email.includes(",") || email.includes(";")) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
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
    const email = normalizedEmail(contact.email);
    const brand = String(contact.brand_id || contact.brand || "").trim().toLowerCase();
    if (!email) continue;
    const key = `${brand}:${email}`;
    duplicateCounts.set(key, (duplicateCounts.get(key) || 0) + 1);
  }

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
    if (!validSingleEmail(contact.email)) return false;
    const email = normalizedEmail(contact.email);
    const brand = String(contact.brand_id || contact.brand || "").trim().toLowerCase();
    return (duplicateCounts.get(`${brand}:${email}`) || 0) === 1;
  });

  const byBrand = candidates.reduce<Record<string, number>>((acc, contact) => {
    const brand = String(contact.brand_id || contact.brand || "unknown");
    acc[brand] = (acc[brand] || 0) + 1;
    return acc;
  }, {});

  const preview = {
    command,
    candidateCount: candidates.length,
    byBrand,
    batchSize: 25,
    sample: candidates.slice(0, 8).map((contact) => ({
      id: contact.id,
      name: contact.name || contact.email,
      email: contact.email,
      brandId: contact.brand_id || contact.brand || null,
    })),
  };

  if (mode === "preview") {
    return NextResponse.json({ ok: true, mode, ...preview });
  }

  const live = await isNurtureLiveEnabled();
  if (!live) {
    return NextResponse.json({
      error: "Nurture LIVE er av. Slå på feature:nurture_live i Nexus før denne kommandoen kan sende.",
      ...preview,
    }, { status: 409 });
  }

  const batch = candidates.slice(0, 25);
  let sent = 0;
  let failed = 0;
  const results: Array<Record<string, unknown>> = [];

  for (const contact of batch) {
    const email = normalizedEmail(contact.email);
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
      results.push({
        contactId: contact.id,
        email,
        sent: result.sent,
        failed: result.failed,
        skipped: result.skipped,
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

  return NextResponse.json({
    ok: true,
    mode,
    ...preview,
    attempted: batch.length,
    sent,
    failed,
    remaining: Math.max(0, candidates.length - batch.length),
    results,
    note: "Denne kommandoen sender maks 25 trygge førstegangsutsendelser per manuell kjøring. Resten forblir i den automatiske nurture-køen.",
  });
}
