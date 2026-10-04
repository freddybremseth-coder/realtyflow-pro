import { NextRequest, NextResponse } from "next/server";
import { requireBrandWorkspace } from "@/lib/workspaces/require-brand-workspace";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const noStore = { "Cache-Control": "private, no-store" };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function fail(status: number, code: string, message?: string) {
  return NextResponse.json({ ok: false, error: { code, message } }, { status, headers: noStore });
}

function safeWrite(request: NextRequest) {
  const origin = request.headers.get("origin");
  return request.headers.get("content-type")?.toLowerCase().startsWith("application/json") &&
    (!origin || origin === new URL(request.url).origin) &&
    request.headers.get("sec-fetch-site") !== "cross-site";
}

function clean(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function nullable(value: unknown, max: number) {
  const result = clean(value, max);
  return result || null;
}

function cleanEmail(value: unknown) {
  const result = clean(value, 254).toLowerCase();
  return result && emailPattern.test(result) ? result : null;
}

function cleanUrl(value: unknown, linkedinOnly = false) {
  const result = clean(value, 800);
  if (!result) return null;
  try {
    const parsed = new URL(result);
    if (!["https:", "http:"].includes(parsed.protocol)) return null;
    if (linkedinOnly && !/(^|\.)linkedin\.com$/i.test(parsed.hostname)) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

function stringList(value: unknown, maxItems = 12, maxLength = 120) {
  if (!Array.isArray(value)) return [];
  return value
    .map(item => clean(item, maxLength))
    .filter(Boolean)
    .slice(0, maxItems);
}

async function loadAccount(supabase: any, prospectId: string) {
  const [
    prospectResult,
    strategyResult,
    contactsResult,
    touchpointsResult,
    enrichmentResult,
  ] = await Promise.all([
    supabase.from("corporate_prospects")
      .select("id,company_name,organization_number,domain,organization_type,country_code,city,industry,employee_count,employee_band,member_count,website_url,linkedin_company_url,status,fit_score,fit_tier,fit_reasons,evidence_gaps,decision_roles,source_url,evidence,next_action,next_followup,updated_at")
      .eq("id", prospectId).eq("brand_id", "zeneco").maybeSingle(),
    supabase.from("corporate_account_strategies")
      .select("*").eq("prospect_id", prospectId).maybeSingle(),
    supabase.from("corporate_prospect_contacts")
      .select("id,name,title,buying_role,seniority,email,phone,linkedin_url,source_url,confidence,status,is_primary,relationship_status,influence_level,professional_relevance,professional_topics,linkedin_following,linkedin_last_touched_at,verified_at,updated_at")
      .eq("prospect_id", prospectId)
      .order("is_primary", { ascending: false })
      .order("updated_at", { ascending: false }),
    supabase.from("corporate_account_touchpoints")
      .select("id,contact_id,channel,activity_type,status,direction,owner_email,due_at,completed_at,summary,external_url,metadata,created_by_email,updated_at")
      .eq("prospect_id", prospectId)
      .order("due_at", { ascending: true, nullsFirst: false })
      .limit(120),
    supabase.from("corporate_account_enrichment")
      .select("id,provider,data_kind,provider_record_id,source_url,payload,fetched_at,verified_at,verified_by_email")
      .eq("prospect_id", prospectId)
      .order("fetched_at", { ascending: false })
      .limit(60),
  ]);

  const error = prospectResult.error || strategyResult.error || contactsResult.error ||
    touchpointsResult.error || enrichmentResult.error;
  if (error) return { error };
  if (!prospectResult.data) return { notFound: true };

  return {
    data: {
      prospect: prospectResult.data,
      strategy: strategyResult.data || null,
      contacts: contactsResult.data || [],
      touchpoints: touchpointsResult.data || [],
      enrichment: enrichmentResult.data || [],
      enrichmentCapabilities: {
        brreg: { available: true, mode: "company_open_data" },
        api1881: {
          available: Boolean(process.env.API1881_KEY || process.env.API_1881_KEY),
          mode: "licensed_provider",
          configured: Boolean(process.env.API1881_KEY || process.env.API_1881_KEY),
        },
        linkedin: {
          available: true,
          mode: "manual_relationship_channel",
          scraping: false,
          arbitraryProfileApiEnrichment: false,
        },
      },
    },
  };
}

export async function GET(
  request: NextRequest,
  { params }: { params: { brandKey: string; prospectId: string } },
) {
  if (params.brandKey !== "zeneco" || !uuid.test(params.prospectId)) return fail(404, "ACCOUNT_NOT_FOUND");

  const access = await requireBrandWorkspace(request, params.brandKey, "corporate.read");
  if (!access.value) return access.response;

  const account = await loadAccount(access.value.supabase, params.prospectId);
  if ("error" in account) return fail(503, "CORPORATE_ACCOUNT_UNAVAILABLE");
  if ("notFound" in account) return fail(404, "ACCOUNT_NOT_FOUND");

  return NextResponse.json({ ok: true, brand: params.brandKey, ...account.data }, { headers: noStore });
}

export async function POST(
  request: NextRequest,
  { params }: { params: { brandKey: string; prospectId: string } },
) {
  if (!safeWrite(request)) return fail(403, "INVALID_REQUEST_ORIGIN");
  if (params.brandKey !== "zeneco" || !uuid.test(params.prospectId)) return fail(404, "ACCOUNT_NOT_FOUND");

  const access = await requireBrandWorkspace(request, params.brandKey, "corporate.plan");
  if (!access.value) return access.response;

  const input: unknown = await request.json().catch(() => null);
  if (!input || typeof input !== "object" || Array.isArray(input)) return fail(400, "INVALID_REQUEST");
  const body = input as Record<string, unknown>;
  const action = clean(body.action, 40);

  const { data: prospect, error: prospectError } = await access.value.supabase
    .from("corporate_prospects")
    .select("id")
    .eq("id", params.prospectId)
    .eq("brand_id", "zeneco")
    .maybeSingle();
  if (prospectError) return fail(503, "CORPORATE_ACCOUNT_UNAVAILABLE");
  if (!prospect) return fail(404, "ACCOUNT_NOT_FOUND");

  const actorEmail = access.value.verifiedEmail;

  if (action === "save_strategy") {
    const stage = clean(body.stage, 40).toUpperCase() || "TARGET";
    const priority = clean(body.priority, 10).toUpperCase() || "P2";
    const linkedinMotion = clean(body.linkedinMotion, 40).toUpperCase() || "MANUAL_APPROVAL";
    if (![
      "TARGET","RESEARCH","STRATEGY_READY","OUTREACH","ENGAGED","MEETING",
      "BUSINESS_CASE","SHORTLIST","DECISION","NEGOTIATION","WON","LOST",
    ].includes(stage) || !["P1","P2","P3"].includes(priority) ||
      !["OFF","MANUAL_APPROVAL","RELATIONSHIP_ONLY"].includes(linkedinMotion)) {
      return fail(400, "INVALID_STRATEGY");
    }

    const estimatedValue = body.estimatedValueEur === null || body.estimatedValueEur === ""
      ? null : Number(body.estimatedValueEur);
    if (estimatedValue !== null && (!Number.isFinite(estimatedValue) || estimatedValue < 0 || estimatedValue > 100000000)) {
      return fail(400, "INVALID_ESTIMATED_VALUE");
    }

    const targetDate = clean(body.targetDate, 20);
    const nextReviewAt = clean(body.nextReviewAt, 40);
    if (targetDate && !/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) return fail(400, "INVALID_TARGET_DATE");
    if (nextReviewAt && Number.isNaN(Date.parse(nextReviewAt))) return fail(400, "INVALID_REVIEW_DATE");

    const payload = {
      prospect_id: params.prospectId,
      stage,
      priority,
      account_models: stringList(body.accountModels, 8, 80),
      objective: nullable(body.objective, 3000),
      entry_angle: nullable(body.entryAngle, 3000),
      first_offer: nullable(body.firstOffer, 3000),
      account_owner_email: cleanEmail(body.accountOwnerEmail),
      strategic_owner_email: cleanEmail(body.strategicOwnerEmail),
      estimated_value_eur: estimatedValue,
      target_date: targetDate || null,
      next_review_at: nextReviewAt ? new Date(nextReviewAt).toISOString() : null,
      notes: nullable(body.notes, 8000),
      linkedin_motion: linkedinMotion,
      updated_by_email: actorEmail,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await access.value.supabase
      .from("corporate_account_strategies")
      .upsert({ ...payload, created_by_email: actorEmail }, { onConflict: "prospect_id" })
      .select("*")
      .single();
    if (error || !data) return fail(409, "STRATEGY_SAVE_FAILED");

    return NextResponse.json({
      ok: true,
      strategy: data,
      externalAction: false,
      emailSent: false,
      linkedinMessageSent: false,
    }, { headers: noStore });
  }

  if (action === "save_contact") {
    const contactId = clean(body.contactId, 80);
    if (contactId && !uuid.test(contactId)) return fail(400, "INVALID_CONTACT");

    const name = clean(body.name, 180);
    const title = clean(body.title, 180);
    const email = cleanEmail(body.email);
    const phone = nullable(body.phone, 80);
    const linkedinUrl = cleanUrl(body.linkedinUrl, true);
    const sourceUrl = cleanUrl(body.sourceUrl);
    const relationshipStatus = clean(body.relationshipStatus, 40).toUpperCase() || "UNKNOWN";
    const influenceLevel = clean(body.influenceLevel, 40).toUpperCase() || "UNKNOWN";
    const status = clean(body.status, 40).toUpperCase() || "IDENTIFIED";
    const confidence = clean(body.confidence, 20).toUpperCase() || null;

    if (!name || !["UNKNOWN","NOT_CONTACTED","CONNECTED","ENGAGED","CHAMPION","BLOCKED"].includes(relationshipStatus) ||
      !["UNKNOWN","LOW","MEDIUM","HIGH","DECISION_MAKER"].includes(influenceLevel) ||
      !["IDENTIFIED","VERIFIED","CONTACT_READY","DO_NOT_CONTACT"].includes(status) ||
      (confidence && !["HIGH","MEDIUM","LOW"].includes(confidence))) {
      return fail(400, "INVALID_CONTACT");
    }
    if (status !== "IDENTIFIED" && status !== "DO_NOT_CONTACT" && !sourceUrl) {
      return fail(400, "SOURCE_REQUIRED_FOR_VERIFIED_CONTACT", "Verifiserte personopplysninger må ha en kilde.");
    }

    const payload = {
      prospect_id: params.prospectId,
      name,
      title: title || null,
      buying_role: nullable(body.buyingRole, 120),
      seniority: nullable(body.seniority, 80),
      email,
      phone,
      linkedin_url: linkedinUrl,
      source_url: sourceUrl,
      confidence,
      status,
      is_primary: body.isPrimary === true,
      relationship_status: relationshipStatus,
      influence_level: influenceLevel,
      professional_relevance: nullable(body.professionalRelevance, 2500),
      professional_topics: stringList(body.professionalTopics, 12, 100),
      linkedin_following: body.linkedinFollowing === true,
      linkedin_last_touched_at: body.linkedinLastTouchedAt && !Number.isNaN(Date.parse(String(body.linkedinLastTouchedAt)))
        ? new Date(String(body.linkedinLastTouchedAt)).toISOString() : null,
      verified_at: ["VERIFIED","CONTACT_READY"].includes(status) ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    };

    const query = contactId
      ? access.value.supabase.from("corporate_prospect_contacts").update(payload).eq("id", contactId).eq("prospect_id", params.prospectId)
      : access.value.supabase.from("corporate_prospect_contacts").insert(payload);
    const { data, error } = await query.select("*").single();
    if (error || !data) return fail(409, "CONTACT_SAVE_FAILED");

    return NextResponse.json({
      ok: true,
      contact: data,
      externalAction: false,
      linkedinProfileReadAutomatically: false,
    }, { headers: noStore });
  }

  if (action === "add_touchpoint") {
    const channel = clean(body.channel, 20).toUpperCase();
    const status = clean(body.status, 20).toUpperCase() || "PLANNED";
    const direction = clean(body.direction, 20).toUpperCase() || "OUTBOUND";
    const activityType = clean(body.activityType, 100);
    const contactId = clean(body.contactId, 80) || null;
    const dueAt = clean(body.dueAt, 40);
    const completedAt = clean(body.completedAt, 40);
    if (!["EMAIL","LINKEDIN","CALL","MEETING","OTHER"].includes(channel) ||
      !["PLANNED","COMPLETED","CANCELLED"].includes(status) ||
      !["OUTBOUND","INBOUND","INTERNAL"].includes(direction) ||
      !activityType || (contactId && !uuid.test(contactId)) ||
      (dueAt && Number.isNaN(Date.parse(dueAt))) ||
      (completedAt && Number.isNaN(Date.parse(completedAt)))) {
      return fail(400, "INVALID_TOUCHPOINT");
    }

    if (contactId) {
      const { data: contact } = await access.value.supabase.from("corporate_prospect_contacts")
        .select("id").eq("id", contactId).eq("prospect_id", params.prospectId).maybeSingle();
      if (!contact) return fail(400, "INVALID_CONTACT");
    }

    const { data, error } = await access.value.supabase.from("corporate_account_touchpoints").insert({
      prospect_id: params.prospectId,
      contact_id: contactId,
      channel,
      activity_type: activityType,
      status,
      direction,
      owner_email: cleanEmail(body.ownerEmail) || actorEmail,
      due_at: dueAt ? new Date(dueAt).toISOString() : null,
      completed_at: status === "COMPLETED"
        ? (completedAt ? new Date(completedAt).toISOString() : new Date().toISOString())
        : null,
      summary: nullable(body.summary, 4000),
      external_url: cleanUrl(body.externalUrl),
      metadata: {},
      created_by_email: actorEmail,
      updated_by_email: actorEmail,
    }).select("*").single();
    if (error || !data) return fail(409, "TOUCHPOINT_SAVE_FAILED");

    return NextResponse.json({
      ok: true,
      touchpoint: data,
      externalAction: false,
      emailSent: false,
      linkedinMessageSent: false,
    }, { status: 201, headers: noStore });
  }

  if (action === "complete_touchpoint") {
    const touchpointId = clean(body.touchpointId, 80);
    if (!uuid.test(touchpointId)) return fail(400, "INVALID_TOUCHPOINT");

    const { data, error } = await access.value.supabase.from("corporate_account_touchpoints")
      .update({
        status: "COMPLETED",
        completed_at: new Date().toISOString(),
        summary: nullable(body.summary, 4000),
        updated_by_email: actorEmail,
        updated_at: new Date().toISOString(),
      })
      .eq("id", touchpointId)
      .eq("prospect_id", params.prospectId)
      .select("*")
      .single();
    if (error || !data) return fail(404, "TOUCHPOINT_NOT_FOUND");

    return NextResponse.json({
      ok: true,
      touchpoint: data,
      externalAction: false,
    }, { headers: noStore });
  }

  return fail(400, "INVALID_ACTION");
}
