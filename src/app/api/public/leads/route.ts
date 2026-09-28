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

function positiveInteger(value: unknown) {
  const parsed = Number(String(value ?? "").replace(/\s/g, ""));
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : null;
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
  const propertyRef = cleanText(body.property_ref || body.propertyRef, 120);
  const propertyTitle = cleanText(body.property_title || body.propertyTitle, 240);
  const preferredArea = cleanText(body.preferred_area || body.preferredArea, 160);
  const budget = cleanText(body.budget, 80);
  const timeline = cleanText(body.timeline, 120);
  const message = cleanText(body.message, 3000);
  const organizationName = cleanText(body.organization_name || body.organizationName, 240);
  const organizationType = cleanText(body.organization_type || body.organizationType, 120);
  const contactRole = cleanText(body.contact_role || body.contactRole, 160);
  const userCount = positiveInteger(body.user_count || body.userCount);
  const corporateModel = cleanText(body.corporate_model || body.corporateModel, 180);
  const partnerType = normalizePartnerType(body.partner_type || body.partnerType);
  const partnershipInterest = cleanText(body.partnership_interest || body.partnershipInterest, 240);
  const eventId = cleanText(body.event_id || body.eventId, 160);
  const eventName = cleanText(body.event_name || body.eventName, 240);
  const submissionId = cleanText(body.submission_id || body.submissionId || body.id, 160);
  const visitorId = cleanText(body.visitor_id || body.visitorId, 160);
  const sessionId = cleanText(body.session_id || body.sessionId, 160);
  const publicationId = cleanText(body.publication_id || body.publicationId, 160);
  const utmSource = cleanText(body.utm_source || body.utmSource, 80);
  const utmMedium = cleanText(body.utm_medium || body.utmMedium, 80);
  const utmCampaign = cleanText(body.utm_campaign || body.utmCampaign, 120);
  const utmContent = cleanText(body.utm_content || body.utmContent, 160);
  const rawNotes = cleanText(body.notes, 5000);
  const incomingPropertyInterest = cleanText(body.property_interest || body.propertyInterest, 400);
  const incomingPipelineValue = Number(body.pipeline_value || body.pipelineValue || 0) || 0;
  const pipelineValue = incomingPipelineValue || (budget ? Number(budget.replace(/[^0-9]/g, "")) || 0 : 0);
  const isCorporateEventRegistration = brandId === "zeneco" && requestType === "corporate-event-registration";
  const isCorporatePartner = brandId === "zeneco" && !isCorporateEventRegistration && (
    requestType === "corporate-partner" ||
    source.toLowerCase().includes("corporate-partner") ||
    pageUrl.toLowerCase().includes("/bedriftshytte-spania/partnere")
  );
  const isCorporateHome = brandId === "zeneco" && !isCorporatePartner && !isCorporateEventRegistration && (
    requestType === "corporate-home" ||
    source.toLowerCase().includes("corporate-homes") ||
    pageUrl.toLowerCase().includes("/bedriftshytte-spania")
  );

  if (isCorporateEventRegistration && (!eventId || !eventName)) {
    return NextResponse.json({ error: "event_id and event_name are required for Corporate event registration" }, { status: 400 });
  }

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
    organizationName ? `Virksomhet: ${organizationName}` : "",
    organizationType ? `Organisasjonstype: ${organizationType}` : "",
    contactRole ? `Kontaktrolle: ${contactRole}` : "",
    userCount ? `Ansatte/medlemmer: ${userCount}` : "",
    corporateModel ? `Corporate-modell: ${corporateModel}` : "",
    isCorporatePartner ? `Partnertype: ${partnerType}` : "",
    partnershipInterest ? `Partnerinteresse: ${partnershipInterest}` : "",
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
      message,
    }),
    date: now,
    direction: "in",
    brand_id: brandId,
    metadata: {
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
      organization_name: organizationName || null,
      organization_type: organizationType || null,
      contact_role: contactRole || null,
      user_count: userCount,
      corporate_model: corporateModel || null,
      partner_type: isCorporatePartner ? partnerType : null,
      partnership_interest: partnershipInterest || null,
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
        : existing?.id
        ? "Kunden har sendt ny info. Sjekk endringen og svar personlig i dag."
        : "Send personlig oppfølging og avklar område, budsjett og tidslinje.",
    ai_score: isCorporatePartner ? 90 : isCorporateHome ? 92 : pipelineValue >= 500000 || propertyRef ? 86 : 68,
    metadata: {
      page_url: pageUrl,
      property_ref: propertyRef,
      timeline,
      email,
      brand_id: brandId,
      brand_label: brandLabel,
      request_type: requestType || null,
      segment: isCorporatePartner ? "corporate_partner" : isCorporateHome ? "corporate_homes" : null,
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
      organization_name: organizationName || null,
      organization_type: organizationType || null,
      contact_role: contactRole || null,
      user_count: userCount,
      corporate_model: corporateModel || null,
      partner_type: isCorporatePartner ? partnerType : null,
      partnership_interest: partnershipInterest || null,
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
      segment: isCorporatePartner ? "corporate_partner" : isCorporateHome ? "corporate_homes" : null,
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
      organization_name: organizationName || null,
      organization_type: organizationType || null,
      contact_role: contactRole || null,
      user_count: userCount,
      corporate_model: corporateModel || null,
      partner_type: isCorporatePartner ? partnerType : null,
      partnership_interest: partnershipInterest || null,
      corporate_prospect_id: corporateProspect?.id || null,
      corporate_partner_id: corporatePartner?.id || null,
    },
    createdBy: "api/public/leads",
  });

    if (!eventResult.ok && !eventResult.tableNotReady) {
      console.warn("[public-leads] revenue event insert failed", eventResult.error);
    }
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
  });
}
