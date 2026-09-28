import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminApi } from "@/lib/api-admin";
import { evaluateCorporateProspectReadiness } from "@/lib/corporate-prospect-readiness";
import { corporateArticleUrl, corporateOrganicTopicsForWeek } from "@/lib/corporate-organic-content";
import { corporateGrowthCandidateId } from "@/lib/corporate-growth-improvement";
import {
  CONTINUOUS_IMPROVEMENT_SETTINGS_KEY,
  buildContinuousImprovementRegister,
  parseContinuousImprovementSettings,
} from "@/lib/revenue/continuous-improvement";
import {
  WEEKLY_MANAGEMENT_SETTINGS_KEY,
  parseWeeklyManagementSettings,
} from "@/lib/revenue/weekly-management-review";
import { buildCorporateImprovementObservedEffect } from "@/lib/corporate-improvement-observed-effect";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key
    ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
    : null;
}

const ACTIVE = new Set(["NEW", "CONTACT", "QUALIFIED", "MATCHING", "VIEWING", "NEGOTIATION", "RESERVED", "ON_HOLD"]);
const QUALIFIED_STAGES = new Set(["QUALIFIED", "MATCHING", "VIEWING", "NEGOTIATION", "RESERVED", "WON"]);

function interactionMetadata(item: any) {
  return item?.metadata && typeof item.metadata === "object" && !Array.isArray(item.metadata)
    ? item.metadata as Record<string, any>
    : {};
}

function contactInteractions(row: any) {
  return Array.isArray(row?.interactions) ? row.interactions : [];
}

function isCorporateEventRegistrationOnly(row: any) {
  const interactions = contactInteractions(row);
  const registered = interactions.some((item: any) => {
    const metadata = interactionMetadata(item);
    return metadata.request_type === "corporate-event-registration" && metadata.event_action === "REGISTERED";
  });
  const corporateSalesSignal = interactions.some((item: any) => {
    const metadata = interactionMetadata(item);
    return metadata.request_type === "corporate-home";
  });
  return registered &&
    !corporateSalesSignal &&
    String(row?.source || "").toLowerCase().includes("corporate-event-registration");
}

function isEventSourcedAssessment(row: any) {
  return contactInteractions(row).some((item: any) => {
    const metadata = interactionMetadata(item);
    if (metadata.request_type !== "corporate-home") return false;
    const signal = `${metadata.utm_source || ""} ${metadata.utm_medium || ""} ${metadata.utm_campaign || ""} ${metadata.utm_content || ""}`.toLowerCase();
    return /webinar|event|seminar/.test(signal);
  });
}

function acquisitionIdentity(row: any) {
  const interactions = [...contactInteractions(row)].reverse();
  const website = interactions.find((item: any) => {
    const metadata = interactionMetadata(item);
    if (["corporate-event-registration", "corporate-event-attendance"].includes(String(metadata.request_type || ""))) {
      return false;
    }
    const page = String(metadata.page_url || "").toLowerCase();
    return Boolean(metadata.utm_source || metadata.utm_campaign || page.includes("/bedriftshytte-spania"));
  });
  const metadata = website ? interactionMetadata(website) : {};
  return {
    source: String(metadata.utm_source || row?.source || "").trim().toLowerCase(),
    medium: String(metadata.utm_medium || "").trim().toLowerCase(),
    campaign: String(metadata.utm_campaign || "").trim(),
  };
}

function acquisitionChannel(row: any) {
  const attribution = acquisitionIdentity(row);
  const signal = `${attribution.source} ${attribution.medium}`.toLowerCase();
  if (signal.includes("google")) return { key: "google", label: "Google", ...attribution };
  if (signal.includes("linkedin")) return { key: "linkedin", label: "LinkedIn", ...attribution };
  if (/facebook|instagram|meta/.test(signal)) return { key: "meta", label: "Meta", ...attribution };
  if (/webinar|event|seminar/.test(signal)) return { key: "event", label: "Webinar / event", ...attribution };
  if (/realtyflow|outbound|email/.test(signal)) return { key: "outbound", label: "Outbound", ...attribution };
  if (!attribution.source || /organic|direct|zeneco-corporate-homes/.test(signal)) {
    return { key: "organic", label: "Organisk / direkte", ...attribution };
  }
  return { key: "other", label: "Andre kilder", ...attribution };
}

export async function GET(request: NextRequest) {
  const denied = await requireAdminApi(request, { corporateHomes: null });
  if (denied) return denied;

  const supabase = getSupabase();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase not configured", corporateHomes: null }, { status: 500 });
  }

  const [
    { data: contacts, error: contactsError },
    { data: workItems, error: workItemsError },
    { data: prospects, error: prospectsError },
    { data: lastDiscovery, error: lastDiscoveryError },
    { data: discoveryControl, error: discoveryControlError },
  ] = await Promise.all([
    supabase
      .from("contacts")
      .select("id,name,email,phone,source,pipeline_status,pipeline_value,property_interest,next_followup,last_contact,updated_at,created_at,interactions,notes,brand_id")
      .eq("brand_id", "zeneco")
      .ilike("source", "%corporate%")
      .order("updated_at", { ascending: false })
      .limit(1000),
    supabase
      .from("work_items")
      .select("id,title,description,status,priority,source_id,next_action,metadata,created_at,updated_at")
      .eq("brand_id", "zeneco")
      .order("updated_at", { ascending: false })
      .limit(1500),
    supabase
      .from("corporate_prospects")
      .select("id,company_name,organization_number,domain,website_url,industry,employee_count,employee_band,member_count,organization_type,status,fit_tier,fit_score,fit_reasons,evidence_gaps,decision_roles,source_url,next_action,converted_contact_id,evidence,created_at,updated_at")
      .eq("brand_id", "zeneco")
      .limit(1000),
    supabase
      .from("automation_logs")
      .select("id,status,details,created_at")
      .eq("action", "corporate_homes_discovery")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("nexus_runtime_controls")
      .select("enabled,risk_level,config,updated_at")
      .eq("control_key", "cron:/api/cron/corporate-homes-discovery")
      .maybeSingle(),
  ]);

  if (contactsError) {
    return NextResponse.json({ error: contactsError.message, corporateHomes: null }, { status: 500 });
  }

  const { data: lastContentDraftRun, error: lastContentDraftRunError } = await supabase
    .from("automation_logs")
    .select("id,status,details,created_at")
    .eq("action", "corporate_homes_content_drafts")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: lastSignalResearchRun, error: lastSignalResearchRunError } = await supabase
    .from("automation_logs")
    .select("id,status,details,created_at")
    .eq("action", "corporate_homes_company_signals")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: lastGenericContactRun, error: lastGenericContactRunError } = await supabase
    .from("automation_logs")
    .select("id,status,details,created_at")
    .eq("action", "corporate_homes_generic_contacts")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: recentCorporateGrowthReviews, error: lastCorporateGrowthReviewError } = await supabase
    .from("automation_logs")
    .select("id,status,details,created_at")
    .eq("action", "corporate_homes_growth_review")
    .in("status", ["success", "partial"])
    .order("created_at", { ascending: false })
    .limit(60);
  const lastCorporateGrowthReview = recentCorporateGrowthReviews?.[0] || null;

  const growthDetails =
    lastCorporateGrowthReview?.details &&
    typeof lastCorporateGrowthReview.details === "object" &&
    !Array.isArray(lastCorporateGrowthReview.details)
      ? lastCorporateGrowthReview.details as Record<string, any>
      : {};
  const latestGrowthReview = growthDetails.review && typeof growthDetails.review === "object"
    ? growthDetails.review as Record<string, any>
    : null;
  const latestGrowthComparison = growthDetails.comparison && typeof growthDetails.comparison === "object"
    ? growthDetails.comparison as Record<string, any>
    : null;
  const growthBottleneckStage =
    latestGrowthComparison?.continuousImprovementCandidate &&
    latestGrowthReview?.bottleneck &&
    typeof latestGrowthReview.bottleneck === "object"
      ? String(latestGrowthReview.bottleneck.stage || "")
      : "";

  let corporateGrowthImprovement: Record<string, any> | null = null;
  let continuousImprovementWarning: { message: string } | null = null;
  if (growthBottleneckStage) {
    const [
      { data: improvementSettingsRow, error: improvementSettingsError },
      { data: weeklySettingsRow, error: weeklySettingsError },
    ] = await Promise.all([
      supabase
        .from("brand_settings")
        .select("settings,updated_at")
        .eq("brand_id", CONTINUOUS_IMPROVEMENT_SETTINGS_KEY)
        .maybeSingle(),
      supabase
        .from("brand_settings")
        .select("settings,updated_at")
        .eq("brand_id", WEEKLY_MANAGEMENT_SETTINGS_KEY)
        .maybeSingle(),
    ]);

    if (improvementSettingsError || weeklySettingsError) {
      continuousImprovementWarning = {
        message:
          improvementSettingsError?.message ||
          weeklySettingsError?.message ||
          "Continuous Improvement status could not be read",
      };
    }

    const improvementRegister = buildContinuousImprovementRegister(
      parseContinuousImprovementSettings(
        improvementSettingsRow?.settings,
        improvementSettingsRow?.updated_at,
      ),
      parseWeeklyManagementSettings(
        weeklySettingsRow?.settings,
        weeklySettingsRow?.updated_at,
      ),
      "OWNER",
    );
    const candidateId = corporateGrowthCandidateId(growthBottleneckStage);
    const tracked = improvementRegister.improvements.find(
      (item) => item.candidateId === candidateId,
    ) || null;

    if (tracked) {
      corporateGrowthImprovement = {
        id: tracked.id,
        candidateId: tracked.candidateId,
        status: tracked.status,
        ownerEmail: tracked.ownerEmail,
        dueAt: tracked.dueAt,
        overdue: tracked.overdue,
        closed: tracked.closed,
        closedAt: tracked.closedAt,
        rootCauseCategory: tracked.rootCauseCategory,
        actionType: tracked.actionType,
        updatedAt: tracked.updatedAt,
        observedEffect: buildCorporateImprovementObservedEffect(
          recentCorporateGrowthReviews || [],
          { candidateId: tracked.candidateId, createdAt: tracked.createdAt },
        ),
      };
    }
  }

  const [
    { data: partnerRows, error: partnerError },
    { data: lastPartnerDiscovery, error: lastPartnerDiscoveryError },
    { data: eventParticipantRows, error: eventParticipantsError },
  ] = await Promise.all([
    supabase
      .from("corporate_partner_prospects")
      .select("id,company_name,organization_number,domain,website_url,partner_type,city,industry,employee_count,status,fit_score,fit_tier,fit_reasons,evidence_gaps,referral_angle,source_url,next_action,evidence,created_at,updated_at")
      .eq("brand_id", "zeneco")
      .order("fit_score", { ascending: false })
      .order("updated_at", { ascending: false })
      .limit(500),
    supabase
      .from("automation_logs")
      .select("id,status,details,created_at")
      .eq("action", "corporate_homes_partner_discovery")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("corporate_event_participants")
      .select("id,event_id,event_name,email,status,registered_at,attended_at,cta_clicked_at,assessment_requested_at,utm_source,utm_medium,utm_campaign,utm_content,contact_id,updated_at")
      .eq("brand_id", "zeneco")
      .order("updated_at", { ascending: false })
      .limit(2000),
  ]);

  const rows = contacts || [];
  const leadRows = rows.filter((row: any) => !isCorporateEventRegistrationOnly(row));
  const prospectRows = prospects || [];
  const partners = partnerRows || [];
  const partnerTierCounts = partners.reduce<Record<string, number>>((acc, row: any) => {
    const tier = String(row.fit_tier || "UNSCORED").toUpperCase();
    acc[tier] = (acc[tier] || 0) + 1;
    return acc;
  }, {});
  const partnerStatusCounts = partners.reduce<Record<string, number>>((acc, row: any) => {
    const status = String(row.status || "DISCOVERED").toUpperCase();
    acc[status] = (acc[status] || 0) + 1;
    return acc;
  }, {});
  const focusPartners = partners
    .filter((row: any) => ["A", "B"].includes(String(row.fit_tier || "").toUpperCase()))
    .filter((row: any) => !["PARTNER", "DISQUALIFIED"].includes(String(row.status || "").toUpperCase()))
    .slice(0, 8)
    .map((row: any) => ({
      id: row.id,
      companyName: row.company_name,
      organizationNumber: row.organization_number,
      domain: row.domain,
      partnerType: row.partner_type,
      city: row.city,
      industry: row.industry,
      employeeCount: row.employee_count,
      status: String(row.status || "DISCOVERED").toUpperCase(),
      fitTier: String(row.fit_tier || "UNSCORED").toUpperCase(),
      fitScore: Number(row.fit_score || 0),
      fitReasons: Array.isArray(row.fit_reasons) ? row.fit_reasons.slice(0, 3) : [],
      evidenceGaps: Array.isArray(row.evidence_gaps) ? row.evidence_gaps.slice(0, 2) : [],
      referralAngle: row.referral_angle || null,
      sourceUrl: row.source_url || null,
      nextAction: row.next_action || null,
    }));
  const ids = new Set(leadRows.map((row: any) => String(row.id)));
  const corporateWorkItems = (workItems || []).filter((item: any) => {
    if (ids.has(String(item.source_id || ""))) return true;
    const metadata = item.metadata && typeof item.metadata === "object" ? item.metadata : {};
    return metadata.segment === "corporate_homes" || metadata.request_type === "corporate-home";
  });

  const now = Date.now();
  const thirtyDaysAgo = now - 30 * 86_400_000;
  const stages = leadRows.reduce<Record<string, number>>((acc, row: any) => {
    const stage = String(row.pipeline_status || "NEW").toUpperCase();
    acc[stage] = (acc[stage] || 0) + 1;
    return acc;
  }, {});

  const activeRows = leadRows.filter((row: any) => ACTIVE.has(String(row.pipeline_status || "NEW").toUpperCase()));
  const pipelineValue = activeRows.reduce((sum: number, row: any) => sum + Number(row.pipeline_value || 0), 0);
  const new30d = leadRows.filter((row: any) => {
    const value = Date.parse(String(row.created_at || row.updated_at || ""));
    return Number.isFinite(value) && value >= thirtyDaysAgo;
  }).length;
  const dueNow = activeRows.filter((row: any) => {
    const value = Date.parse(String(row.next_followup || ""));
    return Number.isFinite(value) && value <= now;
  }).length;

  const channelOrder = ["google", "linkedin", "meta", "event", "outbound", "organic", "other"];
  const channelMap = new Map<string, {
    key: string;
    label: string;
    leads: number;
    new30d: number;
    active: number;
    qualified: number;
    pipelineValue: number;
    campaigns: Map<string, number>;
  }>();
  for (const row of leadRows) {
    const attribution = acquisitionChannel(row);
    const current = channelMap.get(attribution.key) || {
      key: attribution.key,
      label: attribution.label,
      leads: 0,
      new30d: 0,
      active: 0,
      qualified: 0,
      pipelineValue: 0,
      campaigns: new Map<string, number>(),
    };
    current.leads += 1;
    const created = Date.parse(String(row.created_at || row.updated_at || ""));
    if (Number.isFinite(created) && created >= thirtyDaysAgo) current.new30d += 1;
    const stage = String(row.pipeline_status || "NEW").toUpperCase();
    if (ACTIVE.has(stage)) current.active += 1;
    if (QUALIFIED_STAGES.has(stage)) current.qualified += 1;
    if (ACTIVE.has(stage)) current.pipelineValue += Number(row.pipeline_value || 0);
    if (attribution.campaign) {
      current.campaigns.set(attribution.campaign, (current.campaigns.get(attribution.campaign) || 0) + 1);
    }
    channelMap.set(attribution.key, current);
  }
  const acquisitionChannels = [...channelMap.values()]
    .map((channel) => ({
      key: channel.key,
      label: channel.label,
      leads: channel.leads,
      new30d: channel.new30d,
      active: channel.active,
      qualified: channel.qualified,
      pipelineValue: channel.pipelineValue,
      leadToQualifiedRate: channel.leads ? Math.round((channel.qualified / channel.leads) * 100) : 0,
      topCampaigns: [...channel.campaigns.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([campaign, leads]) => ({ campaign, leads })),
    }))
    .sort((a, b) => {
      const rank = (key: string) => {
        const index = channelOrder.indexOf(key);
        return index === -1 ? 99 : index;
      };
      return rank(a.key) - rank(b.key);
    });

  const eventParticipants = eventParticipantRows || [];
  const eventRegistrations = eventParticipants.length;
  const eventAttended = eventParticipants.filter((row: any) =>
    ["ATTENDED", "CTA_CLICKED", "ASSESSMENT_REQUESTED"].includes(String(row.status || "").toUpperCase()),
  ).length;
  const eventNoShows = eventParticipants.filter((row: any) =>
    String(row.status || "").toUpperCase() === "NO_SHOW",
  ).length;
  const eventCtaClicks = eventParticipants.filter((row: any) =>
    Boolean(row.cta_clicked_at) ||
    ["CTA_CLICKED", "ASSESSMENT_REQUESTED"].includes(String(row.status || "").toUpperCase()),
  ).length;
  const eventAssessmentRequestsFromLedger = eventParticipants.filter((row: any) =>
    Boolean(row.assessment_requested_at) ||
    String(row.status || "").toUpperCase() === "ASSESSMENT_REQUESTED",
  ).length;
  const eventAssessmentRequestsFromLeads = leadRows.filter(isEventSourcedAssessment).length;
  const eventAssessmentRequests = Math.max(
    eventAssessmentRequestsFromLedger,
    eventAssessmentRequestsFromLeads,
  );

  const prospectTierCounts = prospectRows.reduce<Record<string, number>>((acc, row: any) => {
    const tier = String(row.fit_tier || "UNSCORED").toUpperCase();
    acc[tier] = (acc[tier] || 0) + 1;
    return acc;
  }, {});
  const prospectStatusCounts = prospectRows.reduce<Record<string, number>>((acc, row: any) => {
    const status = String(row.status || "DISCOVERED").toUpperCase();
    acc[status] = (acc[status] || 0) + 1;
    return acc;
  }, {});
  const promotedProspects = prospectRows.filter((row: any) => Boolean(row.converted_contact_id)).length;

  const signalResearchRows = prospectRows.filter((row: any) => {
    const evidence = row.evidence && typeof row.evidence === "object" ? row.evidence : {};
    const research = evidence.company_signal_research;
    return Boolean(research && typeof research === "object" && research.checked_at);
  });
  const signalBackedProspects = prospectRows.filter((row: any) => {
    const evidence = row.evidence && typeof row.evidence === "object" ? row.evidence : {};
    return Boolean(
      evidence.employee_benefit_signal ||
      evidence.remote_workforce_signal ||
      evidence.retreat_signal ||
      evidence.existing_cabin_signal
    );
  });
  const signalBackedATier = signalBackedProspects.filter((row: any) => String(row.fit_tier || "").toUpperCase() === "A").length;

  const genericContactFor = (row: any) => {
    const evidence = row?.evidence && typeof row.evidence === "object" ? row.evidence : {};
    const contact = evidence.generic_company_contact;
    return contact && typeof contact === "object" ? contact : null;
  };
  const allCompanyRows = [...partners, ...prospectRows];
  const genericContactRows = allCompanyRows.filter((row: any) => Boolean(genericContactFor(row)?.checked_at));
  const genericEmailRows = allCompanyRows.filter((row: any) => Boolean(genericContactFor(row)?.generic_email));
  const contactPageRows = allCompanyRows.filter((row: any) => Boolean(genericContactFor(row)?.contact_page_url));

  const { data: corporateRevenueEvents, error: corporateRevenueEventsError } = await supabase
    .from("revenue_events")
    .select("id,event_type,contact_id,occurred_at,source_system,source_type,source_id,metadata")
    .eq("brand_id", "zeneco")
    .eq("source_system", "corporate_homes")
    .in("event_type", ["viewing_completed", "offer_made"])
    .order("occurred_at", { ascending: false })
    .limit(1000);

  const revenueEvents = corporateRevenueEventsError ? [] : (corporateRevenueEvents || []);
  const viewingContactIds = new Set(
    revenueEvents
      .filter((event: any) => event.event_type === "viewing_completed" && event.contact_id)
      .map((event: any) => String(event.contact_id)),
  );
  const offerContactIds = new Set(
    revenueEvents
      .filter((event: any) => event.event_type === "offer_made" && event.contact_id)
      .map((event: any) => String(event.contact_id)),
  );

  const prospectStatus = (row: any) => String(row.status || "DISCOVERED").toUpperCase();
  const contactedProspects = prospectRows.filter((row: any) =>
    ["CONTACTED", "ENGAGED", "MEETING", "OPPORTUNITY"].includes(prospectStatus(row)),
  ).length;
  const engagedProspects = prospectRows.filter((row: any) =>
    ["ENGAGED", "MEETING", "OPPORTUNITY"].includes(prospectStatus(row)),
  ).length;
  const meetingProspects = prospectRows.filter((row: any) =>
    ["MEETING", "OPPORTUNITY"].includes(prospectStatus(row)),
  ).length;
  const opportunityProspects = prospectRows.filter((row: any) => prospectStatus(row) === "OPPORTUNITY").length;

  const rate = (numerator: number, denominator: number) =>
    denominator > 0 ? Math.round((numerator / denominator) * 100) : 0;

  const corporateRevenueFunnel = {
    documentedOnly: true,
    totalProspects: prospectRows.length,
    promotedToCrm: promotedProspects,
    contacted: contactedProspects,
    engaged: engagedProspects,
    meetings: meetingProspects,
    opportunities: opportunityProspects,
    viewingCompanies: viewingContactIds.size,
    offerCompanies: offerContactIds.size,
    rates: {
      prospectToContacted: rate(contactedProspects, prospectRows.length),
      contactedToMeeting: rate(meetingProspects, contactedProspects),
      meetingToOpportunity: rate(opportunityProspects, meetingProspects),
      opportunityToViewing: rate(viewingContactIds.size, opportunityProspects),
      viewingToOffer: rate(offerContactIds.size, viewingContactIds.size),
    },
    latestConfirmedOutcomeAt: revenueEvents[0]?.occurred_at || null,
    revenueEventsReady: !corporateRevenueEventsError,
  };

  const outcomeByChannel = new Map<string, { viewingCompanies: number; offerCompanies: number }>();
  for (const row of leadRows) {
    const contactId = String(row.id || "");
    if (!contactId || (!viewingContactIds.has(contactId) && !offerContactIds.has(contactId))) continue;
    const channel = acquisitionChannel(row);
    const current = outcomeByChannel.get(channel.key) || { viewingCompanies: 0, offerCompanies: 0 };
    if (viewingContactIds.has(contactId)) current.viewingCompanies += 1;
    if (offerContactIds.has(contactId)) current.offerCompanies += 1;
    outcomeByChannel.set(channel.key, current);
  }

  const acquisitionChannelsWithRevenue = acquisitionChannels.map((channel) => {
    const outcome = outcomeByChannel.get(channel.key) || { viewingCompanies: 0, offerCompanies: 0 };
    return {
      ...channel,
      viewingCompanies: outcome.viewingCompanies,
      offerCompanies: outcome.offerCompanies,
      leadToViewingRate: channel.leads ? Math.round((outcome.viewingCompanies / channel.leads) * 100) : 0,
      viewingToOfferRate: outcome.viewingCompanies ? Math.round((outcome.offerCompanies / outcome.viewingCompanies) * 100) : 0,
    };
  });

  const focusProspects = prospectRows
    .filter((row: any) => !row.converted_contact_id)
    .filter((row: any) => String(row.status || "").toUpperCase() !== "DISQUALIFIED")
    .map((row: any) => ({
      ...row,
      readiness: evaluateCorporateProspectReadiness(row),
    }))
    .filter((row: any) => ["A", "B"].includes(String(row.fit_tier || "").toUpperCase()))
    .sort((a: any, b: any) => {
      const manualContactDelta = Number(Boolean(b.readiness?.manualContactReady)) - Number(Boolean(a.readiness?.manualContactReady));
      if (manualContactDelta) return manualContactDelta;
      const qualificationDelta = Number(Boolean(b.readiness?.qualificationReady)) - Number(Boolean(a.readiness?.qualificationReady));
      if (qualificationDelta) return qualificationDelta;
      const tierRank = (value: string) => value === "A" ? 2 : value === "B" ? 1 : 0;
      const tierDelta = tierRank(String(b.fit_tier || "").toUpperCase()) - tierRank(String(a.fit_tier || "").toUpperCase());
      if (tierDelta) return tierDelta;
      const readinessDelta = Number(b.readiness?.score || 0) - Number(a.readiness?.score || 0);
      if (readinessDelta) return readinessDelta;
      const fitDelta = Number(b.fit_score || 0) - Number(a.fit_score || 0);
      if (fitDelta) return fitDelta;
      return Date.parse(String(b.updated_at || "")) - Date.parse(String(a.updated_at || ""));
    })
    .slice(0, 8)
    .map((row: any) => ({
      id: row.id,
      companyName: row.company_name,
      organizationNumber: row.organization_number,
      domain: row.domain,
      industry: row.industry,
      size: ["association", "member_organization"].includes(String(row.organization_type || "").toLowerCase())
        ? row.member_count ? `${row.member_count.toLocaleString("nb-NO")} medlemmer` : "Medlemsbase ukjent"
        : row.employee_count ? `${row.employee_count.toLocaleString("nb-NO")} ansatte` : row.employee_band || "Størrelse ukjent",
      status: String(row.status || "DISCOVERED").toUpperCase(),
      fitTier: String(row.fit_tier || "UNSCORED").toUpperCase(),
      fitScore: Number(row.fit_score || 0),
      fitReasons: Array.isArray(row.fit_reasons) ? row.fit_reasons.slice(0, 3) : [],
      evidenceGaps: Array.isArray(row.evidence_gaps) ? row.evidence_gaps.slice(0, 3) : [],
      nextAction: row.next_action || null,
      sourceUrl: row.source_url || null,
      readiness: row.readiness,
    }));

  return NextResponse.json({
    corporateHomes: {
      generatedAt: new Date().toISOString(),
      summary: {
        totalLeads: leadRows.length,
        activeLeads: activeRows.length,
        new30d,
        dueNow,
        openWorkItems: corporateWorkItems.filter((item: any) => !["DONE", "CANCELLED"].includes(String(item.status || "").toUpperCase())).length,
        pipelineValue,
      },
      revenueFunnel: corporateRevenueFunnel,
      eventFunnel: {
        registered: eventRegistrations.length,
        attended: eventAttended,
        noShow: eventNoShows,
        ctaClicks: eventCtaClicks,
        assessmentRequests: eventAssessmentRequests,
        attendanceRate: rate(eventAttended, eventRegistrations.length),
        attendeeToAssessmentRate: rate(eventAssessmentRequests, eventAttended),
        registrationIsLead: false,
        attendanceQualifiesAutomatically: false,
      },
      growthReview: lastCorporateGrowthReview
        ? {
            status: lastCorporateGrowthReview.status,
            at: lastCorporateGrowthReview.created_at,
            review: (lastCorporateGrowthReview.details as any)?.review || null,
            comparison: (lastCorporateGrowthReview.details as any)?.comparison || null,
            improvement: corporateGrowthImprovement,
          }
        : null,
      acquisition: {
        channels: acquisitionChannelsWithRevenue,
        attributionRule: "Første Corporate-sideinteraksjon med UTM brukes som acquisition-kilde; ellers brukes kontaktens kilde og faller tilbake til organisk/direkte.",
        periodDays: 30,
      },
      partners: {
        total: partners.length,
        target: 100,
        progressPercent: Math.min(100, Math.round((partners.length / 100) * 100)),
        aTier: partnerTierCounts.A || 0,
        bTier: partnerTierCounts.B || 0,
        engaged: (partnerStatusCounts.ENGAGED || 0) + (partnerStatusCounts.PARTNER || 0),
        focusPartners,
        statusCounts: partnerStatusCounts,
        tierCounts: partnerTierCounts,
        lastDiscovery: lastPartnerDiscovery || null,
        personalEnrichmentStarted: false,
        automaticOutreach: false,
      },
      genericContacts: {
        researched: genericContactRows.length,
        genericEmails: genericEmailRows.length,
        contactPages: contactPageRows.length,
        dailyBatch: 10,
        companyLevelOnly: true,
        personalDataCollected: false,
        automaticOutreach: false,
        lastRun: lastGenericContactRun || null,
      },
      prospects: {
        total: prospectRows.length,
        target: 250,
        progressPercent: Math.min(100, Math.round((prospectRows.length / 250) * 100)),
        aTier: prospectTierCounts.A || 0,
        bTier: prospectTierCounts.B || 0,
        qualified: (prospectStatusCounts.QUALIFIED || 0) + (prospectStatusCounts.CONTACT_READY || 0),
        promoted: promotedProspects,
        signalsResearched: signalResearchRows.length,
        signalBacked: signalBackedProspects.length,
        signalBackedATier,
        lastSignalResearch: lastSignalResearchRun || null,
        focusProspects,
        focusRule: "Klar for manuell kontakt via selskapskanal → klar for menneskelig kvalifisering → A-fit før B-fit → readiness-score → fit-score → sist oppdatert.",
        statusCounts: prospectStatusCounts,
        tierCounts: prospectTierCounts,
        discovery: {
          enabled: discoveryControl?.enabled ?? null,
          riskLevel: discoveryControl?.risk_level || null,
          config: discoveryControl?.config || null,
          lastRun: lastDiscovery || null,
        },
      },
      contentEngine: {
        cadence: "Mandag 06:40 UTC",
        draftsPerWeek: 3,
        platforms: ["linkedin", "facebook"],
        externalPublishing: false,
        nextTopics: corporateOrganicTopicsForWeek(new Date()).map((topic) => ({
          slug: topic.slug,
          title: topic.title,
          hook: topic.hook,
          teaser: topic.teaser,
          url: corporateArticleUrl(topic.slug),
        })),
        lastRun: lastContentDraftRun || null,
      },
      stages,
      contacts: leadRows.slice(0, 100).map((row: any) => ({
        id: row.id,
        name: row.name,
        email: row.email,
        phone: row.phone,
        stage: String(row.pipeline_status || "NEW").toUpperCase(),
        pipelineValue: Number(row.pipeline_value || 0),
        propertyInterest: row.property_interest,
        nextFollowup: row.next_followup,
        lastContact: row.last_contact,
        updatedAt: row.updated_at,
        source: row.source,
      })),
      workItems: corporateWorkItems.slice(0, 100),
    },
    warnings: [workItemsError, prospectsError, lastDiscoveryError, discoveryControlError, lastContentDraftRunError, partnerError, lastPartnerDiscoveryError, eventParticipantsError, lastSignalResearchRunError, lastGenericContactRunError, lastCorporateGrowthReviewError, continuousImprovementWarning, corporateRevenueEventsError].filter(Boolean).map((item: any) => item.message),
  });
}
