import { createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminApi } from "@/lib/api-admin";
import { buildImportedLeadIntelligence, type ImportedLeadLike } from "@/lib/nexus-imported-lead-intelligence";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function text(value: unknown, max = 2000) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function sanitizeImportedLead(value: unknown): ImportedLeadLike | null {
  if (!isRecord(value)) return null;
  const preferences = isRecord(value.preferences) ? value.preferences : null;
  return {
    type: text(value.type, 80) || null,
    property_interest: text(value.property_interest, 2000) || null,
    notes: text(value.notes, 5000) || null,
    preferences: preferences
      ? {
          property_type: text(preferences.property_type, 120) || null,
          location: text(preferences.location, 500) || null,
          features: Array.isArray(preferences.features) ? preferences.features.slice(0, 50).map((item) => text(item, 120)).filter(Boolean) : [],
          other: Array.isArray(preferences.other) ? preferences.other.slice(0, 50).map((item) => text(item, 240)).filter(Boolean) : [],
        }
      : null,
  };
}

function fingerprint(input: Record<string, unknown>) {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex").slice(0, 24);
}

export async function POST(request: NextRequest) {
  const denied = await requireAdminApi(request);
  if (denied) return denied;

  const body = await request.json().catch(() => ({}));
  const contactId = text(body?.contactId, 120);
  const lead = sanitizeImportedLead(body?.lead);
  if (!contactId) return NextResponse.json({ error: "contactId required" }, { status: 400 });
  if (!lead) return NextResponse.json({ error: "lead object required" }, { status: 400 });

  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });

  const contactResult = await supabase
    .from("contacts")
    .select("id,name,email,brand_id,brand,pipeline_status")
    .eq("id", contactId)
    .maybeSingle();
  if (contactResult.error) return NextResponse.json({ error: contactResult.error.message }, { status: 500 });
  if (!contactResult.data) return NextResponse.json({ error: "Contact not found" }, { status: 404 });

  const rawText = text(body?.rawText, 12000);
  const formType = text(body?.formType, 80) || "other";
  const extractionConfidence = text(body?.confidence, 40) || "unknown";
  const intelligence = buildImportedLeadIntelligence(lead);
  const intakeFingerprint = fingerprint({ contactId, lead, rawText, formType });
  const sourceId = `buyer-intake:${contactId}:${intakeFingerprint}`;

  const existing = await supabase
    .from("work_items")
    .select("id,status,metadata")
    .eq("source_type", "ai_agent")
    .eq("source_id", sourceId)
    .limit(1)
    .maybeSingle();
  if (existing.error) return NextResponse.json({ error: existing.error.message }, { status: 500 });
  if (existing.data?.id) {
    return NextResponse.json({
      ok: true,
      duplicate: true,
      workItem: existing.data,
      buyerIntelligence: intelligence,
      safety: { buyerProfileUpdated: false, crmPreferencesUpdated: false, externalActionExecuted: false },
    });
  }

  const contact = contactResult.data;
  const inserted = await supabase
    .from("work_items")
    .insert({
      title: `Review Buyer Intake: ${text(contact.name, 160) || "CRM lead"}`,
      description: "Skjema/bilde er analysert. Review dokumenterte persona- og livsstilssignaler før de eventuelt lagres i en versjonert Buyer Profile.",
      status: "TO_DO",
      priority: intelligence.lifestyleCandidates.length || intelligence.personaCandidates.length ? "HIGH" : "MEDIUM",
      brand_id: contact.brand_id || contact.brand || null,
      source_type: "ai_agent",
      source_id: sourceId,
      assigned_agent: "nexus_buyer_intelligence",
      next_action: "Bekreft fakta mot skjemaet, godkjenn relevante Buyer Lifestyle-kriterier og opprett/oppdater Buyer Profile før matching.",
      ai_score: intelligence.lifestyleCandidates.length || intelligence.personaCandidates.length ? 88 : 65,
      metadata: {
        kind: "buyer_intake_review",
        contact_id: contactId,
        pipeline_status: contact.pipeline_status || null,
        form_type: formType,
        extraction_confidence: extractionConfidence,
        raw_text: rawText.slice(0, 8000),
        imported_lead: lead,
        buyer_intelligence: intelligence,
        intake_fingerprint: intakeFingerprint,
        buyer_profile_updated: false,
        crm_preferences_updated: false,
        external_action_executed: false,
      },
    })
    .select("id,title,status,priority,metadata,created_at")
    .single();

  if (inserted.error || !inserted.data) {
    return NextResponse.json({ error: inserted.error?.message || "Could not create Buyer Intake review" }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    duplicate: false,
    workItem: inserted.data,
    buyerIntelligence: intelligence,
    safety: { buyerProfileUpdated: false, crmPreferencesUpdated: false, externalActionExecuted: false },
  });
}
