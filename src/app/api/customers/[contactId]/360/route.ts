import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminApi } from "@/lib/api-admin";
import {
  buildContactInteractionEvents,
  buildCustomerProfileCompleteness,
  buildCustomerTimeline,
  buildRevenueTimelineEvents,
  type CustomerTimelineEvent,
} from "@/lib/customer-360";
import { recommendRevenueAction } from "@/lib/revenue/today";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

function normalizeEmail(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

function missingTable(message = "") {
  return /schema cache|does not exist|not find the table|relation .* does not exist/i.test(message);
}

function dateValue(value: unknown) {
  const date = new Date(String(value || ""));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function event(
  kind: CustomerTimelineEvent["kind"],
  row: Record<string, any>,
  title: string,
  detail?: string | null,
): CustomerTimelineEvent | null {
  const occurredAt = dateValue(row.created_at || row.updated_at || row.approved_at || row.published_at);
  if (!occurredAt) return null;
  return {
    id: String(row.id || `${kind}-${occurredAt}`),
    kind,
    title,
    detail: detail || null,
    occurredAt,
    direction: kind === "portal" && row.sender_type === "customer" ? "in" : "internal",
  };
}

function fulfilledData(result: PromiseSettledResult<any>, table: string, warnings: string[]) {
  if (result.status === "rejected") {
    warnings.push(`${table}: ${result.reason instanceof Error ? result.reason.message : "ukjent feil"}`);
    return [];
  }
  if (result.value?.error) {
    if (!missingTable(result.value.error.message || "")) warnings.push(`${table}: ${result.value.error.message}`);
    return [];
  }
  return result.value?.data || [];
}

export async function GET(
  request: NextRequest,
  { params }: { params: { contactId: string } },
) {
  const adminError = await requireAdminApi(request);
  if (adminError) return adminError;

  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  const contactId = String(params.contactId || "").trim();
  if (!contactId) return NextResponse.json({ error: "contactId is required" }, { status: 400 });

  const { data: contact, error: contactError } = await supabase
    .from("contacts")
    .select("*")
    .eq("id", contactId)
    .single();

  if (contactError || !contact) {
    return NextResponse.json({ error: contactError?.message || "Contact not found" }, { status: 404 });
  }

  const warnings: string[] = [];
  const email = normalizeEmail(contact.email);

  const profileResult = await supabase
    .from("buyer_profiles")
    .select("id,brand,contact_id,intake_id,version,status,purchase_readiness,budget_amount,budget_currency,budget_includes_costs,budget_approximate,location_flexible,summary,approved_by,approved_at,created_at,updated_at")
    .eq("contact_id", contactId)
    .order("updated_at", { ascending: false })
    .limit(10);

  const profiles = profileResult.error ? [] : profileResult.data || [];
  if (profileResult.error && !missingTable(profileResult.error.message)) warnings.push(`buyer_profiles: ${profileResult.error.message}`);
  const profileIds = profiles.map((row: any) => row.id);

  const queries = [
    profileIds.length
      ? supabase.from("buyer_profile_criteria").select("*").in("buyer_profile_id", profileIds).eq("active", true).order("created_at", { ascending: true })
      : Promise.resolve({ data: [], error: null }),
    profileIds.length
      ? supabase.from("lead_property_shortlists").select("id,brand,buyer_profile_id,status,title,approved_at,created_at,updated_at").in("buyer_profile_id", profileIds).order("created_at", { ascending: false }).limit(20)
      : Promise.resolve({ data: [], error: null }),
    profileIds.length
      ? supabase.from("lead_customer_presentations").select("id,brand,buyer_profile_id,shortlist_id,status,title,approved_at,created_at,updated_at").in("buyer_profile_id", profileIds).order("created_at", { ascending: false }).limit(20)
      : Promise.resolve({ data: [], error: null }),
    profileIds.length
      ? supabase.from("lead_customer_message_drafts").select("id,brand,buyer_profile_id,shortlist_id,presentation_id,status,subject,language,approved_at,created_at,updated_at").in("buyer_profile_id", profileIds).order("created_at", { ascending: false }).limit(20)
      : Promise.resolve({ data: [], error: null }),
    email
      ? supabase.from("portal_messages").select("*").eq("email", email).order("created_at", { ascending: false }).limit(100)
      : supabase.from("portal_messages").select("*").eq("contact_id", contactId).order("created_at", { ascending: false }).limit(100),
    supabase.from("portal_users").select("*").eq("contact_id", contactId).maybeSingle(),
    supabase.from("work_items").select("*").order("created_at", { ascending: false }).limit(250),
    supabase
      .from("revenue_events")
      .select("id,event_type,title,description,contact_id,brand_id,source_system,source_type,source_id,actor_type,confidence_score,revenue_impact_eur,occurred_at,metadata,created_at")
      .eq("contact_id", contactId)
      .order("occurred_at", { ascending: false })
      .limit(150),
  ];

  const [criteriaSettled, shortlistsSettled, presentationsSettled, draftsSettled, portalSettled, portalUserSettled, workItemsSettled, revenueEventsSettled] = await Promise.allSettled(queries);

  const criteria = fulfilledData(criteriaSettled, "buyer_profile_criteria", warnings);
  const shortlists = fulfilledData(shortlistsSettled, "lead_property_shortlists", warnings);
  const presentations = fulfilledData(presentationsSettled, "lead_customer_presentations", warnings);
  const drafts = fulfilledData(draftsSettled, "lead_customer_message_drafts", warnings);
  const portalMessages = fulfilledData(portalSettled, "portal_messages", warnings);
  const allWorkItems = fulfilledData(workItemsSettled, "work_items", warnings);
  const revenueEvents = fulfilledData(revenueEventsSettled, "revenue_events", warnings);

  let portalUser = null;
  if (portalUserSettled.status === "fulfilled") {
    if (portalUserSettled.value?.error) {
      if (!missingTable(portalUserSettled.value.error.message || "")) warnings.push(`portal_users: ${portalUserSettled.value.error.message}`);
    } else portalUser = portalUserSettled.value?.data || null;
  } else warnings.push(`portal_users: ${portalUserSettled.reason instanceof Error ? portalUserSettled.reason.message : "ukjent feil"}`);

  const workItems = allWorkItems.filter((item: any) => {
    const metadataEmail = normalizeEmail(item.metadata?.email);
    return String(item.source_id || "") === contactId
      || String(item.metadata?.contact_id || "") === contactId
      || (email && metadataEmail === email);
  });

  const shortlistIds = shortlists.map((row: any) => row.id);
  let shortlistItems: any[] = [];
  if (shortlistIds.length) {
    const itemResult = await supabase
      .from("lead_property_shortlist_items")
      .select("*")
      .in("shortlist_id", shortlistIds)
      .order("rank", { ascending: true });
    if (itemResult.error) {
      if (!missingTable(itemResult.error.message)) warnings.push(`lead_property_shortlist_items: ${itemResult.error.message}`);
    } else shortlistItems = itemResult.data || [];
  }

  const shortlistsWithItems = shortlists.map((shortlist: any) => ({
    ...shortlist,
    items: shortlistItems.filter((item: any) => item.shortlist_id === shortlist.id),
  }));

  const activeProfile = profiles.find((row: any) => row.status === "approved") || profiles[0] || null;
  const activeCriteria = activeProfile ? criteria.filter((row: any) => row.buyer_profile_id === activeProfile.id) : [];
  const completeness = buildCustomerProfileCompleteness(contact, activeCriteria);

  const timeline = buildCustomerTimeline([
    buildContactInteractionEvents(contact.interactions),
    portalMessages.map((row: any) => event("portal", row, row.sender_type === "customer" ? "Melding fra kunden" : "Melding i Min side", row.body)).filter(Boolean) as CustomerTimelineEvent[],
    profiles.map((row: any) => event("profile", row, `Kjøperprofil ${row.status === "approved" ? "godkjent" : "opprettet"}`, row.summary)).filter(Boolean) as CustomerTimelineEvent[],
    shortlists.map((row: any) => event("shortlist", row, `Shortlist ${row.status}`, row.title)).filter(Boolean) as CustomerTimelineEvent[],
    presentations.map((row: any) => event("presentation", row, `Presentasjon ${row.status}`, row.title)).filter(Boolean) as CustomerTimelineEvent[],
    drafts.map((row: any) => event("draft", row, `Meldingsutkast ${row.status}`, row.subject)).filter(Boolean) as CustomerTimelineEvent[],
    workItems.map((row: any) => event("task", row, `Oppgave: ${row.title}`, row.next_action || row.description)).filter(Boolean) as CustomerTimelineEvent[],
    buildRevenueTimelineEvents(revenueEvents),
  ]).slice(0, 150);

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    contact,
    brandId: String(contact.brand_id || contact.brand || activeProfile?.brand || "zeneco"),
    recommendedAction: recommendRevenueAction(contact),
    completeness,
    buyerProfiles: profiles,
    activeBuyerProfile: activeProfile,
    criteria: activeCriteria,
    shortlists: shortlistsWithItems,
    presentations,
    messageDrafts: drafts,
    portalUser,
    portalMessages,
    workItems,
    revenueEvents,
    timeline,
    warnings,
  });
}
