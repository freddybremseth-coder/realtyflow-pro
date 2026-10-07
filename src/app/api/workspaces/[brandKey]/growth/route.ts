import { NextRequest, NextResponse } from "next/server";
import { requireBrandWorkspace } from "@/lib/workspaces/require-brand-workspace";
import type { WorkspacePermission } from "@/lib/workspaces/brand-policy";
import { evaluateCorporateProspectReadiness } from "@/lib/corporate-prospect-readiness";

export const dynamic = "force-dynamic";
export const revalidate = 0;
const noStore = { "Cache-Control": "private, no-store" };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const KIND_PERMISSION: Record<string, WorkspacePermission> = {
  corporate: "corporate.plan",
  seo: "visibility.plan",
  geo: "visibility.plan",
  aeo: "visibility.plan",
  keywords: "visibility.plan",
  content: "visibility.plan",
  ads: "ads.draft",
  video: "events.plan",
  info_meeting: "events.plan",
};

function fail(status: number, code: string) {
  return NextResponse.json({ ok: false, error: { code } }, { status, headers: noStore });
}

function safeWrite(request: NextRequest) {
  const origin = request.headers.get("origin");
  return request.headers.get("content-type")?.toLowerCase().startsWith("application/json") &&
    (!origin || origin === new URL(request.url).origin) &&
    request.headers.get("sec-fetch-site") !== "cross-site";
}

async function growthReadAccess(request: NextRequest, brandKey: string) {
  for (const permission of ["corporate.read", "visibility.read", "ads.read", "events.plan"] as WorkspacePermission[]) {
    const access = await requireBrandWorkspace(request, brandKey, permission);
    if (access.value) return access;
    if (access.response.status === 401 || access.response.status === 503) return access;
  }
  return { value: null, response: fail(403, "ACCESS_DENIED") };
}

function ownerCorporateRow(row: any) {
  return {
    id: row.id,
    companyName: row.company_name,
    organizationType: row.organization_type,
    countryCode: row.country_code,
    city: row.city,
    industry: row.industry,
    employeeCount: row.employee_count,
    memberCount: row.member_count,
    websiteUrl: row.website_url,
    linkedinCompanyUrl: row.linkedin_company_url,
    status: row.status,
    fitScore: row.fit_score,
    fitTier: row.fit_tier,
    fitReasons: row.fit_reasons,
    evidenceGaps: row.evidence_gaps,
    decisionRoles: row.decision_roles,
    sourceUrl: row.source_url,
    nextAction: row.next_action,
    nextFollowup: row.next_followup,
    updatedAt: row.updated_at,
  };
}

function ownerPartnerRow(row: any) {
  return {
    id: row.id,
    companyName: row.company_name,
    partnerType: row.partner_type,
    countryCode: row.country_code,
    city: row.city,
    industry: row.industry,
    employeeCount: row.employee_count,
    websiteUrl: row.website_url,
    status: row.status,
    fitScore: row.fit_score,
    fitTier: row.fit_tier,
    fitReasons: row.fit_reasons,
    evidenceGaps: row.evidence_gaps,
    referralAngle: row.referral_angle,
    sourceUrl: row.source_url,
    nextAction: row.next_action,
    nextFollowup: row.next_followup,
    updatedAt: row.updated_at,
  };
}

function countTop(rows: any[], key: "source" | "path") {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const value = String(row?.[key] || "").trim();
    if (!value) continue;
    counts.set(value, (counts.get(value) || 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([value, arrivals]) => ({ [key]: value, arrivals }))
    .sort((a: any, b: any) => b.arrivals - a.arrivals || String(a[key]).localeCompare(String(b[key])))
    .slice(0, 20);
}

async function ownerGrowthSnapshot(supabase: any, brandKey: string) {
  const since30 = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const corporateProspects = brandKey === "zeneco"
    ? supabase.from("corporate_prospects")
        .select("id,company_name,organization_type,country_code,city,industry,employee_count,member_count,website_url,linkedin_company_url,status,fit_score,fit_tier,fit_reasons,evidence_gaps,decision_roles,source_url,next_action,next_followup,updated_at")
        .eq("brand_id", "zeneco").order("fit_score", { ascending: false }).order("updated_at", { ascending: false }).limit(100)
    : Promise.resolve({ data: [], error: null });
  const corporatePartners = brandKey === "zeneco"
    ? supabase.from("corporate_partner_prospects")
        .select("id,company_name,partner_type,country_code,city,industry,employee_count,website_url,status,fit_score,fit_tier,fit_reasons,evidence_gaps,referral_angle,source_url,next_action,next_followup,updated_at")
        .eq("brand_id", "zeneco").order("fit_score", { ascending: false }).order("updated_at", { ascending: false }).limit(100)
    : Promise.resolve({ data: [], error: null });

  const [prospectsR, partnersR, discoveryR, seoWorkR, adsR, plannedR, seoLogR] = await Promise.all([
    corporateProspects,
    corporatePartners,
    supabase.from("search_discovery_events")
      .select("source,path,occurred_at").eq("brand_id", brandKey).gte("occurred_at", since30).limit(5000),
    supabase.from("work_items")
      .select("id,title,description,status,priority,due_date,next_action,updated_at")
      .eq("brand_id", brandKey).eq("assigned_agent", "seo").in("status", ["TO_DO","IN_PROGRESS","REVIEW"])
      .order("updated_at", { ascending: false }).limit(60),
    supabase.from("ad_campaigns")
      .select("id,name,product_name,target_markets,audience_segments,funnel_stage,offer,status,total_creatives,estimated_cost_usd,growth_goal,created_at,updated_at")
      .eq("brand_id", brandKey).order("updated_at", { ascending: false }).limit(50),
    supabase.from("work_items")
      .select("id,title,description,status,priority,due_date,next_action,source_id,metadata,updated_at")
      .eq("brand_id", brandKey).contains("metadata", { workspace_growth: true })
      .order("updated_at", { ascending: false }).limit(100),
    supabase.from("automation_logs")
      .select("created_at,details").eq("action", "seo_gsc_live_read").order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);

  const failed = [prospectsR, partnersR, discoveryR, seoWorkR, adsR, plannedR, seoLogR].find((result: any) => result?.error);
  if (failed?.error) throw new Error(failed.error.message || "OWNER_GROWTH_SNAPSHOT_FAILED");

  const details = seoLogR.data?.details && typeof seoLogR.data.details === "object" ? seoLogR.data.details : {};
  const gsc = Array.isArray((details as any).google_search_console)
    ? (details as any).google_search_console.find((item: any) => String(item?.brandId || "") === brandKey)
    : null;
  const diagnostics = Array.isArray((details as any).diagnostics)
    ? (details as any).diagnostics.filter((item: any) => String(item?.brandId || "") === brandKey).map((item: any) => ({
        kind: item?.kind, title: item?.title, category: item?.category,
        finding: item?.finding, evidence: item?.evidence, nextStep: item?.nextStep,
      }))
    : [];

  return {
    permissions: {
      corporateRead: brandKey === "zeneco",
      corporatePlan: brandKey === "zeneco",
      visibilityRead: true,
      visibilityPlan: true,
      adsRead: true,
      adsDraft: true,
      eventsPlan: true,
    },
    corporate: brandKey === "zeneco" ? {
      prospects: (prospectsR.data || []).map(ownerCorporateRow),
      partners: (partnersR.data || []).map(ownerPartnerRow),
    } : null,
    visibility: {
      searchDiscovery: countTop(discoveryR.data || [], "source"),
      topPaths: countTop(discoveryR.data || [], "path"),
      seoWork: (seoWorkR.data || []).map((row: any) => ({
        id: row.id, title: row.title, description: row.description, status: row.status,
        priority: row.priority, dueDate: row.due_date, nextAction: row.next_action, updatedAt: row.updated_at,
      })),
      seoSam: {
        collectedAt: seoLogR.data?.created_at || null,
        gsc: gsc ? { status: gsc.status, error: gsc.error, result: gsc.result } : null,
        diagnostics,
      },
    },
    ads: (adsR.data || []).map((row: any) => ({
      id: row.id, name: row.name, productName: row.product_name,
      targetMarkets: row.target_markets, audienceSegments: row.audience_segments,
      funnelStage: row.funnel_stage, offer: row.offer, status: row.status,
      totalCreatives: row.total_creatives, estimatedCostUsd: row.estimated_cost_usd,
      growthGoal: row.growth_goal, createdAt: row.created_at, updatedAt: row.updated_at,
    })),
    plannedWork: (plannedR.data || []).map((row: any) => ({
      id: row.id, kind: row.metadata?.workspace_kind || "", title: row.title,
      description: row.description, status: row.status, priority: row.priority,
      dueDate: row.due_date, nextAction: row.next_action, sourceId: row.source_id, updatedAt: row.updated_at,
    })),
  };
}

export async function GET(
  request: NextRequest,
  { params }: { params: { brandKey: string } },
) {
  const access = await growthReadAccess(request, params.brandKey);
  if (!access.value) return access.response;

  let payload: Record<string, any>;
  if (access.value.role === "OWNER") {
    try {
      payload = await ownerGrowthSnapshot(access.value.supabase, params.brandKey);
    } catch {
      return fail(503, "GROWTH_WORKSPACE_UNAVAILABLE");
    }
  } else {
    if (!access.value.verifiedUserId) return fail(403, "STAFF_ONLY");
    const { data, error } = await access.value.supabase.rpc("workspace_brand_growth_snapshot", {
      p_brand_key: params.brandKey,
      p_user_id: access.value.verifiedUserId,
      p_email: access.value.verifiedEmail,
    });
    if (error || !data || typeof data !== "object" || Array.isArray(data)) {
      return fail(503, "GROWTH_WORKSPACE_UNAVAILABLE");
    }
    payload = data as Record<string, any>;
  }
  if (params.brandKey === "zeneco" && payload.corporate && typeof payload.corporate === "object") {
    const prospects = Array.isArray(payload.corporate.prospects) ? payload.corporate.prospects : [];
    const partners = Array.isArray(payload.corporate.partners) ? payload.corporate.partners : [];
    const prospectIds = prospects.map((row: any) => String(row?.id || "")).filter(Boolean);
    const partnerIds = partners.map((row: any) => String(row?.id || "")).filter(Boolean);

    const [prospectDetails, partnerDetails, referralContacts] = await Promise.all([
      prospectIds.length
        ? access.value.supabase
            .from("corporate_prospects")
            .select("id,organization_number,domain,website_url,industry,employee_count,employee_band,member_count,organization_type,status,fit_tier,fit_score,source_url,decision_roles,evidence_gaps,evidence")
            .eq("brand_id", "zeneco")
            .in("id", prospectIds)
        : Promise.resolve({ data: [], error: null }),
      partnerIds.length
        ? access.value.supabase
            .from("corporate_partner_prospects")
            .select("id,evidence,status")
            .eq("brand_id", "zeneco")
            .in("id", partnerIds)
        : Promise.resolve({ data: [], error: null }),
      partnerIds.length
        ? access.value.supabase
            .from("contacts")
            .select("id,pipeline_status,pipeline_value,interactions")
            .eq("brand_id", "zeneco")
            .limit(2000)
        : Promise.resolve({ data: [], error: null }),
    ]);

    if (prospectDetails.error || partnerDetails.error || referralContacts.error) {
      return fail(503, "GROWTH_WORKSPACE_UNAVAILABLE");
    }

    const readinessById = new Map(
      (prospectDetails.data || []).map((row: any) => [
        String(row.id),
        evaluateCorporateProspectReadiness(row),
      ]),
    );
    const partnerChannelById = new Map(
      (partnerDetails.data || []).map((row: any) => {
        const evidence = row?.evidence && typeof row.evidence === "object" ? row.evidence : {};
        const companyContact = evidence.generic_company_contact && typeof evidence.generic_company_contact === "object"
          ? evidence.generic_company_contact as Record<string, unknown>
          : {};
        return [String(row.id), Boolean(
          String(companyContact.generic_email || "").trim() ||
          String(companyContact.contact_page_url || "").trim(),
        )];
      }),
    );

    const partnerReferralStats = new Map<string, {
      leads: number;
      active: number;
      qualified: number;
      won: number;
      pipelineValue: number;
    }>();
    for (const contact of referralContacts.data || []) {
      const interactions = Array.isArray((contact as any).interactions) ? (contact as any).interactions : [];
      const partnerIdsForContact = new Set<string>();
      for (const interaction of interactions) {
        const metadata = interaction?.metadata && typeof interaction.metadata === "object" ? interaction.metadata : {};
        const referralPartnerId = String(metadata.referral_partner_id || "").trim();
        if (uuid.test(referralPartnerId)) partnerIdsForContact.add(referralPartnerId);
      }
      for (const partnerId of partnerIdsForContact) {
        if (!partnerIds.includes(partnerId)) continue;
        const current = partnerReferralStats.get(partnerId) || {
          leads: 0, active: 0, qualified: 0, won: 0, pipelineValue: 0,
        };
        const stage = String((contact as any).pipeline_status || "").toUpperCase();
        current.leads += 1;
        if (["NEW","CONTACT","QUALIFIED","MATCHING","VIEWING","NEGOTIATION","RESERVED","ON_HOLD"].includes(stage)) current.active += 1;
        if (["QUALIFIED","MATCHING","VIEWING","NEGOTIATION","RESERVED","WON"].includes(stage)) current.qualified += 1;
        if (stage === "WON") current.won += 1;
        if (!["LOST"].includes(stage)) current.pipelineValue += Number((contact as any).pipeline_value || 0);
        partnerReferralStats.set(partnerId, current);
      }
    }

    payload = {
      ...payload,
      corporate: {
        ...payload.corporate,
        prospects: prospects.map((row: any) => ({
          ...row,
          readiness: readinessById.get(String(row.id)) || null,
        })),
        partners: partners.map((row: any) => ({
          ...row,
          companyChannelReady: partnerChannelById.get(String(row.id)) || false,
          referralUrl: `https://www.zenecohomes.com/bedriftshytte-spania?utm_source=corporate_partner&utm_medium=referral&partner=${encodeURIComponent(String(row.id))}`,
          referralStats: partnerReferralStats.get(String(row.id)) || {
            leads: 0, active: 0, qualified: 0, won: 0, pipelineValue: 0,
          },
        })),
      },
    };
  }

  return NextResponse.json({ ok: true, brand: params.brandKey, ...payload }, { headers: noStore });
}

export async function POST(
  request: NextRequest,
  { params }: { params: { brandKey: string } },
) {
  if (!safeWrite(request)) return fail(403, "INVALID_REQUEST_ORIGIN");
  const input: unknown = await request.json().catch(() => null);
  if (!input || typeof input !== "object" || Array.isArray(input)) return fail(400, "INVALID_WORK_ITEM");
  const body = input as Record<string, unknown>;
  const action = typeof body.action === "string" ? body.action.trim() : "";

  if (action === "partner_progress") {
    if (params.brandKey !== "zeneco") return fail(400, "INVALID_BRAND");
    const access = await requireBrandWorkspace(request, params.brandKey, "corporate.plan");
    if (!access.value) return access.response;
    if (!access.value.verifiedUserId) return fail(403, "STAFF_ONLY");

    const partnerId = typeof body.partnerId === "string" ? body.partnerId.trim() : "";
    const progressAction = typeof body.progressAction === "string" ? body.progressAction.trim() : "";
    if (!uuid.test(partnerId) || !["mark_engaged","record_meeting","activate_partner","disqualify"].includes(progressAction)) {
      return fail(400, "INVALID_PARTNER_PROGRESS");
    }

    const { data: partner, error: partnerError } = await access.value.supabase
      .from("corporate_partner_prospects")
      .select("id,status,evidence")
      .eq("id", partnerId)
      .eq("brand_id", "zeneco")
      .maybeSingle();
    if (partnerError || !partner) return fail(404, "PARTNER_NOT_FOUND");

    const now = new Date().toISOString();
    const evidence = partner.evidence && typeof partner.evidence === "object" && !Array.isArray(partner.evidence)
      ? partner.evidence as Record<string, unknown>
      : {};
    let status = String(partner.status || "DISCOVERED").toUpperCase();
    let nextAction = "";
    let nextFollowup: string | null = null;
    const nextEvidence: Record<string, unknown> = { ...evidence };

    if (progressAction === "mark_engaged") {
      if (status !== "PARTNER") status = "ENGAGED";
      nextEvidence.partner_engaged_at = now;
      nextAction = "Avklar om partneren ønsker en kort partnersamtale og hvilken introduksjonsmodell som passer.";
      nextFollowup = new Date(Date.now() + 3 * 86400000).toISOString();
    } else if (progressAction === "record_meeting") {
      if (status !== "PARTNER") status = "ENGAGED";
      nextEvidence.partner_meeting_at = now;
      nextAction = "Dokumenter avtalt samarbeidsmodell, ansvar og neste konkrete henvisnings- eller aktivitetstest.";
      nextFollowup = new Date(Date.now() + 3 * 86400000).toISOString();
    } else if (progressAction === "activate_partner") {
      status = "PARTNER";
      nextEvidence.partner_activated_at = now;
      nextAction = "Del partnerlenken og følg henviste Corporate-leads fra første henvendelse til dokumentert salg.";
      nextFollowup = new Date(Date.now() + 7 * 86400000).toISOString();
    } else {
      status = "DISQUALIFIED";
      nextEvidence.partner_disqualified_at = now;
      nextAction = "Ingen videre partneroppfølging.";
      nextFollowup = null;
    }

    const { data: updated, error: updateError } = await access.value.supabase
      .from("corporate_partner_prospects")
      .update({
        status,
        evidence: nextEvidence,
        next_action: nextAction,
        next_followup: nextFollowup,
        updated_at: now,
      })
      .eq("id", partnerId)
      .eq("brand_id", "zeneco")
      .select("id,status,next_action,next_followup,evidence")
      .single();
    if (updateError || !updated) return fail(409, "PARTNER_PROGRESS_UPDATE_FAILED");

    return NextResponse.json({
      ok: true,
      brand: params.brandKey,
      partner: updated,
      externalAction: false,
      emailSent: false,
      invitationSent: false,
    }, { headers: noStore });
  }

  const kind = typeof body.kind === "string" ? body.kind.trim() : "";
  const permission = KIND_PERMISSION[kind];
  if (!permission) return fail(400, "INVALID_WORK_KIND");

  const access = await requireBrandWorkspace(request, params.brandKey, permission);
  if (!access.value) return access.response;
  if (!access.value.verifiedUserId) return fail(403, "STAFF_ONLY");

  const title = typeof body.title === "string" ? body.title.trim() : "";
  const description = typeof body.description === "string" ? body.description.trim() : "";
  const nextAction = typeof body.nextAction === "string" ? body.nextAction.trim() : "";
  const sourceId = typeof body.sourceId === "string" ? body.sourceId.trim() : "";
  const priority = typeof body.priority === "string" ? body.priority.trim().toUpperCase() : "MEDIUM";
  const dueDate = typeof body.dueDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.dueDate)
    ? body.dueDate : null;

  if (title.length < 2 || title.length > 180 || description.length > 4000 ||
      nextAction.length > 1000 || sourceId.length > 200 ||
      !["CRITICAL","HIGH","MEDIUM","LOW"].includes(priority) ||
      (body.dueDate != null && dueDate === null)) {
    return fail(400, "INVALID_WORK_ITEM");
  }

  const { data, error } = await access.value.supabase.rpc("workspace_brand_growth_work_create", {
    p_brand_key: params.brandKey,
    p_user_id: access.value.verifiedUserId,
    p_email: access.value.verifiedEmail,
    p_kind: kind,
    p_title: title,
    p_description: description,
    p_next_action: nextAction,
    p_due_date: dueDate,
    p_priority: priority,
    p_source_id: sourceId,
  });
  if (error || !data || typeof data !== "object" || Array.isArray(data)) {
    return fail(503, "GROWTH_WORK_CREATE_FAILED");
  }

  return NextResponse.json({
    ok: true,
    brand: params.brandKey,
    workItem: data,
    externalAction: false,
    published: false,
    adSpendStarted: false,
    invitationSent: false,
  }, { status: 201, headers: noStore });
}
