

import { NextRequest, NextResponse } from "next/server";
import { requireBrandWorkspace } from "@/lib/workspaces/require-brand-workspace";
import {
  buildContactInteractionEvents,
  buildCustomerProfileCompleteness,
  buildCustomerTimeline,
  type CustomerTimelineEvent,
} from "@/lib/customer-360";
import { buildLinkedEmailTimelineEvents, buildNurtureTimelineEvents } from "@/lib/customer-communication-timeline";
import { buildCustomerSalesAdvice } from "@/lib/nexus/customer-sales-advisor";
import { extractLatestReplyText } from "@/services/email/latest-reply-text";

export const dynamic = "force-dynamic";
export const revalidate = 0;
const noStore = { "Cache-Control": "private, no-store" };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const pipelineStatuses = new Set(["NEW","CONTACT","QUALIFIED","MATCHING","VIEWING","NEGOTIATION","RESERVED","WON","LOST","ON_HOLD"]);

const CONTACT_COLUMNS = [
  "id","name","email","phone","type","pipeline_status","pipeline_value","property_interest",
  "company","notes","tags","sentiment","ai_auto_followup","last_ai_followup","interactions",
  "last_contact","next_followup","source","brand","brand_id","created_at","updated_at",
  "nurture_status","nurture_sequence","locale","waiting_on","waiting_reason","waiting_until",
  "do_not_contact","email_suppressed","unsubscribe_at","suppression_reason","lost_reason",
  "last_inbound_reply_at","last_reply_classification","preferred_location",
].join(",");

function fail(status: number, code: string, message?: string) {
  return NextResponse.json(
    { ok: false, error: { code, ...(message ? { message } : {}) } },
    { status, headers: noStore },
  );
}

function safeWrite(request: NextRequest) {
  const origin = request.headers.get("origin");
  return request.headers.get("content-type")?.toLowerCase().startsWith("application/json") &&
    (!origin || origin === new URL(request.url).origin) &&
    request.headers.get("sec-fetch-site") !== "cross-site";
}

function normalizeEmail(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

function dateValue(value: unknown) {
  const date = value ? new Date(String(value)) : null;
  return date && !Number.isNaN(date.getTime()) ? date.toISOString() : null;
}

function timelineEvent(
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

async function accessContact(
  request: NextRequest,
  brandKey: string,
  contactId: string,
  write: boolean,
) {
  if (!uuid.test(contactId)) return { value: null, response: fail(400, "INVALID_CONTACT") };
  const permission = brandKey === "zeneco"
    ? (write ? "crm.joint.write" : "crm.joint.read")
    : (write ? "crm.write" : "crm.read");
  const access = await requireBrandWorkspace(request, brandKey, permission);
  if (!access.value) return access;
  if (!access.value.verifiedUserId) return { value: null, response: fail(403, "STAFF_ONLY") };
  const { data: boundary, error } = await access.value.supabase.rpc("workspace_customer360_access", {
    p_brand_key: brandKey,
    p_user_id: access.value.verifiedUserId,
    p_email: access.value.verifiedEmail,
    p_contact_id: contactId,
    p_permission: permission,
  });
  if (error) return { value: null, response: fail(503, "CUSTOMER360_ACCESS_UNAVAILABLE") };
  if (!boundary) return { value: null, response: fail(403, "CUSTOMER360_ACCESS_DENIED") };
  const { data: contactResult, error: contactError } = await access.value.supabase
    .from("contacts").select(CONTACT_COLUMNS).eq("id", contactId).maybeSingle();
  if (contactError) return { value: null, response: fail(503, "CUSTOMER360_UNAVAILABLE") };
  const contact = contactResult as unknown as Record<string, any> | null;
  if (!contact || contact.brand_id !== brandKey || contact.brand !== brandKey) {
    return { value: null, response: fail(404, "CUSTOMER_NOT_FOUND") };
  }
  return { value: { ...access.value, contact, boundary }, response: null };
}

export async function GET(request: NextRequest, { params }: { params: { brandKey: string } }) {
  const contactId = String(new URL(request.url).searchParams.get("contactId") || "").trim();
  const access = await accessContact(request, params.brandKey, contactId, false);
  if (!access.value) return access.response;

  const { supabase, contact } = access.value;
  const warnings: string[] = [];
  const email = normalizeEmail(contact.email);

  const profileResult = await supabase.from("buyer_profiles")
    .select("id,brand,contact_id,version,status,purchase_readiness,budget_amount,budget_currency,budget_includes_costs,budget_approximate,location_flexible,summary,approved_at,created_at,updated_at")
    .eq("contact_id", contactId).order("updated_at", { ascending: false }).limit(10);
  if (profileResult.error) warnings.push("Kjøperprofil kunne ikke hentes.");
  const profiles = profileResult.data || [];
  const profileIds = profiles.map((row: any) => row.id);

  const [criteriaR, shortlistsR, workR, nurtureR, revenueR, linkedMailR, inboundMailR, outboundMailR, portalR] = await Promise.all([
    profileIds.length
      ? supabase.from("buyer_profile_criteria").select("*").in("buyer_profile_id", profileIds).eq("active", true).order("created_at")
      : Promise.resolve({ data: [], error: null }),
    profileIds.length
      ? supabase.from("lead_property_shortlists").select("id,brand,buyer_profile_id,status,title,approved_at,created_at,updated_at").in("buyer_profile_id", profileIds).order("created_at", { ascending: false }).limit(20)
      : Promise.resolve({ data: [], error: null }),
    supabase.from("work_items").select("id,title,status,priority,due_date,next_action,description,source_type,source_id,metadata,created_at,updated_at")
      .order("created_at", { ascending: false }).limit(500),
    supabase.from("lead_nurture_events").select("id,contact_id,brand_id,sequence_id,step_id,channel,subject,body_preview,status,dry_run,error,scheduled_for,sent_at,created_at")
      .eq("contact_id", contactId).order("created_at", { ascending: false }).limit(100),
    supabase.from("revenue_events").select("id,event_type,title,description,contact_id,brand_id,source_system,source_type,source_id,confidence_score,revenue_impact_eur,occurred_at,metadata,created_at")
      .eq("contact_id", contactId).eq("brand_id", params.brandKey).order("occurred_at", { ascending: false }).limit(100),
    supabase.from("email_messages")
      .select("id,brand_id,message_id,thread_id,direction,from_address,from_name,to_addresses,subject,body_text,body_html,ai_intent,ai_urgency,ai_sentiment,is_read,replied_at,received_at,created_at,crm_contact_id,matched_customer_id")
      .or(`crm_contact_id.eq.${contactId},matched_customer_id.eq.${contactId}`)
      .order("received_at", { ascending: false }).limit(150),
    email
      ? supabase.from("email_messages")
          .select("id,brand_id,message_id,thread_id,direction,from_address,from_name,to_addresses,subject,body_text,body_html,ai_intent,ai_urgency,ai_sentiment,is_read,replied_at,received_at,created_at,crm_contact_id,matched_customer_id")
          .eq("brand_id", params.brandKey).eq("direction", "inbound").ilike("from_address", email)
          .order("received_at", { ascending: false }).limit(150)
      : Promise.resolve({ data: [], error: null }),
    email
      ? supabase.from("email_messages")
          .select("id,brand_id,message_id,thread_id,direction,from_address,from_name,to_addresses,subject,body_text,body_html,ai_intent,ai_urgency,ai_sentiment,is_read,replied_at,received_at,created_at,crm_contact_id,matched_customer_id")
          .eq("brand_id", params.brandKey).eq("direction", "outbound").contains("to_addresses", [email])
          .order("received_at", { ascending: false }).limit(150)
      : Promise.resolve({ data: [], error: null }),
    email
      ? supabase.from("portal_messages").select("id,contact_id,email,brand_id,sender_type,body,created_at").eq("brand_id", params.brandKey).eq("email", email).order("created_at", { ascending: false }).limit(100)
      : supabase.from("portal_messages").select("id,contact_id,email,brand_id,sender_type,body,created_at").eq("brand_id", params.brandKey).eq("contact_id", contactId).order("created_at", { ascending: false }).limit(100),
  ]);

  const criteria = criteriaR.data || [];
  const shortlists = shortlistsR.data || [];
  const allWorkItems = workR.data || [];
  const workItems = allWorkItems.filter((item: any) =>
    String(item.source_id || "") === contactId ||
    String(item.metadata?.contact_id || "") === contactId ||
    (email && normalizeEmail(item.metadata?.email) === email));
  const nurtureEvents = nurtureR.data || [];
  const revenueEvents = revenueR.data || [];
  const portalMessages = portalR.data || [];

  const emailMap = new Map<string, any>();
  for (const row of [...(linkedMailR.data || []), ...(inboundMailR.data || []), ...(outboundMailR.data || [])]) {
    if (!row?.id || row.brand_id !== params.brandKey) continue;
    const rawBody = String(row.body_text || row.body_html || "").trim();
    const body = String(row.direction || "").toLowerCase() === "inbound"
      ? (extractLatestReplyText(rawBody) || rawBody)
      : rawBody;
    emailMap.set(String(row.id), { ...row, body_text: body.slice(0, 12000), body_html: null });
  }
  const messages = [...emailMap.values()].sort((a,b) =>
    new Date(String(b.received_at || b.created_at || 0)).getTime() -
    new Date(String(a.received_at || a.created_at || 0)).getTime()).slice(0,150);

  const shortlistIds = shortlists.map((row: any) => row.id);
  const itemsR = shortlistIds.length
    ? await supabase.from("lead_property_shortlist_items").select("*").in("shortlist_id", shortlistIds).order("rank")
    : { data: [], error: null };
  const shortlistsWithItems = shortlists.map((row: any) => ({
    ...row,
    items: (itemsR.data || []).filter((item: any) => item.shortlist_id === row.id),
  }));

  const activeProfile = profiles.find((row: any) => row.status === "approved") || profiles[0] || null;
  const activeCriteria = activeProfile ? criteria.filter((row: any) => row.buyer_profile_id === activeProfile.id) : [];
  const completeness = buildCustomerProfileCompleteness(contact, activeCriteria);
  const crmEvents = buildContactInteractionEvents(contact.interactions);
  const mailEvents = buildLinkedEmailTimelineEvents(messages);
  const nurtureTimeline = buildNurtureTimelineEvents(nurtureEvents);
  const timeline = buildCustomerTimeline([
    crmEvents,
    mailEvents,
    nurtureTimeline,
    portalMessages.map((row: any) => timelineEvent("portal", row, row.sender_type === "customer" ? "Melding fra kunden" : "Melding i Min side", row.body)).filter(Boolean) as CustomerTimelineEvent[],
    profiles.map((row: any) => timelineEvent("profile", row, `Kjøperprofil ${row.status || "opprettet"}`, row.summary)).filter(Boolean) as CustomerTimelineEvent[],
    shortlists.map((row: any) => timelineEvent("shortlist", row, `Shortlist ${row.status || ""}`, row.title)).filter(Boolean) as CustomerTimelineEvent[],
    workItems.map((row: any) => timelineEvent("task", row, `Oppgave: ${row.title}`, row.next_action || row.description)).filter(Boolean) as CustomerTimelineEvent[],
  ]).slice(0,150);

  const sent = messages.filter((row: any) => String(row.direction).toLowerCase() === "outbound");
  const replies = messages.filter((row: any) => String(row.direction).toLowerCase() === "inbound");
  const lastSentAt = sent[0]?.received_at || sent[0]?.created_at || null;
  const lastReplyAt = replies[0]?.received_at || replies[0]?.created_at || null;
  const communicationDialogue = {
    sentCount: sent.length,
    replyCount: replies.length,
    lastSentAt,
    lastReplyAt,
    awaitingReply: Boolean(lastSentAt && (!lastReplyAt || new Date(lastSentAt).getTime() > new Date(lastReplyAt).getTime())),
    manualTakeover: contact.email_suppressed === true && contact.suppression_reason === "manual_owner_takeover",
    emailBlocked: Boolean(contact.email_suppressed || contact.do_not_contact),
    blockedReason: contact.suppression_reason || (contact.do_not_contact ? "do_not_contact" : null),
    messages,
  };

  const salesIntelligence = buildCustomerSalesAdvice({
    contact,
    activeBuyerProfile: activeProfile,
    criteria: activeCriteria,
    shortlists: shortlistsWithItems,
    workItems,
    communicationDialogue,
    timeline,
    now: new Date(),
  });

  return NextResponse.json({
    ok: true,
    generatedAt: new Date().toISOString(),
    brand: params.brandKey,
    assignment: access.value.boundary,
    contact,
    completeness,
    buyerProfiles: profiles,
    activeBuyerProfile: activeProfile,
    criteria: activeCriteria,
    shortlists: shortlistsWithItems,
    workItems,
    revenueEvents,
    nurtureEvents,
    portalMessages,
    communicationDialogue,
    salesIntelligence,
    timeline,
    warnings,
  }, { headers: noStore });
}

export async function PATCH(request: NextRequest, { params }: { params: { brandKey: string } }) {
  if (!safeWrite(request)) return fail(403, "INVALID_REQUEST_ORIGIN");
  const body: any = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) return fail(400, "INVALID_UPDATE");
  const contactId = String(body.contactId || "").trim();
  const access = await accessContact(request, params.brandKey, contactId, true);
  if (!access.value) return access.response;

  const current = access.value.contact as Record<string, any>;
  const patch: Record<string, unknown> = {};
  const changed: string[] = [];

  const stringField = (key: string, max: number, nullable = true) => {
    if (!(key in body)) return;
    const value = String(body[key] ?? "").trim();
    if (value.length > max) throw new Error(key);
    patch[key] = value || (nullable ? null : "");
    if (String(current[key] ?? "") !== value) changed.push(key);
  };

  try {
    stringField("name", 140, false);
    stringField("phone", 60);
    stringField("property_interest", 500);
    stringField("preferred_location", 500);
    stringField("notes", 12000);
    if ("email" in body) {
      const email = normalizeEmail(body.email);
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail(400, "INVALID_EMAIL");
      patch.email = email || null;
      if (normalizeEmail(current.email) !== email) changed.push("email");
    }
    if ("pipeline_status" in body) {
      const status = String(body.pipeline_status || "").trim().toUpperCase();
      if (!pipelineStatuses.has(status)) return fail(400, "INVALID_PIPELINE_STATUS");
      patch.pipeline_status = status;
      if (String(current.pipeline_status || "").toUpperCase() !== status) changed.push("pipeline_status");
    }
    if ("next_followup" in body) {
      const value = body.next_followup ? dateValue(body.next_followup) : null;
      if (body.next_followup && !value) return fail(400, "INVALID_FOLLOWUP_DATE");
      patch.next_followup = value;
      if (String(current.next_followup || "") !== String(value || "")) changed.push("next_followup");
    }
    if ("do_not_contact" in body) {
      patch.do_not_contact = body.do_not_contact === true;
      if (Boolean(current.do_not_contact) !== Boolean(patch.do_not_contact)) changed.push("do_not_contact");
    }
  } catch {
    return fail(400, "INVALID_UPDATE");
  }

  if (!changed.length) return NextResponse.json({ ok: true, unchanged: true, contact: current }, { headers: noStore });

  const at = new Date().toISOString();
  const interaction = {
    id: crypto.randomUUID(),
    type: "customer_details_updated",
    date: at,
    direction: "internal",
    content: `Customer 360 oppdatert: ${changed.join(", ")}`,
    metadata: {
      source: "workspace-customer360",
      fields_changed: changed,
      performed_by: access.value.verifiedEmail,
      no_customer_contact: true,
    },
  };
  patch.interactions = [...(Array.isArray(current.interactions) ? current.interactions : []), interaction];
  patch.updated_at = at;

  const { data: updatedResult, error } = await access.value.supabase.from("contacts")
    .update(patch).eq("id", contactId).select(CONTACT_COLUMNS).single();
  const data = updatedResult as unknown as Record<string, any> | null;
  if (error || !data || data.brand_id !== params.brandKey || data.brand !== params.brandKey) {
    return fail(409, "CUSTOMER360_UPDATE_FAILED");
  }
  return NextResponse.json({ ok: true, contact: data, changed }, { headers: noStore });
}