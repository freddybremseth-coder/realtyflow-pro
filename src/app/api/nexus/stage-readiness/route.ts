import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/api-admin";
import { getServiceSupabase } from "@/services/marketing/campaign-production";

export const dynamic = "force-dynamic";

const ACTIVE_STAGES = ["QUALIFIED", "MATCHING", "VIEWING"];

function upper(value: unknown) {
  return String(value || "").trim().toUpperCase();
}

export async function GET(request: NextRequest) {
  const denied = await requireAdminApi(request);
  if (denied) return denied;

  const supabase = getServiceSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  const contactsR = await supabase
    .from("contacts")
    .select("id,name,email,brand_id,brand,pipeline_status,pipeline_value,updated_at,email_suppressed,do_not_contact")
    .in("pipeline_status", ACTIVE_STAGES)
    .eq("do_not_contact", false)
    .eq("email_suppressed", false)
    .order("updated_at", { ascending: false })
    .limit(3000);

  if (contactsR.error) return NextResponse.json({ error: contactsR.error.message }, { status: 500 });
  const contacts = contactsR.data || [];
  const contactIds = contacts.map((row: any) => row.id);

  const profilesR = contactIds.length
    ? await supabase
        .from("buyer_profiles")
        .select("id,contact_id,status,purchase_readiness,summary,updated_at")
        .in("contact_id", contactIds)
        .order("updated_at", { ascending: false })
        .limit(5000)
    : { data: [], error: null } as any;

  if (profilesR.error) return NextResponse.json({ error: profilesR.error.message }, { status: 500 });
  const profiles = profilesR.data || [];
  const profileIds = profiles.map((row: any) => row.id);

  const [criteriaR, shortlistsR] = await Promise.all([
    profileIds.length
      ? supabase.from("buyer_profile_criteria").select("id,buyer_profile_id,active,approval_status,customer_confirmed").in("buyer_profile_id", profileIds).eq("active", true).limit(10000)
      : Promise.resolve({ data: [], error: null }),
    profileIds.length
      ? supabase.from("lead_property_shortlists").select("id,buyer_profile_id,status,approved_at,archived_at,updated_at").in("buyer_profile_id", profileIds).is("archived_at", null).order("updated_at", { ascending: false }).limit(5000)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (criteriaR.error) return NextResponse.json({ error: criteriaR.error.message }, { status: 500 });
  if (shortlistsR.error) return NextResponse.json({ error: shortlistsR.error.message }, { status: 500 });

  const criteria = criteriaR.data || [];
  const shortlists = shortlistsR.data || [];
  const shortlistIds = shortlists.map((row: any) => row.id);
  const itemsR = shortlistIds.length
    ? await supabase
        .from("lead_property_shortlist_items")
        .select("id,shortlist_id,decision,system_eligibility,score")
        .in("shortlist_id", shortlistIds)
        .limit(20000)
    : { data: [], error: null } as any;

  if (itemsR.error) return NextResponse.json({ error: itemsR.error.message }, { status: 500 });
  const items = itemsR.data || [];

  const profilesByContact = new Map<string, any[]>();
  for (const profile of profiles) {
    const key = String((profile as any).contact_id || "");
    if (!key) continue;
    const bucket = profilesByContact.get(key) || [];
    bucket.push(profile);
    profilesByContact.set(key, bucket);
  }

  const criteriaByProfile = new Map<string, any[]>();
  for (const criterion of criteria) {
    const key = String((criterion as any).buyer_profile_id || "");
    const bucket = criteriaByProfile.get(key) || [];
    bucket.push(criterion);
    criteriaByProfile.set(key, bucket);
  }

  const shortlistsByProfile = new Map<string, any[]>();
  for (const shortlist of shortlists) {
    const key = String((shortlist as any).buyer_profile_id || "");
    const bucket = shortlistsByProfile.get(key) || [];
    bucket.push(shortlist);
    shortlistsByProfile.set(key, bucket);
  }

  const itemsByShortlist = new Map<string, any[]>();
  for (const item of items) {
    const key = String((item as any).shortlist_id || "");
    const bucket = itemsByShortlist.get(key) || [];
    bucket.push(item);
    itemsByShortlist.set(key, bucket);
  }

  const rows = contacts.map((contact: any) => {
    const stage = upper(contact.pipeline_status);
    const contactProfiles = profilesByContact.get(String(contact.id)) || [];
    const profile = contactProfiles.find((row: any) => upper(row.status) === "APPROVED") || contactProfiles[0] || null;
    const profileCriteria = profile ? criteriaByProfile.get(String(profile.id)) || [] : [];
    const profileShortlists = profile ? shortlistsByProfile.get(String(profile.id)) || [] : [];
    const latestShortlist = profileShortlists[0] || null;
    const shortlistItems = latestShortlist ? itemsByShortlist.get(String(latestShortlist.id)) || [] : [];
    const interestedItems = shortlistItems.filter((item: any) => ["INTERESTED", "LIKE", "LIKED", "SELECTED"].includes(upper(item.decision)));

    let readiness = "DATA_QUALITY";
    let nextAction = "Åpne Customer 360 og kontroller pipeline-data.";
    let targetStage: string | null = null;

    if (stage === "QUALIFIED" && !profile) {
      readiness = "MISSING_BUYER_PROFILE";
      nextAction = "Opprett eller godkjenn buyer profile før boligmatching.";
      targetStage = "MATCHING";
    } else if (stage === "QUALIFIED" && upper(profile?.status) !== "APPROVED") {
      readiness = "PROFILE_NEEDS_APPROVAL";
      nextAction = "Gjennomgå og godkjenn buyer profile.";
      targetStage = "MATCHING";
    } else if (stage === "QUALIFIED" && profileCriteria.length === 0) {
      readiness = "MISSING_CRITERIA";
      nextAction = "Bekreft kjøpskriterier før shortlist genereres.";
      targetStage = "MATCHING";
    } else if (stage === "QUALIFIED" && !latestShortlist) {
      readiness = "READY_FOR_SHORTLIST";
      nextAction = "Generer personlig shortlist fra godkjent buyer profile.";
      targetStage = "MATCHING";
    } else if (stage === "QUALIFIED") {
      readiness = "READY_FOR_MATCHING";
      nextAction = "Shortlist finnes. Gjennomgå den og flytt kunden til MATCHING når den er klar.";
      targetStage = "MATCHING";
    } else if (stage === "MATCHING" && !latestShortlist) {
      readiness = "MATCHING_WITHOUT_SHORTLIST";
      nextAction = "Generer eller gjenopprett shortlist før videre oppfølging.";
      targetStage = "VIEWING";
    } else if (stage === "MATCHING" && shortlistItems.length === 0) {
      readiness = "EMPTY_SHORTLIST";
      nextAction = "Shortlisten er tom. Finn konkrete boliger før kundekontakt.";
      targetStage = "VIEWING";
    } else if (stage === "MATCHING" && interestedItems.length === 0) {
      readiness = "AWAITING_PROPERTY_SIGNAL";
      nextAction = "Be kunden velge 1–2 boliger de ønsker å gå videre med.";
      targetStage = "VIEWING";
    } else if (stage === "MATCHING") {
      readiness = "READY_FOR_VIEWING";
      nextAction = "Kunden har positive boligsignaler. Avtal visning eller neste konkrete steg.";
      targetStage = "VIEWING";
    } else if (stage === "VIEWING" && !latestShortlist) {
      readiness = "VIEWING_DATA_GAP";
      nextAction = "Visningsstatus mangler koblet shortlist. Dokumenter boligene i Customer 360.";
    } else if (stage === "VIEWING") {
      readiness = "VIEWING_ACTIVE";
      nextAction = "Registrer feedback etter visning og avklar neste steg mot NEGOTIATION eller ny matching.";
      targetStage = "NEGOTIATION";
    }

    return {
      contactId: contact.id,
      name: contact.name || contact.email || "Ukjent kunde",
      email: contact.email,
      brand: contact.brand_id || contact.brand,
      stage,
      pipelineValue: Number(contact.pipeline_value || 0),
      profile: profile ? { id: profile.id, status: profile.status, purchaseReadiness: profile.purchase_readiness } : null,
      criteriaCount: profileCriteria.length,
      shortlistCount: profileShortlists.length,
      shortlistItemCount: shortlistItems.length,
      interestedItemCount: interestedItems.length,
      readiness,
      nextAction,
      targetStage,
      href: `/customers?contactId=${encodeURIComponent(String(contact.id))}`,
    };
  });

  const counts = rows.reduce<Record<string, number>>((acc, row) => {
    acc[row.readiness] = (acc[row.readiness] || 0) + 1;
    return acc;
  }, {});

  const priority = rows
    .slice()
    .sort((a, b) => Number(b.pipelineValue || 0) - Number(a.pipelineValue || 0))
    .slice(0, 100);

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    counts,
    totals: {
      contacts: rows.length,
      qualified: rows.filter((row) => row.stage === "QUALIFIED").length,
      matching: rows.filter((row) => row.stage === "MATCHING").length,
      viewing: rows.filter((row) => row.stage === "VIEWING").length,
      missingBuyerProfile: rows.filter((row) => row.readiness === "MISSING_BUYER_PROFILE").length,
      readyForShortlist: rows.filter((row) => row.readiness === "READY_FOR_SHORTLIST").length,
      readyForViewing: rows.filter((row) => row.readiness === "READY_FOR_VIEWING").length,
    },
    rows: priority,
    note: "Stage Readiness er read-only beslutningsstøtte. Den oppretter ikke buyer profiles, shortlists, kundemeldinger eller pipeline-overganger automatisk.",
  });
}
