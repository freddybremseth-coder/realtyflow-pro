import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminApi } from "@/lib/api-admin";
import {
  buildRecoveryLead,
  buildRecoveryWorkspace,
  LOSS_REASON_LABELS,
  type LossReason,
} from "@/lib/revenue/recovery";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const DORMANT_STATUSES = ["LOST", "TAPT", "CLOSED_LOST", "ON_HOLD", "HOLD", "PA_VENT", "PAA_VENT", "VENTER", "PAUSE", "PAUSED"];
const REAL_ESTATE_BRANDS = new Set(["zeneco", "soleada", "pinosoecolife"]);
const REASON_IDS = new Set<LossReason>(Object.keys(LOSS_REASON_LABELS) as LossReason[]);
const ACTIONS = new Set([
  "set_reason",
  "review",
  "plan_recovery",
  "manual_contact",
  "do_not_pursue",
  "reopen_contact",
  "reopen_qualified",
  "schedule",
]);

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

function nextFollowupIso(days: number) {
  const date = new Date(Date.now() + days * 86_400_000);
  date.setHours(9, 0, 0, 0);
  return date.toISOString();
}

function validIso(value: unknown) {
  if (!value) return null;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function withDormantAnchor(contact: any) {
  const interactions = Array.isArray(contact?.interactions) ? contact.interactions : [];
  const anchors = interactions
    .map((item: any) => validIso(item?.metadata?.dormant_since))
    .filter(Boolean) as string[];
  if (anchors.length === 0) return contact;
  anchors.sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
  return { ...contact, updated_at: anchors[0] };
}

function eventContent(action: string, reason?: LossReason) {
  if (action === "set_reason" && reason) return `Taps- eller pauseårsak registrert: ${LOSS_REASON_LABELS[reason]}`;
  if (action === "review") return "Saken er manuelt gjennomgått i Lost Lead Recovery";
  if (action === "plan_recovery") return "Kontrollert gjenopptakelse er planlagt internt";
  if (action === "manual_contact") return "Manuell kontakt med dormant kunde er logget";
  if (action === "do_not_pursue") return "Saken er markert som ikke aktuell for videre oppfølging";
  if (action === "reopen_contact") return "Dormant sak er eksplisitt åpnet igjen som kontaktet lead";
  if (action === "reopen_qualified") return "Dormant sak er eksplisitt åpnet igjen som kvalifisert lead";
  return "Ny intern vurderingsdato er satt";
}

function eventAction(action: string) {
  const map: Record<string, string> = {
    set_reason: "recovery_reason_set",
    review: "recovery_reviewed",
    plan_recovery: "recovery_plan_logged",
    manual_contact: "recovery_manual_contact",
    do_not_pursue: "recovery_do_not_pursue",
    reopen_contact: "recovery_reactivated",
    reopen_qualified: "recovery_reactivated",
    schedule: "recovery_scheduled",
  };
  return map[action];
}

export async function GET(request: NextRequest) {
  const adminError = await requireAdminApi(request, { workspace: null, leads: [] });
  if (adminError) return adminError;

  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured", workspace: null }, { status: 500 });

  const { searchParams } = new URL(request.url);
  const brand = String(searchParams.get("brand") || "").trim().toLowerCase();

  let query = supabase
    .from("contacts")
    .select("*")
    .in("pipeline_status", DORMANT_STATUSES)
    .order("updated_at", { ascending: false })
    .limit(1000);

  if (brand && brand !== "all") {
    if (!REAL_ESTATE_BRANDS.has(brand)) return NextResponse.json({ error: "Invalid brand filter", workspace: null }, { status: 400 });
    query = query.or(`brand_id.eq.${brand},brand.eq.${brand}`);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message, workspace: null }, { status: 500 });

  const workspace = buildRecoveryWorkspace((data || []).map(withDormantAnchor));
  return NextResponse.json({ workspace });
}

export async function POST(request: NextRequest) {
  const adminError = await requireAdminApi(request);
  if (adminError) return adminError;

  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  const body = await request.json().catch(() => ({}));
  const contactId = String(body.contactId || "").trim();
  const action = String(body.action || "").trim();
  const reason = body.reason ? String(body.reason).trim().toUpperCase() as LossReason : null;
  const requestedDays = body.nextFollowupDays === undefined || body.nextFollowupDays === null
    ? null
    : Number(body.nextFollowupDays);

  if (!contactId) return NextResponse.json({ error: "contactId is required" }, { status: 400 });
  if (!ACTIONS.has(action)) return NextResponse.json({ error: "Invalid recovery action" }, { status: 400 });
  if (action === "set_reason" && (!reason || !REASON_IDS.has(reason))) {
    return NextResponse.json({ error: "A valid loss reason is required" }, { status: 400 });
  }
  if (requestedDays !== null && (!Number.isInteger(requestedDays) || requestedDays < 1 || requestedDays > 730)) {
    return NextResponse.json({ error: "nextFollowupDays must be an integer between 1 and 730" }, { status: 400 });
  }
  if (["schedule", "plan_recovery", "manual_contact"].includes(action) && requestedDays === null) {
    return NextResponse.json({ error: "nextFollowupDays is required for this action" }, { status: 400 });
  }

  const { data: rawContact, error: contactError } = await supabase
    .from("contacts")
    .select("*")
    .eq("id", contactId)
    .single();

  if (contactError || !rawContact) return NextResponse.json({ error: contactError?.message || "Contact not found" }, { status: 404 });
  const anchoredContact = withDormantAnchor(rawContact);
  const recovery = buildRecoveryLead(anchoredContact);
  if (!recovery) return NextResponse.json({ error: "Contact is not lost or on hold" }, { status: 409 });

  const now = new Date().toISOString();
  const interactions = Array.isArray(rawContact.interactions) ? rawContact.interactions : [];
  const targetStage = action === "reopen_qualified" ? "QUALIFIED" : action === "reopen_contact" ? "CONTACT" : null;
  const updates: Record<string, unknown> = {
    updated_at: now,
    interactions: [
      {
        id: crypto.randomUUID(),
        type: "recovery",
        action: eventAction(action),
        content: eventContent(action, reason || undefined),
        date: now,
        internal: true,
        metadata: {
          source: "lost-lead-recovery-workspace",
          action,
          reason: reason || recovery.reason,
          previous_stage: recovery.stage,
          target_stage: targetStage,
          customer_contact_sent: false,
          recovery_score_at_action: recovery.recoveryScore,
          dormant_since: recovery.dormantSince,
        },
      },
      ...interactions,
    ],
  };

  if (requestedDays !== null) updates.next_followup = nextFollowupIso(requestedDays);
  if (action === "do_not_pursue") updates.next_followup = null;
  if (action === "manual_contact") updates.last_contact = now;
  if (targetStage) {
    updates.pipeline_status = targetStage;
    updates.next_followup = requestedDays !== null ? nextFollowupIso(requestedDays) : nextFollowupIso(3);
  }

  const { data: updated, error: updateError } = await supabase
    .from("contacts")
    .update(updates)
    .eq("id", contactId)
    .select("*")
    .single();

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });
  return NextResponse.json({ ok: true, contact: updated, action, targetStage, customerContactSent: false });
}
