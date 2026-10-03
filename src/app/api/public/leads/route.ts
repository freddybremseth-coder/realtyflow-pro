import { createHmac } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { isLikelyBot } from "@/lib/spam";
import {
  PUBLIC_REAL_ESTATE_BRAND_LABELS,
  resolvePublicLeadBrand,
} from "@/lib/realty/public-lead-brand";
import {
  buildRevenueEventDedupeKey,
  insertRevenueEvent,
} from "@/lib/revenue/events";
import {
  normalizeCorporateProspect,
  rescoreCorporateProspect,
} from "@/lib/corporate-prospects";
import { sendBrandEmail } from "@/services/email/send-brand-email";

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

function portalOptInSecret() {
  return process.env.PORTAL_OPT_IN_SECRET
    || process.env.ZENECO_API_KEY
    || process.env.REALTYFLOW_PUBLIC_LEAD_KEY
    || "";
}

function portalOptInToken(contactId: string, email: string) {
  const secret = portalOptInSecret();
  if (!secret) return "";
  const payload = Buffer.from(JSON.stringify({
    contactId,
    email: email.toLowerCase(),
    exp: Date.now() + 7 * 24 * 60 * 60 * 1000,
  })).toString("base64url");
  const signature = createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

function publicBaseUrl() {
  return (process.env.REALTYFLOW_PUBLIC_URL || "https://realtyflow.chatgenius.pro").replace(/\/$/, "");
}

function leadReceiptCopy(input: {
  name: string;
  preferredArea: string;
  budget: string;
  portalLink?: string;
}) {
  const firstName = input.name.trim().split(/\s+/)[0] || input.name;
  const summary = [
    input.preferredArea ? `Område: ${input.preferredArea}` : "",
    input.budget ? `Budsjett: ${input.budget}` : "",
  ].filter(Boolean);
  const portalText = input.portalLink
    ? `\n\nVil du samle boligforslag, søkekriterier, guider, dokumenter og dialog på Min side? Aktiver den her:\n${input.portalLink}\n\nDu velger selv om du vil aktivere Min side.`
    : "";
  const portalHtml = input.portalLink
    ? `<p>Vil du samle boligforslag, søkekriterier, guider, dokumenter og dialog på <strong>Min side</strong>?</p><p><a href="${input.portalLink}">Aktiver Min side</a></p><p>Du velger selv om du vil aktivere Min side.</p>`
    : "";
  return {
    subject: "Vi har mottatt henvendelsen din | Zen Eco Homes",
    bodyText: `Hei ${firstName},\n\nTakk for henvendelsen. Skjemaet er mottatt hos Zen Eco Homes, og vi bruker opplysningene til å gi deg mer relevant oppfølging.${summary.length ? `\n\n${summary.join("\n")}` : ""}${portalText}\n\nMed vennlig hilsen\nZen Eco Homes`,
    bodyHtml: `<p>Hei ${firstName},</p><p>Takk for henvendelsen. Skjemaet er mottatt hos Zen Eco Homes, og vi bruker opplysningene til å gi deg mer relevant oppfølging.</p>${summary.length ? `<p>${summary.join("<br>")}</p>` : ""}${portalHtml}<p>Med vennlig hilsen<br>Zen Eco Homes</p>`,
  };
}

function cleanText(value: unknown, max = 2000) {
  return String(value || "").trim().slice(0, max);
}

function trackingFromPageUrl(value: string) {
  if (!value) return {} as Record<string, string>;
  try {
    const url = new URL(value);
    const out: Record<string, string> = {};
    for (const key of ["utm_source", "utm_medium", "utm_campaign", "utm_content", "publication_id", "visitor_id", "session_id"]) {
      const found = url.searchParams.get(key);
      if (found) out[key] = found;
    }
    return out;
  } catch {
    return {} as Record<string, string>;
  }
}

function positiveInteger(value: unknown) {
  const parsed = Number(String(value ?? "").replace(/\s/g, ""));
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : null;
}

function queryParamFromUrl(value: string, key: string) {
  if (!value) return "";
  try {
    return new URL(value).searchParams.get(key) || "";
  } catch {
    return "";
  }
}

function budgetRange(value: string) {
  const values = (value.match(/\d[\d\s.]*/g) || [])
    .map((part) => Number(part.replace(/[\s.]/g, "")))
    .filter((part) => Number.isFinite(part) && part > 0);
  if (!values.length) return { min: null as number | null, max: null as number | null };
  if (/^under\b/i.test(value)) return { min: null, max: values[0] };
  if (/^over\b/i.test(value)) return { min: values[0], max: null };
  return {
    min: Math.min(...values),
    max: values.length > 1 ? Math.max(...values) : values[0],
  };
}

function isMemberOrganisationLabel(value: string) {
  return /forening|medlems|association|member/i.test(value);
}

function objectValue(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, any>
    : {};
}

function definedEntries(value: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== null && item !== undefined && item !== ""),
  );
}

function inboundProspectStatus(current: unknown) {
  const status = String(current || "").toUpperCase();
  return ["MEETING", "OPPORTUNITY"].includes(status) ? status : "ENGAGED";
}

const CORPORATE_PARTNER_TYPES = new Set([
  "accounting_tax",
  "legal",
  "management_consulting",
  "hr_recruitment",
  "business_membership",
  "corporate_travel",
  "wealth_advisory",
  "other",
]);

function normalizePartnerType(value: unknown) {
  const normalized = cleanText(value, 80).toLowerCase();
  return CORPORATE_PARTNER_TYPES.has(normalized) ? normalized : "other";
}

function inboundPartnerStatus(current: unknown) {
  const status = String(current || "").toUpperCase();
  return status === "PARTNER" ? "PARTNER" : "ENGAGED";
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
  organizationName?: string;
  organizationType?: string;
  contactRole?: string;
  userCount?: number | null;
  corporateModel?: string;
  partnerType?: string;
  partnershipInterest?: string;
  referralPartnerId?: string;
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
    params.organizationName ? `Virksomhet: ${params.organizationName}` : "",
    params.organizationType ? `Organisasjonstype: ${params.organizationType}` : "",
    params.contactRole ? `Kontaktrolle: ${params.contactRole}` : "",
    params.userCount ? `Ansatte/medlemmer: ${params.userCount}` : "",
    params.corporateModel ? `Corporate-modell: ${params.corporateModel}` : "",
    params.partnerType ? `Partnertype: ${params.partnerType}` : "",
    params.partnershipInterest ? `Partnerinteresse: ${params.partnershipInterest}` : "",
    params.referralPartnerId ? `Henvisningspartner-ID: ${params.referralPartnerId}` : "",
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
  const requestType = cleanText(body.request_type || body.requestType, 120);
  const requestedBrand = cleanText(
    request.headers.get("x-realtyflow-brand") || body.brand_id || body.brandId || body.brand,
    120,
  );
  const brandId = resolvePublicLeadBrand(requestedBrand, rawSource);
  const brandLabel = PUBLIC_REAL_ESTATE_BRAND_LABELS[brandId];
  const source = rawSource || (requestType === "corporate-event-registration"
    ? "zeneco-corporate-event-registration"
    : `${brandId}-public-lead`);
  const pageUrl = cleanText(body.page_url || body.pageUrl, 600);
  const pageTracking = trackingFromPageUrl(pageUrl);
  const propertyRef = cleanText(body.property_ref || body.propertyRef, 120);
  const propertyTitle = cleanText(body.property_title || body.propertyTitle, 240);
  const preferredArea = cleanText(body.preferred_area || body.preferredArea, 160);
  const budget = cleanText(body.budget, 80);
  const timeline = cleanText(body.timeline, 120);
  const message = cleanText(body.message, 3000);
  const dream = cleanText(body.dream, 160);
  const goal = cleanText(body.goal, 160);
  const priority = cleanText(body.priority, 160);
  const lifestyle = cleanText(body.lifestyle, 160);
  const airport = cleanText(body.airport, 120);
  const rental = cleanText(body.rental, 120);
  const propertyType = cleanText(body.property_type || body.propertyType, 120);
  const bedrooms = cleanText(body.bedrooms, 40);
  const organizationName = cleanText(body.organization_name || body.organizationName, 240);
  const organizationType = cleanText(body.organization_type || body.organizationType, 120);
  const contactRole = cleanText(body.contact_role || body.contactRole, 160);
  const userCount = positiveInteger(body.user_count || body.userCount);
  const corporateModel = cleanText(body.corporate_model || body.corporateModel, 180);
  const partnerType = normalizePartnerType(body.partner_type || body.partnerType);
  const partnershipInterest = cleanText(body.partnership_interest || body.partnershipInterest, 240);
  const referralPartnerId = cleanText(body.referral_partner_id || body.referralPartnerId, 80);
  const eventId = cleanText(
    body.event_id || body.eventId || queryParamFromUrl(pageUrl, "event_id"),
    160,
  );
  const eventName = cleanText(body.event_name || body.eventName, 240);
  const submissionId = cleanText(body.submission_id || body.submissionId || body.id, 160);
  const visitorId = cleanText(body.visitor_id || body.visitorId || pageTracking.visitor_id, 160);
  const sessionId = cleanText(body.session_id || body.sessionId || pageTracking.session_id, 160);
  const publicationId = cleanText(body.publication_id || body.publicationId || pageTracking.publication_id, 160);
  const utmSource = cleanText(body.utm_source || body.utmSource || pageTracking.utm_source, 80);
  const utmMedium = cleanText(body.utm_medium || body.utmMedium || pageTracking.utm_medium, 80);
  const utmCampaign = cleanText(body.utm_campaign || body.utmCampaign || pageTracking.utm_campaign, 120);
  const utmContent = cleanText(body.utm_content || body.utmContent || pageTracking.utm_content, 160);
  const allowedDiscoverySources = new Set([
    "google_search",
    "bing_search",
    "chatgpt",
    "google_gemini",
    "microsoft_copilot",
    "perplexity",
    "brave_search",
    "duckduckgo",
  ]);
  const rawDiscoverySource = cleanText(body.discovery_source || body.discoverySource, 80);
  const discoverySource = allowedDiscoverySources.has(rawDiscoverySource) ? rawDiscoverySource : "";
  const rawNotes = cleanText(body.notes, 5000);
  const incomingPropertyInterest = cleanText(body.property_interest || body.propertyInterest, 400);
  const incomingPipelineValue = Number(body.pipeline_value || body.pipelineValue || 0) || 0;
  const pipelineValue = incomingPipelineValue || (budget ? Number(budget.replace(/[^0-9]/g, "")) || 0 : 0);
  const careRequestTypes = new Set([
    "care-keyholding",
    "care-boligtilsyn",
    "care-nokkeloppbevaring",
    "care-klargjoring",
    "care-uvaer",
  ]);
  const isCare = brandId === "zeneco" && (
    careRequestTypes.has(requestType) || source.toLowerCase().startsWith("zeneco-care-")
  );
  const careServiceIntent = isCare
    ? (requestType.replace(/^care-/, "") || source.toLowerCase().replace(/^zeneco-care-/, ""))
    : "";
  const isCorporateEventRegistration = brandId === "zeneco" && requestType === "corporate-event-registration";
  const isCorporatePartner = brandId === "zeneco" && !isCare && !isCorporateEventRegistration && (
    requestType === "corporate-partner" ||
    source.toLowerCase().includes("corporate-partner") ||
    pageUrl.toLowerCase().includes("/bedriftshytte-spania/partnere")
  );
  const isCorporateHome = brandId === "zeneco" && !isCare && !isCorporatePartner && !isCorporateEventRegistration && (
    requestType === "corporate-home" ||
    source.toLowerCase().includes("corporate-homes") ||
    pageUrl.toLowerCase().includes("/bedriftshytte-spania")
  );

  if (isCorporateEventRegistration && (!eventId || !eventName)) {
    return NextResponse.json({ error: "event_id and event_name are required for Corporate event registration" }, { status: 400 });
  }

  let referredByPartner: Record<string, any> | null = null;
  if (brandId === "zeneco" && isCorporateHome && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(referralPartnerId)) {
    const { data: referralPartner, error: referralPartnerError } = await supabase
      .from("corporate_partner_prospects")
      .select("id,company_name,status")
      .eq("id", referralPartnerId)
      .eq("brand_id", "zeneco")
      .neq("status", "DISQUALIFIED")
      .maybeSingle();
    if (referralPartnerError) {
      console.warn("[public-leads] referral partner lookup failed", referralPartnerError.message);
    } else if (referralPartner) {
      referredByPartner = referralPartner;
    }
  }

  const notes = [
    `Brand: ${brandLabel}`,
    requestType ? `Forespørsel: ${requestType}` : "",
    pageUrl ? `Side: ${pageUrl}` : "",
    propertyRef ? `Boligref: ${propertyRef}` : "",
    propertyTitle ? `Bolig: ${propertyTitle}` : "",
    preferredArea ? `Område: ${preferredArea}` : "",
    budget ? `Budsjett: ${budget}` : "",
    propertyType ? `Boligtype: ${propertyType}` : "",
    bedrooms ? `Soverom: ${bedrooms}` : "",
    dream ? `Spania-drøm: ${dream}` : "",
    goal ? `Mål: ${goal}` : "",
    priority ? `Viktigst: ${priority}` : "",
    lifestyle ? `Livsstil: ${lifestyle}` : "",
    airport ? `Flyplass: ${airport}` : "",
    rental ? `Utleie: ${rental}` : "",
    timeline ? `Tidslinje: ${timeline}` : "",
    organizationName ? `Virksomhet: ${organizationName}` : "",
    organizationType ? `Organisasjonstype: ${organizationType}` : "",
    contactRole ? `Kontaktrolle: ${contactRole}` : "",
    userCount ? `Ansatte/medlemmer: ${userCount}` : "",
    corporateModel ? `Corporate-modell: ${corporateModel}` : "",
    isCorporatePartner ? `Partnertype: ${partnerType}` : "",
    partnershipInterest ? `Partnerinteresse: ${partnershipInterest}` : "",
    referredByPartner ? `Henvisningspartner: ${referredByPartner.company_name}` : "",
    isCorporateEventRegistration ? `Corporate-event: ${eventName} (${eventId})` : "",
    utmSource || utmCampaign || utmContent
      ? `UTM: ${utmSource} / ${utmCampaign} / ${utmContent}`
      : "",
    message,
    rawNotes,
  ].filter(Boolean).join("\n");

  const now = new Date().toISOString();
  const { data: existing } = await supabase
    .from("contacts")
    .select("id,notes,interactions,pipeline_status,pipeline_value,property_interest,next_followup,source,brand_id,brand")
    .eq("email", email)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (isCorporateEventRegistration) {
    const { data: existingParticipant, error: participantLookupError } = await supabase
      .from("corporate_event_participants")
      .select("*")
      .eq("brand_id", "zeneco")
      .eq("event_id", eventId)
      .eq("email", email)
      .maybeSingle();

    if (participantLookupError) {
      return NextResponse.json({ error: participantLookupError.message }, { status: 500 });
    }

    const participantPayload = {
      brand_id: "zeneco",
      event_id: eventId,
      event_name: eventName,
      email,
      name,
      organization_name: organizationName || null,
      organization_type: organizationType || null,
      contact_role: contactRole || null,
      contact_id: existing?.id || null,
      source_url: pageUrl || null,
      utm_source: utmSource || null,
      utm_medium: utmMedium || "webinar",
      utm_campaign: utmCampaign || null,
      utm_content: utmContent || null,
      evidence: {
        ...(existingParticipant?.evidence && typeof existingParticipant.evidence === "object" ? existingParticipant.evidence : {}),
        voluntary_registration: true,
        registration_submission_id: submissionId || null,
        registration_message: message || null,
        sales_qualified: false,
        automatic_pipeline_change: false,
      },
      updated_at: now,
    };

    const participantWrite = existingParticipant?.id
      ? supabase
          .from("corporate_event_participants")
          .update(participantPayload)
          .eq("id", existingParticipant.id)
          .select("*")
          .single()
      : supabase
          .from("corporate_event_participants")
          .insert({
            ...participantPayload,
            status: "REGISTERED",
            registered_at: now,
            created_at: now,
          })
          .select("*")
          .single();

    const { data: participant, error: participantError } = await participantWrite;
    if (participantError) {
      return NextResponse.json({ error: participantError.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      accepted: true,
      brandId,
      contact: null,
      corporateEventRegistration: {
        id: participant.id,
        eventId: participant.event_id,
        eventName: participant.event_name,
        status: participant.status,
        salesQualified: false,
        contactCreated: false,
        workItemCreated: false,
        revenueEventCreated: false,
      },
    });
  }

  const incomingInteraction = {
    id: submissionId ? `website-${submissionId}` : `website-${Date.now()}`,
    type: "note",
    content: interactionSummary({
      source, brandLabel, requestType, preferredArea, budget, timeline, propertyRef, propertyTitle,
      organizationName, organizationType, contactRole, userCount, corporateModel,
      partnerType: isCorporatePartner ? partnerType : undefined,
      partnershipInterest: partnershipInterest || undefined,
      referralPartnerId: referredByPartner?.id || undefined,
      message,
    }),
    date: now,
    direction: "in",
    brand_id: brandId,
    metadata: {
      source: source || null,
      request_type: requestType || null,
      event_id: isCorporateEventRegistration ? eventId : null,
      event_name: isCorporateEventRegistration ? eventName : null,
      event_action: isCorporateEventRegistration ? "REGISTERED" : null,
      utm_source: utmSource || null,
      utm_medium: utmMedium || null,
      utm_campaign: utmCampaign || null,
      utm_content: utmContent || null,
      publication_id: publicationId || null,
      visitor_id: visitorId || null,
      session_id: sessionId || null,
      page_url: pageUrl || null,
      buyer_preferences: brandId === "zeneco" && !isCorporateHome && !isCorporatePartner && !isCorporateEventRegistration ? definedEntries({
        budgetMax: budget ? Number(budget.replace(/[^0-9]/g, "")) || null : null,
        region: preferredArea || null,
        propertyType: propertyType || null,
        bedrooms: bedrooms || null,
        lifestyle: lifestyle || null,
        timeline: timeline || null,
        dream: dream || null,
        goal: goal || null,
        priority: priority || null,
        airport: airport || null,
        rental: rental || null,
      }) : null,
      organization_name: organizationName || null,
      organization_type: organizationType || null,
      contact_role: contactRole || null,
      user_count: userCount,
      corporate_model: corporateModel || null,
      partner_type: isCorporatePartner ? partnerType : null,
      partnership_interest: partnershipInterest || null,
      referral_partner_id: referredByPartner?.id || null,
      referral_partner_name: referredByPartner?.company_name || null,
    },
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
    source: isCorporateEventRegistration && existing?.id ? existing.source : source,
    notes: mergedNotes,
    pipeline_status: nextStatus,
    pipeline_value: isCorporateEventRegistration && existing?.id ? Number(existing.pipeline_value || 0) : pipelineValue,
    property_interest: isCorporateEventRegistration && existing?.id
      ? existing.property_interest
      : [propertyRef, propertyTitle].filter(Boolean).join(" - ") || incomingPropertyInterest || preferredArea,
    brand: canonicalBrandId,
    brand_id: canonicalBrandId,
    last_contact: now,
    next_followup: isCorporateEventRegistration
      ? existing?.next_followup || null
      : new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    interactions: [incomingInteraction, ...existingInteractions],
    updated_at: now,
  };

  const write = existing?.id
    ? supabase.from("contacts").update(contactPayload).eq("id", existing.id).select().single()
    : supabase.from("contacts").insert({ ...contactPayload, created_at: now }).select().single();

  const { data, error } = await write;

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let corporateProspect: Record<string, any> | null = null;
  let corporatePartner: Record<string, any> | null = null;
  if (isCorporateHome && organizationName) {
    const range = budgetRange(budget);
    const memberOrganisation = isMemberOrganisationLabel(organizationType);
    const assessment = definedEntries({
      model: corporateModel || null,
      budget_label: budget || null,
      budget_min_eur: range.min,
      budget_max_eur: range.max,
      expected_users: userCount,
      preferred_area: preferredArea || null,
      timeline: timeline || null,
      contact_role: contactRole || null,
      referral_partner_id: referredByPartner?.id || null,
      referral_partner_name: referredByPartner?.company_name || null,
      inbound_request: true,
      updated_at: now,
    });

    const { data: candidateProspects, error: candidateError } = await supabase
      .from("corporate_prospects")
      .select("*")
      .eq("brand_id", "zeneco")
      .limit(1000);

    if (candidateError) {
      console.warn("[public-leads] corporate prospect lookup failed", candidateError.message);
    } else {
      const existingProspect = (candidateProspects || []).find(
        (row: any) => String(row.company_name || "").trim().toLocaleLowerCase("nb-NO")
          === organizationName.toLocaleLowerCase("nb-NO"),
      ) || null;

      if (existingProspect) {
        const existingEvidence = objectValue(existingProspect.evidence);
        const existingAssessment = objectValue(existingEvidence.corporate_assessment);
        const mergedEvidence = {
          ...existingEvidence,
          inbound_request: true,
          inbound_last_at: now,
          inbound_contact_role: contactRole || existingEvidence.inbound_contact_role || null,
          inbound_utm: definedEntries({
            source: utmSource || null,
            medium: utmMedium || null,
            campaign: utmCampaign || null,
            content: utmContent || null,
          }),
          corporate_assessment: { ...existingAssessment, ...assessment },
        };
        const mergedProspect = {
          ...existingProspect,
          status: inboundProspectStatus(existingProspect.status),
          converted_contact_id: data.id,
          employee_count: existingProspect.employee_count ?? (!memberOrganisation ? userCount : null),
          member_count: existingProspect.member_count ?? (memberOrganisation ? userCount : null),
          source_url: existingProspect.source_url || pageUrl || null,
          evidence: mergedEvidence,
          next_action: "Inbound Corporate Home Assessment: følg opp personlig og bruk assessment-data til discovery og boligmatch.",
          updated_at: now,
        };
        const score = rescoreCorporateProspect(mergedProspect);
        const { data: updatedProspect, error: updateProspectError } = await supabase
          .from("corporate_prospects")
          .update({
            status: mergedProspect.status,
            converted_contact_id: data.id,
            employee_count: mergedProspect.employee_count,
            member_count: mergedProspect.member_count,
            source_url: mergedProspect.source_url,
            evidence: mergedEvidence,
            next_action: mergedProspect.next_action,
            ...score,
            updated_at: now,
          })
          .eq("id", existingProspect.id)
          .select("*")
          .single();

        if (updateProspectError) {
          console.warn("[public-leads] corporate prospect update failed", updateProspectError.message);
        } else {
          corporateProspect = updatedProspect;
        }
      } else {
        const normalized = normalizeCorporateProspect({
          company_name: organizationName,
          organization_type: organizationType,
          country_code: "NO",
          employee_count: memberOrganisation ? null : userCount,
          member_count: memberOrganisation ? userCount : null,
          status: "ENGAGED",
          source_type: "inbound_website",
          source_url: pageUrl || null,
          evidence: {
            inbound_request: true,
            inbound_first_at: now,
            inbound_last_at: now,
            inbound_contact_role: contactRole || null,
            inbound_utm: definedEntries({
              source: utmSource || null,
              medium: utmMedium || null,
              campaign: utmCampaign || null,
              content: utmContent || null,
            }),
            corporate_assessment: assessment,
          },
          notes: "Inbound Corporate Home Assessment request from zenecohomes.com.",
          next_action: "Følg opp personlig og bruk innsendt assessment til discovery og boligmatch.",
        });
        const { data: createdProspect, error: createProspectError } = await supabase
          .from("corporate_prospects")
          .insert({
            ...normalized,
            converted_contact_id: data.id,
            created_at: now,
            updated_at: now,
          })
          .select("*")
          .single();

        if (createProspectError) {
          console.warn("[public-leads] corporate prospect create failed", createProspectError.message);
        } else {
          corporateProspect = createdProspect;
        }
      }
    }
  }

  if (isCorporateHome && eventId) {
    const { data: eventParticipant, error: eventParticipantError } = await supabase
      .from("corporate_event_participants")
      .select("id,evidence")
      .eq("brand_id", "zeneco")
      .eq("event_id", eventId)
      .eq("email", email)
      .maybeSingle();

    if (eventParticipantError) {
      console.warn("[public-leads] corporate event participant lookup failed", eventParticipantError.message);
    } else if (eventParticipant?.id) {
      const currentEvidence = objectValue(eventParticipant.evidence);
      const { error: eventParticipantUpdateError } = await supabase
        .from("corporate_event_participants")
        .update({
          status: "ASSESSMENT_REQUESTED",
          assessment_requested_at: now,
          contact_id: data.id,
          evidence: {
            ...currentEvidence,
            assessment_requested: true,
            assessment_submission_id: submissionId || null,
            assessment_contact_id: data.id,
            sales_qualified: false,
            automatic_pipeline_change: false,
            automatic_prospect_qualification: false,
            qualified_by: "voluntary_assessment_request",
          },
          updated_at: now,
        })
        .eq("id", eventParticipant.id);

      if (eventParticipantUpdateError) {
        console.warn("[public-leads] corporate event participant update failed", eventParticipantUpdateError.message);
      }
    }
  }

  if (isCorporatePartner && organizationName) {
    const { data: candidatePartners, error: candidatePartnerError } = await supabase
      .from("corporate_partner_prospects")
      .select("*")
      .eq("brand_id", "zeneco")
      .limit(1000);

    if (candidatePartnerError) {
      console.warn("[public-leads] corporate partner lookup failed", candidatePartnerError.message);
    } else {
      const existingPartner = (candidatePartners || []).find(
        (row: any) => String(row.company_name || "").trim().toLocaleLowerCase("nb-NO")
          === organizationName.toLocaleLowerCase("nb-NO"),
      ) || null;

      const inboundEvidence = {
        inbound_partner_request: true,
        inbound_last_at: now,
        inbound_contact_role: contactRole || null,
        partnership_interest: partnershipInterest || null,
        inbound_utm: definedEntries({
          source: utmSource || null,
          medium: utmMedium || null,
          campaign: utmCampaign || null,
          content: utmContent || null,
        }),
        company_level_only: false,
        voluntary_contact_submission: true,
        personal_enrichment_performed: false,
      };

      if (existingPartner) {
        const currentEvidence = objectValue(existingPartner.evidence);
        const currentReasons = Array.isArray(existingPartner.fit_reasons) ? existingPartner.fit_reasons : [];
        const inboundReason = "Direkte partnerhenvendelse fra ZenEcoHomes.com";
        const nextScore = Math.max(Number(existingPartner.fit_score || 0), 82);
        const nextReasons = currentReasons.includes(inboundReason)
          ? currentReasons
          : [...currentReasons, inboundReason];

        const { data: updatedPartner, error: updatePartnerError } = await supabase
          .from("corporate_partner_prospects")
          .update({
            partner_type: partnerType,
            status: inboundPartnerStatus(existingPartner.status),
            fit_score: nextScore,
            fit_tier: nextScore >= 75 ? "A" : nextScore >= 58 ? "B" : "C",
            fit_reasons: nextReasons,
            referral_angle: partnershipInterest || existingPartner.referral_angle || null,
            evidence: { ...currentEvidence, ...inboundEvidence },
            converted_contact_id: data.id,
            next_action: "Direkte partnerhenvendelse: følg opp personlig og avklar kundetyper, rollefordeling og eventuell samarbeidsavtale.",
            next_followup: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
            updated_at: now,
          })
          .eq("id", existingPartner.id)
          .select("*")
          .single();

        if (updatePartnerError) {
          console.warn("[public-leads] corporate partner update failed", updatePartnerError.message);
        } else {
          corporatePartner = updatedPartner;
        }
      } else {
        const { data: createdPartner, error: createPartnerError } = await supabase
          .from("corporate_partner_prospects")
          .insert({
            brand_id: "zeneco",
            company_name: organizationName,
            partner_type: partnerType,
            country_code: "NO",
            status: "ENGAGED",
            fit_score: 82,
            fit_tier: "A",
            fit_reasons: [
              "Direkte partnerhenvendelse fra ZenEcoHomes.com",
              `Oppgitt partnersegment: ${partnerType}`,
            ],
            evidence_gaps: [],
            referral_angle: partnershipInterest || null,
            source_type: "inbound_website",
            source_url: pageUrl || null,
            evidence: inboundEvidence,
            converted_contact_id: data.id,
            next_action: "Direkte partnerhenvendelse: følg opp personlig og avklar kundetyper, rollefordeling og eventuell samarbeidsavtale.",
            next_followup: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
            created_at: now,
            updated_at: now,
          })
          .select("*")
          .single();

        if (createPartnerError) {
          console.warn("[public-leads] corporate partner create failed", createPartnerError.message);
        } else {
          corporatePartner = createdPartner;
        }
      }
    }
  }

  if (!isCorporateEventRegistration) {
    await supabase.from("work_items").insert({
    title: `${existing?.id ? "Ny aktivitet fra" : `Ny ${brandLabel}-lead:`} ${name}`,
    description: `${email}${preferredArea || incomingPropertyInterest ? ` · ${preferredArea || incomingPropertyInterest}` : ""}${budget || pipelineValue ? ` · ${budget || `€${pipelineValue}`}` : ""}`,
    status: "TO_DO",
    priority: isCorporateHome || isCorporatePartner || pipelineValue >= 500000 || propertyRef ? "HIGH" : "MEDIUM",
    due_date: new Date().toISOString().slice(0, 10),
    brand_id: brandId,
    source_type: "website_lead",
    source_id: data.id,
    assigned_agent: "sales",
    next_action: isCorporatePartner
      ? "Corporate Homes partner: svar personlig og avklar kundetyper, rollefordeling, introduksjonsprosess og behov for samarbeidsavtale."
      : isCorporateHome
        ? "Corporate Homes B2B: svar personlig, identifiser beslutningstaker(e) og avklar antall brukere, formål, budsjett, tidslinje og styre-/ledelsesprosess."
        : isCare
          ? `Zen Eco Homes Care: svar personlig og avklar boligområde, boligtype, ønsket tjeneste (${careServiceIntent || "keyholding"}), frekvens og oppstart.`
          : existing?.id
          ? "Kunden har sendt ny info. Sjekk endringen og svar personlig i dag."
          : "Send personlig oppfølging og avklar område, budsjett og tidslinje.",
    ai_score: isCorporatePartner ? 90 : isCorporateHome ? 92 : pipelineValue >= 500000 || propertyRef ? 86 : 68,
    metadata: {
      source: source || null,
      page_url: pageUrl,
      property_ref: propertyRef,
      preferred_area: preferredArea || null,
      property_type: propertyType || null,
      timeline,
      email,
      brand_id: brandId,
      brand_label: brandLabel,
      request_type: requestType || null,
      segment: isCare ? "care" : isCorporatePartner ? "corporate_partner" : isCorporateHome ? "corporate_homes" : null,
      service_intent: isCare ? careServiceIntent || "keyholding" : null,
      canonical_contact_brand_id: canonicalBrandId,
      is_existing_contact: Boolean(existing?.id),
      created_from_public_endpoint: true,
      submission_id: submissionId || null,
      publication_id: publicationId || null,
      visitor_id: visitorId || null,
      session_id: sessionId || null,
      utm_source: utmSource || null,
      utm_medium: utmMedium || null,
      utm_campaign: utmCampaign || null,
      utm_content: utmContent || null,
      discovery_source: isCare ? discoverySource || null : null,
      organization_name: organizationName || null,
      organization_type: organizationType || null,
      contact_role: contactRole || null,
      user_count: userCount,
      corporate_model: corporateModel || null,
      partner_type: isCorporatePartner ? partnerType : null,
      partnership_interest: partnershipInterest || null,
      referral_partner_id: referredByPartner?.id || null,
      referral_partner_name: referredByPartner?.company_name || null,
      corporate_prospect_id: corporateProspect?.id || null,
      corporate_partner_id: corporatePartner?.id || null,
    },
    created_at: now,
    updated_at: now,
    }).then(() => null);
  }

  const revenueSourceId = submissionId || propertyRef || pageUrl || String(incomingInteraction.id);
  if (!isCorporateEventRegistration) {
    const eventResult = await insertRevenueEvent(supabase, {
    eventType: existing?.id ? "contact_updated" : "lead_created",
    title: existing?.id ? `Ny public aktivitet: ${name}` : `Ny public lead: ${name}`,
    description: interactionSummary({
      source, brandLabel, requestType, preferredArea, budget, timeline, propertyRef, propertyTitle,
      organizationName, organizationType, contactRole, userCount, corporateModel,
      partnerType: isCorporatePartner ? partnerType : undefined,
      partnershipInterest: partnershipInterest || undefined,
      referralPartnerId: referredByPartner?.id || undefined,
      message,
    }),
    contactId: data.id,
    brandId,
    sourceSystem: "public_leads",
    sourceType: "website_form",
    sourceId: revenueSourceId,
    actorType: "customer",
    confidenceScore: isCorporatePartner ? 90 : isCorporateHome ? 92 : pipelineValue >= 500000 || propertyRef ? 86 : 68,
    revenueImpactEur: pipelineValue || null,
    occurredAt: now,
    dedupeKey: buildRevenueEventDedupeKey(["public_leads", brandId, revenueSourceId]),
    metadata: {
      email,
      source,
      page_url: pageUrl,
      property_ref: propertyRef,
      property_title: propertyTitle,
      preferred_area: preferredArea,
      budget,
      timeline,
      request_type: requestType,
      segment: isCare ? "care" : isCorporatePartner ? "corporate_partner" : isCorporateHome ? "corporate_homes" : null,
      service_intent: isCare ? careServiceIntent || "keyholding" : null,
      canonical_contact_brand_id: canonicalBrandId,
      is_existing_contact: Boolean(existing?.id),
      submission_id: submissionId || null,
      publication_id: publicationId || null,
      visitor_id: visitorId || null,
      session_id: sessionId || null,
      utm_source: utmSource || null,
      utm_medium: utmMedium || null,
      utm_campaign: utmCampaign || null,
      utm_content: utmContent || null,
      discovery_source: isCare ? discoverySource || null : null,
      organization_name: organizationName || null,
      organization_type: organizationType || null,
      contact_role: contactRole || null,
      user_count: userCount,
      corporate_model: corporateModel || null,
      partner_type: isCorporatePartner ? partnerType : null,
      partnership_interest: partnershipInterest || null,
      referral_partner_id: referredByPartner?.id || null,
      referral_partner_name: referredByPartner?.company_name || null,
      corporate_prospect_id: corporateProspect?.id || null,
      corporate_partner_id: corporatePartner?.id || null,
    },
    createdBy: "api/public/leads",
  });

    if (!eventResult.ok && !eventResult.tableNotReady) {
      console.warn("[public-leads] revenue event insert failed", eventResult.error);
    }
  }

  if (brandId === "zeneco") {
    const internalRecipients = Array.from(new Set([
      process.env.ZENECO_LEAD_NOTIFICATION_EMAIL || "kontakt@zenecohomes.com",
      process.env.ZENECO_LEAD_NOTIFICATION_CC || "freddy@zenecohomes.com",
    ].map((value) => value.trim().toLowerCase()).filter(isEmail)));

    const internalSummary = [
      isCare ? `Ny Care-henvendelse · ${careServiceIntent || "keyholding"}` : `Nytt skjema fra ZenEcoHomes.com`,
      `Navn: ${name}`,
      `E-post: ${email}`,
      cleanText(body.phone, 80) ? `Telefon: ${cleanText(body.phone, 80)}` : "",
      requestType ? `Skjema: ${requestType}` : "",
      preferredArea ? `Område: ${preferredArea}` : "",
      budget ? `Budsjett: ${budget}` : "",
      bedrooms ? `Soverom: ${bedrooms}` : "",
      lifestyle ? `Livsstil: ${lifestyle}` : "",
      pageUrl ? `Side: ${pageUrl}` : "",
      message ? `Melding:\n${message}` : "",
      `CRM kontakt-ID: ${data.id}`,
    ].filter(Boolean).join("\n");

    if (internalRecipients.length) {
      sendBrandEmail(supabase, {
        brandId: "zeneco",
        to: internalRecipients,
        subject: `Ny henvendelse: ${name}${requestType ? ` · ${requestType}` : ""}`,
        bodyText: internalSummary,
        allowSuppressed: true,
      }).catch((error) => console.warn("[public-leads] internal lead email failed", error));
    }

    const canOfferPortal = !isCare && !isCorporateHome && !isCorporatePartner && !isCorporateEventRegistration;
    const optInToken = canOfferPortal ? portalOptInToken(String(data.id), email) : "";
    const portalLink = optInToken
      ? `${publicBaseUrl()}/api/public/portal-opt-in?token=${encodeURIComponent(optInToken)}`
      : undefined;
    const receipt = leadReceiptCopy({ name, preferredArea, budget, portalLink });
    sendBrandEmail(supabase, {
      brandId: "zeneco",
      to: [email],
      subject: receipt.subject,
      bodyText: receipt.bodyText,
      bodyHtml: receipt.bodyHtml,
      allowSuppressed: true,
    }).catch((error) => console.warn("[public-leads] customer receipt email failed", error));
  }

  return NextResponse.json({
    success: true,
    contact: data,
    brandId,
    corporateEventRegistration: isCorporateEventRegistration
      ? { eventId, eventName, status: "REGISTERED", salesQualified: false }
      : null,
    corporateProspect: corporateProspect
      ? { id: corporateProspect.id, status: corporateProspect.status, fitTier: corporateProspect.fit_tier }
      : null,
    corporatePartner: corporatePartner
      ? { id: corporatePartner.id, status: corporatePartner.status, fitTier: corporatePartner.fit_tier }
      : null,
    referredByPartner: referredByPartner
      ? { id: referredByPartner.id, companyName: referredByPartner.company_name }
      : null,
  });
}
