import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminApi } from "@/lib/api-admin";
import { evaluateCorporateProspectReadiness } from "@/lib/corporate-prospect-readiness";
import { corporateArticleUrl, corporateOrganicTopicsForWeek } from "@/lib/corporate-organic-content";

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

function acquisitionIdentity(row: any) {
  const interactions = Array.isArray(row?.interactions) ? [...row.interactions].reverse() : [];
  const website = interactions.find((item: any) => {
    const metadata = item?.metadata && typeof item.metadata === "object" ? item.metadata : {};
    const page = String(metadata.page_url || "").toLowerCase();
    return Boolean(metadata.utm_source || metadata.utm_campaign || page.includes("/bedriftshytte-spania"));
  });
  const metadata = website?.metadata && typeof website.metadata === "object" ? website.metadata : {};
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
      .select("id,company_name,organization_number,domain,industry,employee_count,employee_band,member_count,organization_type,status,fit_tier,fit_score,fit_reasons,evidence_gaps,decision_roles,source_url,next_action,converted_contact_id,created_at,updated_at")
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

  const rows = contacts || [];
  const prospectRows = prospects || [];
  const ids = new Set(rows.map((row: any) => String(row.id)));
  const corporateWorkItems = (workItems || []).filter((item: any) => {
    if (ids.has(String(item.source_id || ""))) return true;
    const metadata = item.metadata && typeof item.metadata === "object" ? item.metadata : {};
    return metadata.segment === "corporate_homes" || metadata.request_type === "corporate-home";
  });

  const now = Date.now();
  const thirtyDaysAgo = now - 30 * 86_400_000;
  const stages = rows.reduce<Record<string, number>>((acc, row: any) => {
    const stage = String(row.pipeline_status || "NEW").toUpperCase();
    acc[stage] = (acc[stage] || 0) + 1;
    return acc;
  }, {});

  const activeRows = rows.filter((row: any) => ACTIVE.has(String(row.pipeline_status || "NEW").toUpperCase()));
  const pipelineValue = activeRows.reduce((sum: number, row: any) => sum + Number(row.pipeline_value || 0), 0);
  const new30d = rows.filter((row: any) => {
    const value = Date.parse(String(row.created_at || row.updated_at || ""));
    return Number.isFinite(value) && value >= thirtyDaysAgo;
  }).length;
  const dueNow = activeRows.filter((row: any) => {
    const value = Date.parse(String(row.next_followup || ""));
    return Number.isFinite(value) && value <= now;
  }).length;

  const channelOrder = ["google", "linkedin", "meta", "outbound", "organic", "other"];
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
  for (const row of rows) {
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

  const focusProspects = prospectRows
    .filter((row: any) => !row.converted_contact_id)
    .filter((row: any) => String(row.status || "").toUpperCase() !== "DISQUALIFIED")
    .map((row: any) => ({
      ...row,
      readiness: evaluateCorporateProspectReadiness(row),
    }))
    .filter((row: any) => ["A", "B"].includes(String(row.fit_tier || "").toUpperCase()))
    .sort((a: any, b: any) => {
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
        totalLeads: rows.length,
        activeLeads: activeRows.length,
        new30d,
        dueNow,
        openWorkItems: corporateWorkItems.filter((item: any) => !["DONE", "CANCELLED"].includes(String(item.status || "").toUpperCase())).length,
        pipelineValue,
      },
      acquisition: {
        channels: acquisitionChannels,
        attributionRule: "Første Corporate-sideinteraksjon med UTM brukes som acquisition-kilde; ellers brukes kontaktens kilde og faller tilbake til organisk/direkte.",
        periodDays: 30,
      },
      prospects: {
        total: prospectRows.length,
        target: 250,
        progressPercent: Math.min(100, Math.round((prospectRows.length / 250) * 100)),
        aTier: prospectTierCounts.A || 0,
        bTier: prospectTierCounts.B || 0,
        qualified: (prospectStatusCounts.QUALIFIED || 0) + (prospectStatusCounts.CONTACT_READY || 0),
        promoted: promotedProspects,
        focusProspects,
        focusRule: "Klar for menneskelig kvalifisering → A-fit før B-fit → readiness-score → fit-score → sist oppdatert.",
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
      contacts: rows.slice(0, 100).map((row: any) => ({
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
    warnings: [workItemsError, prospectsError, lastDiscoveryError, discoveryControlError, lastContentDraftRunError].filter(Boolean).map((item: any) => item.message),
  });
}
