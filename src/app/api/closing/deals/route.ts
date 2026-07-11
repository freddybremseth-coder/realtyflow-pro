import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminApi } from "@/lib/api-admin";
import {
  assessClosingRisk,
  decorateClosingDeal,
  defaultProbabilityForStage,
  normalizeClosingStage,
  normalizeClosingStatus,
  pipelineStatusForClosingStage,
  recommendClosingAction,
} from "@/lib/closing/deal";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key) as any;
}

function tableMissing(message = "") {
  return /real_estate_deals|schema cache|does not exist|could not find the table|relation/i.test(message);
}

function cleanText(value: unknown, max = 5000) {
  const text = String(value || "").trim();
  return text ? text.slice(0, max) : null;
}

function cleanStringList(value: unknown, maxItems = 50) {
  const raw = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(/[\n,;]/)
      : [];
  return raw
    .map((item) => {
      if (typeof item === "string") return item.trim();
      if (item && typeof item === "object") return String((item as Record<string, unknown>).name || (item as Record<string, unknown>).text || "").trim();
      return "";
    })
    .filter(Boolean)
    .slice(0, maxItems);
}

function safeNumber(value: unknown, fallback: number | null = null) {
  if (value === "" || value === null || value === undefined) return fallback;
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function tomorrowAtTen() {
  const date = new Date(Date.now() + 86_400_000);
  date.setHours(10, 0, 0, 0);
  return date.toISOString();
}

function defaultStageForContact(status: unknown) {
  const value = String(status || "").toUpperCase();
  if (value === "NEGOTIATION") return "OFFER_RESERVATION";
  if (value === "VIEWING") return "VIEWING_PLANNED";
  if (value === "QUALIFIED") return "REQUIREMENTS_CONFIRMED";
  return "QUALIFIED";
}

function buildSummary(deals: any[]) {
  const active = deals.filter((deal) => ["ACTIVE", "ON_HOLD"].includes(deal.status));
  return {
    activeDeals: active.length,
    atRisk: active.filter((deal) => ["HIGH", "CRITICAL"].includes(deal.calculated_risk_level)).length,
    viewing: active.filter((deal) => ["VIEWING_PLANNED", "VIEWING_COMPLETED", "PREFERRED_PROPERTY"].includes(deal.stage)).length,
    offerOrLater: active.filter((deal) => ["OFFER_RESERVATION", "LEGAL_DUE_DILIGENCE", "CONTRACT_SIGNED"].includes(deal.stage)).length,
    expectedPipelineValue: active.reduce((sum, deal) => sum + Number(deal.estimated_purchase_price || deal.contact?.pipeline_value || 0), 0),
    expectedCommission: active.reduce((sum, deal) => sum + Number(deal.expected_commission || 0), 0),
  };
}

export async function GET(request: NextRequest) {
  const adminError = await requireAdminApi(request, { deals: [], candidates: [] });
  if (adminError) return adminError;

  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured", deals: [], candidates: [] }, { status: 500 });

  const contactsResult = await supabase
    .from("contacts")
    .select("id,name,email,phone,brand_id,brand,pipeline_status,pipeline_value,property_interest,next_followup,updated_at")
    .in("pipeline_status", ["NEW", "CONTACT", "QUALIFIED", "VIEWING", "NEGOTIATION", "ON_HOLD"])
    .order("updated_at", { ascending: false })
    .limit(500);

  const contacts = contactsResult.data || [];
  const contactsById = new Map(contacts.map((contact: any) => [String(contact.id), contact]));

  const dealsResult = await supabase
    .from("real_estate_deals")
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(300);

  if (dealsResult.error) {
    if (tableMissing(dealsResult.error.message)) {
      return NextResponse.json({
        deals: [],
        candidates: contacts,
        summary: buildSummary([]),
        tableNotReady: true,
        migration: "20260711070000_real_estate_deals.sql",
        warning: "Closing-tabellen er ikke aktivert i databasen ennå.",
      });
    }
    return NextResponse.json({ error: dealsResult.error.message, deals: [], candidates: contacts }, { status: 500 });
  }

  const now = new Date();
  const deals = (dealsResult.data || [])
    .map((deal: any) => {
      const decorated = decorateClosingDeal(deal, now);
      return {
        ...decorated,
        contact: contactsById.get(String(deal.contact_id)) || null,
      };
    })
    .sort((a: any, b: any) => {
      const riskOrder: Record<string, number> = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };
      const riskDifference = (riskOrder[b.calculated_risk_level] || 0) - (riskOrder[a.calculated_risk_level] || 0);
      if (riskDifference !== 0) return riskDifference;
      if (a.is_overdue !== b.is_overdue) return a.is_overdue ? -1 : 1;
      return Number(b.probability || 0) - Number(a.probability || 0);
    });

  const contactsWithActiveDeal = new Set(
    deals
      .filter((deal: any) => ["ACTIVE", "ON_HOLD"].includes(deal.status))
      .map((deal: any) => String(deal.contact_id)),
  );

  return NextResponse.json({
    deals,
    candidates: contacts.filter((contact: any) => !contactsWithActiveDeal.has(String(contact.id))),
    summary: buildSummary(deals),
    tableNotReady: false,
  });
}

export async function POST(request: NextRequest) {
  const adminError = await requireAdminApi(request);
  if (adminError) return adminError;

  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  const body = await request.json().catch(() => ({}));
  const contactId = cleanText(body.contact_id, 80);
  if (!contactId) return NextResponse.json({ error: "contact_id is required" }, { status: 400 });

  const contactResult = await supabase
    .from("contacts")
    .select("id,name,email,brand_id,brand,pipeline_status,pipeline_value,property_interest")
    .eq("id", contactId)
    .maybeSingle();

  if (contactResult.error || !contactResult.data) {
    return NextResponse.json({ error: contactResult.error?.message || "Contact not found" }, { status: 404 });
  }

  const existing = await supabase
    .from("real_estate_deals")
    .select("id,status")
    .eq("contact_id", contactId)
    .in("status", ["ACTIVE", "ON_HOLD"])
    .limit(1)
    .maybeSingle();

  if (existing.error && tableMissing(existing.error.message)) {
    return NextResponse.json({ error: "Closing-tabellen er ikke aktivert ennå", migration: "20260711070000_real_estate_deals.sql" }, { status: 503 });
  }
  if (existing.data) return NextResponse.json({ error: "Kontakten har allerede en aktiv closing-sak", dealId: existing.data.id }, { status: 409 });

  const contact = contactResult.data;
  const stage = normalizeClosingStage(body.stage || defaultStageForContact(contact.pipeline_status));
  const nextAction = cleanText(body.next_action, 1000) || recommendClosingAction({ stage, decision_makers: [], objections: [] });
  const payload = {
    contact_id: contactId,
    brand_id: cleanText(body.brand_id, 80) || contact.brand_id || contact.brand || "zeneco",
    title: cleanText(body.title, 240) || `${contact.name || contact.email || "Kunde"} – boligkjøp`,
    stage,
    status: "ACTIVE",
    property_refs: cleanStringList(body.property_refs),
    preferred_property_ref: cleanText(body.preferred_property_ref, 160),
    decision_makers: cleanStringList(body.decision_makers),
    objections: cleanStringList(body.objections),
    next_customer_decision: cleanText(body.next_customer_decision, 1000),
    next_action: nextAction,
    next_action_due_at: cleanText(body.next_action_due_at, 80) || tomorrowAtTen(),
    expected_closing_date: cleanText(body.expected_closing_date, 20),
    probability: Math.max(0, Math.min(100, safeNumber(body.probability, defaultProbabilityForStage(stage)) || 0)),
    risk_level: "MEDIUM",
    risk_reason: null,
    financing_status: cleanText(body.financing_status, 80) || "UNKNOWN",
    legal_status: cleanText(body.legal_status, 80) || "NOT_STARTED",
    reservation_status: cleanText(body.reservation_status, 80) || "NOT_STARTED",
    estimated_purchase_price: safeNumber(body.estimated_purchase_price, Number(contact.pipeline_value || 0) || null),
    expected_commission: safeNumber(body.expected_commission),
    notes: cleanText(body.notes, 10000),
    updated_at: new Date().toISOString(),
  };

  const risk = assessClosingRisk(payload);
  payload.risk_level = risk.level;
  payload.risk_reason = risk.reasons.join(" · ");

  const insert = await supabase.from("real_estate_deals").insert(payload).select().single();
  if (insert.error) return NextResponse.json({ error: insert.error.message }, { status: 500 });

  await supabase
    .from("contacts")
    .update({
      pipeline_status: pipelineStatusForClosingStage(stage),
      next_followup: payload.next_action_due_at,
      updated_at: new Date().toISOString(),
    })
    .eq("id", contactId);

  return NextResponse.json({ deal: decorateClosingDeal(insert.data), contact }, { status: 201 });
}

export async function PATCH(request: NextRequest) {
  const adminError = await requireAdminApi(request);
  if (adminError) return adminError;

  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  const body = await request.json().catch(() => ({}));
  const id = cleanText(body.id, 80);
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const currentResult = await supabase.from("real_estate_deals").select("*").eq("id", id).maybeSingle();
  if (currentResult.error || !currentResult.data) {
    return NextResponse.json({ error: currentResult.error?.message || "Deal not found" }, { status: 404 });
  }

  const current = currentResult.data;
  const updates: Record<string, unknown> = {};
  const textFields = [
    "brand_id",
    "title",
    "preferred_property_ref",
    "next_customer_decision",
    "next_action",
    "next_action_due_at",
    "expected_closing_date",
    "financing_status",
    "legal_status",
    "reservation_status",
    "notes",
  ];

  for (const field of textFields) {
    if (field in body) updates[field] = cleanText(body[field], field === "notes" ? 10000 : 1500);
  }
  if ("property_refs" in body) updates.property_refs = cleanStringList(body.property_refs);
  if ("decision_makers" in body) updates.decision_makers = cleanStringList(body.decision_makers);
  if ("objections" in body) updates.objections = cleanStringList(body.objections);
  if ("stage" in body) updates.stage = normalizeClosingStage(body.stage);
  if ("status" in body) updates.status = normalizeClosingStatus(body.status);
  if ("probability" in body) updates.probability = Math.max(0, Math.min(100, safeNumber(body.probability, 0) || 0));
  if ("estimated_purchase_price" in body) updates.estimated_purchase_price = safeNumber(body.estimated_purchase_price);
  if ("expected_commission" in body) updates.expected_commission = safeNumber(body.expected_commission);

  const merged = { ...current, ...updates };
  if ("stage" in body && !("probability" in body)) updates.probability = defaultProbabilityForStage(updates.stage);
  if (body.use_recommended_action === true) updates.next_action = recommendClosingAction(merged);

  const risk = assessClosingRisk({ ...merged, ...updates });
  updates.risk_level = risk.level;
  updates.risk_reason = risk.reasons.join(" · ");
  updates.updated_at = new Date().toISOString();

  const write = await supabase.from("real_estate_deals").update(updates).eq("id", id).select().single();
  if (write.error) return NextResponse.json({ error: write.error.message }, { status: 500 });

  const nextStage = normalizeClosingStage(write.data.stage);
  const contactUpdates: Record<string, unknown> = {
    next_followup: write.data.next_action_due_at || null,
    updated_at: new Date().toISOString(),
  };
  if (body.sync_contact_status !== false) {
    const pipelineStatus = pipelineStatusForClosingStage(nextStage);
    if (pipelineStatus !== "WON" || body.confirm_won === true) contactUpdates.pipeline_status = pipelineStatus;
  }
  await supabase.from("contacts").update(contactUpdates).eq("id", write.data.contact_id);

  return NextResponse.json({ deal: decorateClosingDeal(write.data) });
}
