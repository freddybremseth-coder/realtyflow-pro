import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminApi } from "@/lib/api-admin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const PROMOTABLE = new Set([
  "QUALIFIED",
  "CONTACT_READY",
  "CONTACTED",
  "ENGAGED",
  "MEETING",
  "OPPORTUNITY",
]);

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key
    ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
    : null;
}

function noteLines(prospect: Record<string, any>) {
  return [
    "Zen Corporate Homes · B2B prospect promoted to CRM.",
    prospect.organization_number ? `Org.nr.: ${prospect.organization_number}` : null,
    prospect.domain ? `Domene: ${prospect.domain}` : null,
    prospect.industry ? `Bransje: ${prospect.industry}` : null,
    prospect.employee_count !== null && prospect.employee_count !== undefined
      ? `Ansatte: ${prospect.employee_count}`
      : null,
    prospect.member_count !== null && prospect.member_count !== undefined
      ? `Medlemmer: ${prospect.member_count}`
      : null,
    `Corporate fit: ${prospect.fit_tier || "UNSCORED"} · ${prospect.fit_score || 0}/100`,
    prospect.source_url ? `Kilde: ${prospect.source_url}` : null,
    "Automatisk nurture er pauset. Første kundekontakt skal være eksplisitt og personlig.",
  ].filter(Boolean).join("\n");
}

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const denied = await requireAdminApi(request, { contact: null });
  if (denied) return denied;

  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  const { id } = await context.params;
  const { data: prospect, error: prospectError } = await supabase
    .from("corporate_prospects")
    .select("*")
    .eq("id", id)
    .eq("brand_id", "zeneco")
    .maybeSingle();

  if (prospectError) return NextResponse.json({ error: prospectError.message }, { status: 500 });
  if (!prospect) return NextResponse.json({ error: "Prospect not found" }, { status: 404 });

  if (prospect.converted_contact_id) {
    const { data: existingContact } = await supabase
      .from("contacts")
      .select("id,name,email,company,pipeline_status,brand_id")
      .eq("id", prospect.converted_contact_id)
      .maybeSingle();
    return NextResponse.json({ contact: existingContact, prospect, alreadyPromoted: true });
  }

  const status = String(prospect.status || "DISCOVERED").toUpperCase();
  if (!PROMOTABLE.has(status)) {
    return NextResponse.json(
      { error: "Prospektet må være kvalifisert før det promoteres til CRM." },
      { status: 409 },
    );
  }

  const { data: decisionMakers, error: decisionMakerError } = await supabase
    .from("corporate_prospect_contacts")
    .select("*")
    .eq("prospect_id", id)
    .in("status", ["VERIFIED", "CONTACT_READY"])
    .order("is_primary", { ascending: false })
    .order("updated_at", { ascending: false })
    .limit(10);

  if (decisionMakerError) {
    return NextResponse.json({ error: decisionMakerError.message }, { status: 500 });
  }

  const primary = (decisionMakers || [])[0] || null;
  const email = String(primary?.email || "").trim().toLowerCase();
  const phone = String(primary?.phone || "").trim();
  const contactName = String(primary?.name || prospect.company_name || "").trim();
  const companyName = String(prospect.company_name || "").trim();

  let existingContact: any = null;
  if (email) {
    const { data } = await supabase
      .from("contacts")
      .select("*")
      .eq("brand_id", "zeneco")
      .eq("email", email)
      .maybeSingle();
    existingContact = data;
  }

  if (!existingContact) {
    const { data } = await supabase
      .from("contacts")
      .select("*")
      .eq("brand_id", "zeneco")
      .eq("source", "corporate-prospect")
      .eq("company", companyName)
      .maybeSingle();
    existingContact = data;
  }

  let contact = existingContact;
  if (!contact) {
    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from("contacts")
      .insert({
        name: contactName || companyName,
        email,
        phone,
        company: companyName,
        type: "buyer",
        pipeline_status: "QUALIFIED",
        pipeline_value: 0,
        property_interest: "Zen Corporate Homes · Bedriftshytte / medlemsbolig i Spania",
        notes: noteLines(prospect),
        tags: ["corporate-homes", "b2b", "corporate-prospect"],
        sentiment: "neutral",
        ai_auto_followup: false,
        source: "corporate-prospect",
        brand: "zeneco",
        brand_id: "zeneco",
        nurture_status: "paused",
        locale: "nb-NO",
        preferred_location: "Costa Blanca / åpen for forslag",
        created_at: now,
        updated_at: now,
      })
      .select("*")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    contact = data;
  }

  const now = new Date().toISOString();
  const { data: updatedProspect, error: updateError } = await supabase
    .from("corporate_prospects")
    .update({
      converted_contact_id: contact.id,
      next_action: prospect.next_action || "Identifiser buying committee og gjennomfør Corporate Homes B2B discovery.",
      updated_at: now,
    })
    .eq("id", id)
    .eq("brand_id", "zeneco")
    .select("*")
    .single();

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  const { data: existingWorkItem } = await supabase
    .from("work_items")
    .select("id")
    .eq("brand_id", "zeneco")
    .eq("source_type", "corporate_prospect_promotion")
    .eq("source_id", id)
    .maybeSingle();

  if (!existingWorkItem?.id) {
    await supabase.from("work_items").insert({
      title: `Corporate Homes · ${companyName}`,
      description: "Kvalifisert B2B-prospekt er promotert til CRM. Bygg buying committee og avklar beslutningsprosess før boligmatching.",
      status: "TO_DO",
      priority: String(prospect.fit_tier || "").toUpperCase() === "A" ? "HIGH" : "MEDIUM",
      brand_id: "zeneco",
      source_type: "corporate_prospect_promotion",
      source_id: id,
      next_action: "Identifiser beslutningstaker(e), avklar brukere, mål, budsjett, tidslinje og styre-/ledelsesprosess.",
      ai_score: Math.max(70, Number(prospect.fit_score || 0)),
      metadata: {
        segment: "corporate_homes",
        prospect_id: id,
        contact_id: contact.id,
        fit_tier: prospect.fit_tier,
        fit_score: prospect.fit_score,
        source_url: prospect.source_url || null,
      },
      created_at: now,
      updated_at: now,
    });
  }

  return NextResponse.json({
    contact,
    prospect: updatedProspect,
    alreadyPromoted: Boolean(existingContact),
    automation: {
      nurture_status: "paused",
      ai_auto_followup: false,
      note: "Ingen automatisk utsendelse ble startet.",
    },
  });
}
