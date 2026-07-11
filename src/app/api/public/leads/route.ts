import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { isLikelyBot } from "@/lib/spam";
import {
  PUBLIC_REAL_ESTATE_BRAND_LABELS,
  resolvePublicLeadBrand,
} from "@/lib/realty/public-lead-brand";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function cleanText(value: unknown, max = 2000) {
  return String(value || "").trim().slice(0, max);
}

function interactionSummary(params: {
  source: string;
  brandLabel: string;
  requestType: string;
  preferredArea: string;
  budget: string;
  timeline: string;
  propertyRef: string;
  propertyTitle: string;
  message: string;
}) {
  return [
    `Ny aktivitet fra ${params.source || "nettside"}`,
    `Brand: ${params.brandLabel}`,
    params.requestType ? `Forespørsel: ${params.requestType}` : "",
    params.propertyRef || params.propertyTitle ? `Bolig: ${[params.propertyRef, params.propertyTitle].filter(Boolean).join(" - ")}` : "",
    params.preferredArea ? `Område: ${params.preferredArea}` : "",
    params.budget ? `Budsjett: ${params.budget}` : "",
    params.timeline ? `Tidslinje: ${params.timeline}` : "",
    params.message ? `Melding: ${params.message}` : "",
  ].filter(Boolean).join("\n");
}

export async function POST(request: NextRequest) {
  const expectedKey = process.env.ZENECO_API_KEY || process.env.REALTYFLOW_PUBLIC_LEAD_KEY;
  const providedKey = request.headers.get("x-realtyflow-source-key") || "";
  if (expectedKey && providedKey !== expectedKey) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  if (body.website || body.company || body.url) {
    return NextResponse.json({ success: true, accepted: false });
  }

  const name = cleanText(body.name, 160);
  const email = cleanText(body.email, 200).toLowerCase();
  if (!name || !email || !isEmail(email)) {
    return NextResponse.json({ error: "Valid name and email are required" }, { status: 400 });
  }

  // Avvis åpenbar bot/spam stille (samme svar som honeypot), så søppel ikke
  // havner i CRM og forurenser nurture/avsenderomdømme.
  if (isLikelyBot(name, email)) {
    return NextResponse.json({ success: true, accepted: false });
  }

  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "No DB" }, { status: 500 });

  const rawSource = cleanText(body.source, 120);
  const requestedBrand = cleanText(
    request.headers.get("x-realtyflow-brand") || body.brand_id || body.brandId || body.brand,
    120,
  );
  const brandId = resolvePublicLeadBrand(requestedBrand, rawSource);
  const brandLabel = PUBLIC_REAL_ESTATE_BRAND_LABELS[brandId];
  const source = rawSource || `${brandId}-public-lead`;
  const pageUrl = cleanText(body.page_url || body.pageUrl, 600);
  const propertyRef = cleanText(body.property_ref || body.propertyRef, 120);
  const propertyTitle = cleanText(body.property_title || body.propertyTitle, 240);
  const preferredArea = cleanText(body.preferred_area || body.preferredArea, 160);
  const budget = cleanText(body.budget, 80);
  const timeline = cleanText(body.timeline, 120);
  const requestType = cleanText(body.request_type || body.requestType, 120);
  const message = cleanText(body.message, 3000);
  const rawNotes = cleanText(body.notes, 5000);
  const incomingPropertyInterest = cleanText(body.property_interest || body.propertyInterest, 400);
  const incomingPipelineValue = Number(body.pipeline_value || body.pipelineValue || 0) || 0;
  const pipelineValue = incomingPipelineValue || (budget ? Number(budget.replace(/[^0-9]/g, "")) || 0 : 0);

  const notes = [
    `Brand: ${brandLabel}`,
    requestType ? `Forespørsel: ${requestType}` : "",
    pageUrl ? `Side: ${pageUrl}` : "",
    propertyRef ? `Boligref: ${propertyRef}` : "",
    propertyTitle ? `Bolig: ${propertyTitle}` : "",
    preferredArea ? `Område: ${preferredArea}` : "",
    budget ? `Budsjett: ${budget}` : "",
    body.property_type ? `Boligtype: ${cleanText(body.property_type, 120)}` : "",
    body.bedrooms ? `Soverom: ${cleanText(body.bedrooms, 40)}` : "",
    timeline ? `Tidslinje: ${timeline}` : "",
    body.utm_source || body.utm_campaign ? `UTM: ${cleanText(body.utm_source, 80)} / ${cleanText(body.utm_campaign, 120)}` : "",
    message,
    rawNotes,
  ].filter(Boolean).join("\n");

  const now = new Date().toISOString();
  const { data: existing } = await supabase
    .from("contacts")
    .select("id,notes,interactions,pipeline_status,brand_id,brand")
    .eq("email", email)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const incomingInteraction = {
    id: `website-${Date.now()}`,
    type: "note",
    content: interactionSummary({ source, brandLabel, requestType, preferredArea, budget, timeline, propertyRef, propertyTitle, message }),
    date: now,
    direction: "in",
    brand_id: brandId,
  };
  const existingInteractions = Array.isArray(existing?.interactions) ? existing.interactions : [];
  const existingStatus = String(existing?.pipeline_status || "");
  const nextStatus = existingStatus && !["LOST", "ON_HOLD"].includes(existingStatus) ? existingStatus : "NEW";
  const mergedNotes = [notes, existing?.notes ? `Tidligere notater:\n${existing.notes}` : ""].filter(Boolean).join("\n\n---\n\n");
  // Preserve the canonical contact brand for existing customers. The incoming
  // brand is still captured on the interaction and work item so cross-brand
  // activity is visible without silently moving the customer between brands.
  const canonicalBrandId = existing?.id
    ? resolvePublicLeadBrand(existing.brand_id || existing.brand, source)
    : brandId;

  const contactPayload = {
    name,
    email,
    phone: cleanText(body.phone, 80) || null,
    source,
    notes: mergedNotes,
    pipeline_status: nextStatus,
    pipeline_value: pipelineValue,
    property_interest: [propertyRef, propertyTitle].filter(Boolean).join(" - ") || incomingPropertyInterest || preferredArea,
    brand: canonicalBrandId,
    brand_id: canonicalBrandId,
    last_contact: now,
    next_followup: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    interactions: [incomingInteraction, ...existingInteractions],
    updated_at: now,
  };

  const write = existing?.id
    ? supabase.from("contacts").update(contactPayload).eq("id", existing.id).select().single()
    : supabase.from("contacts").insert({ ...contactPayload, created_at: now }).select().single();

  const { data, error } = await write;

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await supabase.from("work_items").insert({
    title: `${existing?.id ? "Ny aktivitet fra" : `Ny ${brandLabel}-lead:`} ${name}`,
    description: `${email}${preferredArea || incomingPropertyInterest ? ` · ${preferredArea || incomingPropertyInterest}` : ""}${budget || pipelineValue ? ` · ${budget || `€${pipelineValue}`}` : ""}`,
    status: "TO_DO",
    priority: pipelineValue >= 500000 || propertyRef ? "HIGH" : "MEDIUM",
    due_date: new Date().toISOString().slice(0, 10),
    brand_id: brandId,
    source_type: "website_lead",
    source_id: data.id,
    assigned_agent: "sales",
    next_action: existing?.id
      ? "Kunden har sendt ny info. Sjekk endringen og svar personlig i dag."
      : "Send personlig oppfølging og avklar område, budsjett og tidslinje.",
    ai_score: pipelineValue >= 500000 || propertyRef ? 86 : 68,
    metadata: {
      page_url: pageUrl,
      property_ref: propertyRef,
      timeline,
      email,
      brand_id: brandId,
      brand_label: brandLabel,
      canonical_contact_brand_id: canonicalBrandId,
      is_existing_contact: Boolean(existing?.id),
      created_from_public_endpoint: true,
    },
    created_at: now,
    updated_at: now,
  }).then(() => null);

  return NextResponse.json({ success: true, contact: data, brandId });
}
