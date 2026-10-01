import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/api-admin";
import { getServiceSupabase } from "@/services/marketing/campaign-production";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type CandidateSource = "corporate_buyer" | "corporate_partner";

function objectValue(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, any>
    : {};
}

function arrayValue(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String).filter(Boolean) : [];
}

function candidateFrom(row: any, source: CandidateSource) {
  const evidence = objectValue(row.evidence);
  const signalResearch = objectValue(evidence.company_signal_research);
  const signals = objectValue(signalResearch.signals);
  const contact = objectValue(evidence.generic_company_contact);
  const officialEmail = String(contact.generic_email || "").trim() || null;
  const contactPage = String(contact.contact_page_url || "").trim() || null;
  const website = String(row.website_url || row.domain || "").trim() || null;
  const signalEntries = Object.entries(signals).map(([key, value]) => {
    const detail = objectValue(value);
    return {
      key,
      sourceUrl: String(detail.source_url || "").trim() || null,
      terms: arrayValue(detail.matched_terms),
    };
  });
  const fitTier = String(row.fit_tier || "UNSCORED").toUpperCase();
  const fitScore = Number(row.fit_score || 0);
  const currentStatus = String(row.status || "DISCOVERED").toUpperCase();
  const researchChecked = Boolean(signalResearch.checked_at);
  const channelChecked = Boolean(contact.checked_at);
  const hasOfficialChannel = Boolean(officialEmail || contactPage);
  const hasWarmEvidence = signalEntries.length > 0 || (source === "corporate_partner" && Boolean(row.referral_angle));

  let stage = "DISCOVERED";
  if (researchChecked) stage = "RESEARCHED";
  if (hasOfficialChannel) stage = "CHANNEL_FOUND";
  if (hasOfficialChannel && (hasWarmEvidence || fitTier === "A")) stage = "READY_FOR_REVIEW";
  if (["CONTACT", "CONTACTED", "QUALIFIED", "PARTNER", "WON"].includes(currentStatus)) stage = "CONTACTED";

  let nextAction = "Kjør selskapsresearch automatisk.";
  let automationClass = "company_research";
  if (researchChecked && !hasOfficialChannel) {
    nextAction = "Finn offisiell selskapskanal automatisk.";
    automationClass = "official_channel_discovery";
  } else if (hasOfficialChannel && (hasWarmEvidence || fitTier === "A")) {
    nextAction = "Lag evidensbasert kontaktutkast automatisk. Første kalde utsendelse forblir blokkert/godkjenningsstyrt.";
    automationClass = "outreach_draft";
  } else if (hasOfficialChannel) {
    nextAction = "Offisiell kanal er klar. Fortsett selskapsresearch til et dokumentert kontaktgrunnlag finnes.";
    automationClass = "company_research";
  }

  return {
    id: String(row.id),
    source,
    brandId: "zeneco",
    companyName: String(row.company_name || "Ukjent selskap"),
    organizationNumber: row.organization_number || null,
    website,
    industry: row.industry || null,
    status: currentStatus,
    fitTier,
    fitScore,
    fitReasons: arrayValue(row.fit_reasons).slice(0, 4),
    evidenceGaps: arrayValue(row.evidence_gaps).slice(0, 3),
    referralAngle: row.referral_angle || null,
    signalEntries,
    researchCheckedAt: signalResearch.checked_at || null,
    officialChannel: {
      email: officialEmail,
      contactPage,
      checkedAt: contact.checked_at || null,
      companyLevelOnly: contact.company_level_only === true,
      personalDataCollected: contact.personal_data_collected === true,
    },
    stage,
    hasWarmEvidence,
    nextAction,
    automationClass,
  };
}

export async function GET(request: NextRequest) {
  const denied = await requireAdminApi(request);
  if (denied) return denied;
  const supabase = getServiceSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  const [{ data: prospects, error: prospectError }, { data: partners, error: partnerError }, { data: policies, error: policyError }] = await Promise.all([
    supabase
      .from("corporate_prospects")
      .select("id,company_name,organization_number,domain,website_url,industry,status,fit_tier,fit_score,fit_reasons,evidence_gaps,evidence,next_action")
      .eq("brand_id", "zeneco")
      .in("fit_tier", ["A", "B"])
      .neq("status", "DISQUALIFIED")
      .order("fit_score", { ascending: false })
      .limit(250),
    supabase
      .from("corporate_partner_prospects")
      .select("id,company_name,organization_number,domain,website_url,industry,status,fit_tier,fit_score,fit_reasons,evidence_gaps,evidence,next_action,referral_angle")
      .eq("brand_id", "zeneco")
      .in("fit_tier", ["A", "B"])
      .neq("status", "DISQUALIFIED")
      .order("fit_score", { ascending: false })
      .limit(150),
    supabase
      .from("nexus_autonomy_policies")
      .select("action_class,mode,min_confidence,daily_limit,rationale")
      .in("action_class", [
        "company_research",
        "official_channel_discovery",
        "outreach_draft",
        "existing_lead_followup",
        "requested_information_send",
        "inbound_social_reply",
        "warm_signal_dm",
        "external_engagement_recommendation",
        "external_comment_post",
        "cold_promotional_email",
        "cold_social_dm",
        "mass_engagement",
      ])
      .order("action_class"),
  ]);

  if (prospectError || partnerError || policyError) {
    return NextResponse.json({ error: prospectError?.message || partnerError?.message || policyError?.message }, { status: 500 });
  }

  const candidates = [
    ...(prospects || []).map((row: any) => candidateFrom(row, "corporate_buyer")),
    ...(partners || []).map((row: any) => candidateFrom(row, "corporate_partner")),
  ].sort((a, b) => {
    const stageRank: Record<string, number> = { READY_FOR_REVIEW: 5, CHANNEL_FOUND: 4, RESEARCHED: 3, DISCOVERED: 2, CONTACTED: 1 };
    return (stageRank[b.stage] || 0) - (stageRank[a.stage] || 0) || b.fitScore - a.fitScore;
  });

  const stages = candidates.reduce<Record<string, number>>((acc, row) => {
    acc[row.stage] = (acc[row.stage] || 0) + 1;
    return acc;
  }, {});

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    summary: {
      total: candidates.length,
      researched: candidates.filter((row) => row.researchCheckedAt).length,
      officialChannelFound: candidates.filter((row) => row.officialChannel.email || row.officialChannel.contactPage).length,
      warmEvidence: candidates.filter((row) => row.hasWarmEvidence).length,
      readyForReview: candidates.filter((row) => row.stage === "READY_FOR_REVIEW").length,
      stages,
    },
    policies: policies || [],
    candidates: candidates.slice(0, 100),
    safety: {
      coldPromotionalEmail: "blocked",
      coldSocialDm: "blocked",
      massEngagement: "blocked",
      researchAndDrafting: "auto",
      warmSignalDm: "approval",
      externalCommentPost: "approval",
    },
  });
}
