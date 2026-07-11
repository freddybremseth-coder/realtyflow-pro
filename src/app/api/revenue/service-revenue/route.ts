import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminApi } from "@/lib/api-admin";
import {
  buildServiceRevenueAccount,
  buildServiceRevenueWorkspace,
  KEYHOLDING_PLAN_LABELS,
  type KeyholdingPlan,
} from "@/lib/revenue/service-revenue";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const SOURCE_BRANDS = new Set(["zeneco", "soleada", "keyholding"]);
const PLAN_IDS = new Set<KeyholdingPlan>(["BASIC", "STANDARD", "PREMIUM"]);
const ACTIONS = new Set([
  "plan_offer",
  "mark_offer_made",
  "start_contract",
  "renew_contract",
  "pause_contract",
  "cancel_contract",
  "followup",
  "schedule",
]);

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

function sourceBrand(contact: Record<string, unknown>) {
  return String(contact.brand_id || contact.brand || "").trim().toLowerCase();
}

function hasKeyholdingSignal(contact: Record<string, unknown>) {
  if (sourceBrand(contact) === "keyholding") return true;
  const interactions = Array.isArray(contact.interactions) ? contact.interactions : [];
  return interactions.some((item) => {
    if (!item || typeof item !== "object") return false;
    const row = item as Record<string, unknown>;
    const metadata = row.metadata && typeof row.metadata === "object" ? row.metadata as Record<string, unknown> : {};
    return String(row.action || metadata.action || "").startsWith("keyholding_");
  });
}

function eligibleSource(contact: Record<string, unknown>) {
  return SOURCE_BRANDS.has(sourceBrand(contact)) || hasKeyholdingSignal(contact);
}

function nextFollowupIso(days: number) {
  const date = new Date(Date.now() + days * 86_400_000);
  date.setHours(9, 0, 0, 0);
  return date.toISOString();
}

function renewalIso() {
  const date = new Date();
  date.setFullYear(date.getFullYear() + 1);
  date.setHours(9, 0, 0, 0);
  return date.toISOString();
}

function eventAction(action: string) {
  const map: Record<string, string> = {
    plan_offer: "keyholding_offer_planned",
    mark_offer_made: "keyholding_offer_made",
    start_contract: "keyholding_contract_started",
    renew_contract: "keyholding_contract_renewed",
    pause_contract: "keyholding_contract_paused",
    cancel_contract: "keyholding_contract_cancelled",
    followup: "keyholding_followup_logged",
    schedule: "keyholding_followup_logged",
  };
  return map[action];
}

function eventContent(action: string, plan: KeyholdingPlan | null) {
  const planLabel = plan ? KEYHOLDING_PLAN_LABELS[plan] : "Keyholding";
  if (action === "plan_offer") return `${planLabel}-tilbud er planlagt internt`;
  if (action === "mark_offer_made") return `${planLabel}-tilbud er registrert som presentert manuelt`;
  if (action === "start_contract") return `${planLabel}-avtale er registrert som startet`;
  if (action === "renew_contract") return `${planLabel}-avtale er registrert som fornyet`;
  if (action === "pause_contract") return "Keyholding-avtalen er registrert som satt på pause";
  if (action === "cancel_contract") return "Keyholding-avtalen er registrert som avsluttet";
  if (action === "followup") return "Manuell Keyholding-oppfølging er logget";
  return "Ny intern Keyholding-oppfølgingsdato er satt";
}

export async function GET(request: NextRequest) {
  const adminError = await requireAdminApi(request, { workspace: null });
  if (adminError) return adminError;

  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured", workspace: null }, { status: 500 });

  const { searchParams } = new URL(request.url);
  const source = String(searchParams.get("source") || "all").trim().toLowerCase();
  if (source !== "all" && !SOURCE_BRANDS.has(source)) {
    return NextResponse.json({ error: "Invalid source brand", workspace: null }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("contacts")
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(1500);

  if (error) return NextResponse.json({ error: error.message, workspace: null }, { status: 500 });

  const contacts = (data || [])
    .filter((contact) => eligibleSource(contact as Record<string, unknown>))
    .filter((contact) => source === "all" || sourceBrand(contact as Record<string, unknown>) === source);

  return NextResponse.json({ workspace: buildServiceRevenueWorkspace(contacts) });
}

export async function POST(request: NextRequest) {
  const adminError = await requireAdminApi(request);
  if (adminError) return adminError;

  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  const body = await request.json().catch(() => ({}));
  const contactId = String(body.contactId || "").trim();
  const action = String(body.action || "").trim();
  const plan = body.plan ? String(body.plan).trim().toUpperCase() as KeyholdingPlan : null;
  const requestedDays = body.nextFollowupDays === undefined || body.nextFollowupDays === null
    ? null
    : Number(body.nextFollowupDays);

  if (!contactId) return NextResponse.json({ error: "contactId is required" }, { status: 400 });
  if (!ACTIONS.has(action)) return NextResponse.json({ error: "Invalid service action" }, { status: 400 });
  if (plan && !PLAN_IDS.has(plan)) return NextResponse.json({ error: "Invalid Keyholding plan" }, { status: 400 });
  if (["plan_offer", "mark_offer_made", "start_contract", "renew_contract"].includes(action) && !plan) {
    return NextResponse.json({ error: "A Keyholding plan is required" }, { status: 400 });
  }
  if (requestedDays !== null && (!Number.isInteger(requestedDays) || requestedDays < 1 || requestedDays > 730)) {
    return NextResponse.json({ error: "nextFollowupDays must be an integer between 1 and 730" }, { status: 400 });
  }
  if (["followup", "schedule"].includes(action) && requestedDays === null) {
    return NextResponse.json({ error: "nextFollowupDays is required for this action" }, { status: 400 });
  }

  const { data: contact, error: contactError } = await supabase
    .from("contacts")
    .select("*")
    .eq("id", contactId)
    .single();

  if (contactError || !contact) {
    return NextResponse.json({ error: contactError?.message || "Contact not found" }, { status: 404 });
  }
  if (!eligibleSource(contact as Record<string, unknown>)) {
    return NextResponse.json({ error: "Contact is outside the Keyholding source scope" }, { status: 409 });
  }

  const account = buildServiceRevenueAccount(contact);
  if (!account) return NextResponse.json({ error: "Contact is not eligible for service revenue" }, { status: 409 });
  if (account.lifecycle === "CANCELLED" && !["plan_offer", "start_contract"].includes(action)) {
    return NextResponse.json({ error: "Cancelled service relationships require an explicit new offer or contract start" }, { status: 409 });
  }

  const now = new Date().toISOString();
  const interactions = Array.isArray(contact.interactions) ? contact.interactions : [];
  const renewalAt = ["start_contract", "renew_contract"].includes(action) ? renewalIso() : null;
  const updates: Record<string, unknown> = {
    updated_at: now,
    interactions: [
      {
        id: crypto.randomUUID(),
        type: "service_revenue",
        action: eventAction(action),
        content: eventContent(action, plan),
        date: now,
        internal: true,
        metadata: {
          source: "keyholding-service-revenue-workspace",
          action,
          plan,
          monthly_price_eur: plan ? ({ BASIC: 55, STANDARD: 89, PREMIUM: 169 } as Record<KeyholdingPlan, number>)[plan] : null,
          renewal_at: renewalAt,
          previous_lifecycle: account.lifecycle,
          customer_contact_sent: false,
          invoice_sent: false,
        },
      },
      ...interactions,
    ],
  };

  if (requestedDays !== null) updates.next_followup = nextFollowupIso(requestedDays);
  if (action === "plan_offer") updates.next_followup = nextFollowupIso(requestedDays || 3);
  if (action === "mark_offer_made") {
    updates.last_contact = now;
    updates.next_followup = nextFollowupIso(requestedDays || 7);
  }
  if (["start_contract", "renew_contract"].includes(action)) updates.next_followup = nextFollowupIso(30);
  if (action === "followup") updates.last_contact = now;
  if (action === "pause_contract") updates.next_followup = nextFollowupIso(requestedDays || 30);
  if (action === "cancel_contract") updates.next_followup = null;

  const { data: updated, error: updateError } = await supabase
    .from("contacts")
    .update(updates)
    .eq("id", contactId)
    .select("*")
    .single();

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });
  return NextResponse.json({
    ok: true,
    contact: updated,
    action,
    plan,
    renewalAt,
    customerContactSent: false,
    invoiceSent: false,
  });
}
