import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/api-admin";
import {
  buildNexusMarketingActionProposals,
  type NexusMarketingChannel,
} from "@/lib/nexus-ai-marketing-actions";
import { generateCorrelationId } from "@/lib/agentic/ids";
import { getServiceSupabase } from "@/services/marketing/campaign-production";
import { createManualReviewCampaignDraft } from "@/services/marketing/manual-review-campaign";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const PROPOSAL_ID = /^nexus_action_[a-f0-9]{24}$/;

function safeText(value: unknown, max = 8000) {
  return String(value ?? "").trim().slice(0, max);
}

function sameChannels(left: NexusMarketingChannel[] | undefined, right: unknown) {
  if (!Array.isArray(left) || !Array.isArray(right)) return false;
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function deterministicMarketingRunId(proposalId: string) {
  return `mrun_nexus_${proposalId.replace(/^nexus_action_/, "")}`;
}

async function findIllustrativeModel(supabase: any, brandId: string) {
  const { data: visibility, error: visibilityError } = await supabase
    .from("property_brand_visibility")
    .select("property_id,score,manual_override")
    .eq("brand_id", brandId)
    .eq("visible", true)
    .order("manual_override", { ascending: false })
    .order("score", { ascending: false })
    .limit(200);
  if (visibilityError || !visibility?.length) return null;

  const orderedIds = visibility.map((row: any) => String(row.property_id || "")).filter(Boolean);
  if (!orderedIds.length) return null;
  const rank = new Map<string, number>(
    orderedIds.map((id: string, index: number): [string, number] => [id, index]),
  );

  const { data: properties, error: propertyError } = await supabase
    .from("properties")
    .select("id,ref,title,title_no,model_name,location,town,status,property_type,type,bedrooms,bathrooms,built_area,area_m2,primary_image")
    .in("id", orderedIds)
    .eq("status", "TILGJENGELIG")
    .not("model_name", "is", null)
    .limit(200);
  if (propertyError || !properties?.length) return null;

  const eligible = properties
    .filter((property: any) => /^https:\/\//i.test(String(property.primary_image || "")))
    .sort((a: any, b: any) => (rank.get(String(a.id)) ?? 9999) - (rank.get(String(b.id)) ?? 9999));
  const property = eligible[0];
  if (!property) return null;

  return {
    id: String(property.id),
    ref: safeText(property.ref, 80) || null,
    title: safeText(property.title_no || property.title, 240) || null,
    modelName: safeText(property.model_name, 120) || null,
    sourceLocation: safeText(property.location || property.town, 160) || null,
    imageUrl: String(property.primary_image),
    bedrooms: Number.isFinite(Number(property.bedrooms)) ? Number(property.bedrooms) : null,
    bathrooms: Number.isFinite(Number(property.bathrooms)) ? Number(property.bathrooms) : null,
    builtArea: Number.isFinite(Number(property.built_area ?? property.area_m2)) ? Number(property.built_area ?? property.area_m2) : null,
  };
}

function buildLifestyleMasterIdea(args: {
  focus: string;
  brandName: string;
  requestText: string;
  illustrativeModel: Awaited<ReturnType<typeof findIllustrativeModel>>;
}) {
  const modelLine = args.illustrativeModel
    ? `BILDE/DESIGNREFERANSE: Bruk bildet fra modellen ${args.illustrativeModel.modelName || args.illustrativeModel.ref || "valgt boligkonsept"} kun som illustrasjon av moderne boligdesign. Modellen kommer fra ${args.illustrativeModel.sourceLocation || "et annet Inventory-objekt"}; ikke skriv eller antyd at denne konkrete boligen ligger i ${args.focus}.`
    : "BILDE/DESIGNREFERANSE: Ingen verifisert lokal boligmodell er valgt. Ikke finn på et konkret prosjekt eller en konkret tomt.";

  return [
    `Lag en livsstilsdrevet SoMe-kampanje for ${args.brandName} med fokus på ${args.focus}.`,
    `OPERATØRENS ØNSKE: ${args.requestText}`,
    modelLine,
    `MÅL: skap interesse for livet i ${args.focus}, muligheten til å utforske tomt + moderne boligkonsept, hvem denne typen valg kan passe for, og få interesserte til å ta kontakt.`,
    "FAKTAGRENSE: Dette er ikke markedsføring av en verifisert eksisterende eiendom på fokusstedet. Ikke påstå at en konkret modell kan bygges på en bestemt tomt. Ikke oppgi pris, tomtestørrelse, byggeareal, høyde, utnyttelsesgrad, avstander, fasiliteter eller kommunale regler uten verifisert kilde.",
    "BYGGBARHET: Si tydelig og naturlig at endelig bolig, størrelse og plassering avhenger av konkret tomt, regulering, teknisk vurdering og nødvendige tillatelser.",
    `LIVSSTIL: Bruk spørsmål, scenarioer og valg-språk (for eksempel «kan dette passe for deg?») fremfor usikre faktapåstander om ${args.focus}.`,
    "MÅLGRUPPE: omtale par, familier, fjernarbeidere eller voksne som mulige målgrupper/posisjonering, aldri som dokumenterte kundedata.",
    `CTA: inviter til en samtale om tomter, boligkonsepter og hva som faktisk kan være mulig i ${args.focus}.`,
    "Ikke skriv at noe er reservert, godkjent, tilgjengelig eller byggbart før det er dokumentert.",
  ].join("\n\n");
}

async function existingCampaign(supabase: any, marketingRunId: string) {
  const { data: publications } = await supabase
    .from("marketing_publications")
    .select("publication_id,content_id,channel,state,approval_id,updated_at")
    .eq("marketing_run_id", marketingRunId)
    .order("created_at", { ascending: true })
    .limit(20);
  if (!publications?.length) return null;

  const { data: approvals } = await supabase
    .from("agentic_approvals")
    .select("id,status,subject_ref")
    .eq("run_id", marketingRunId)
    .order("created_at", { ascending: true })
    .limit(20);
  return { publications, approvals: approvals || [] };
}

export async function POST(request: NextRequest) {
  const denied = await requireAdminApi(request);
  if (denied) return denied;

  const body = await request.json().catch(() => ({}));
  const proposalId = safeText(body?.proposalId, 80);
  const requestText = safeText(body?.requestText, 8000);
  const brandId = safeText(body?.brandId, 80);
  const focus = safeText(body?.focus, 120);
  const channels = Array.isArray(body?.channels)
    ? body.channels.filter((value: unknown): value is NexusMarketingChannel => value === "instagram" || value === "facebook").slice(0, 2)
    : [];

  if (body?.type !== "prepare_marketing_campaign" || !PROPOSAL_ID.test(proposalId) || !requestText) {
    return NextResponse.json({ error: "Ugyldig eller ufullstendig markedsføringshandling." }, { status: 400 });
  }

  const verified = buildNexusMarketingActionProposals({ message: requestText })[0];
  if (
    !verified
    || verified.type !== "prepare_marketing_campaign"
    || verified.id !== proposalId
    || verified.brandId !== brandId
    || verified.focus !== focus
    || !sameChannels(verified.channels, channels)
  ) {
    return NextResponse.json({ error: "Markedsføringshandlingen stemmer ikke lenger med den verifiserte instruksjonen." }, { status: 409 });
  }

  const supabase = getServiceSupabase();
  if (!supabase) return NextResponse.json({ error: "Nexus-databasen er ikke tilgjengelig." }, { status: 503 });

  const marketingRunId = deterministicMarketingRunId(proposalId);
  const existing = await existingCampaign(supabase, marketingRunId);
  if (existing) {
    return NextResponse.json({
      ok: true,
      duplicate: true,
      state: "waiting_approval",
      marketingRunId,
      publications: existing.publications,
      approvals: existing.approvals,
      message: "Denne kampanjen er allerede forberedt. Jeg bruker de eksisterende utkastene i stedet for å lage duplikater.",
      navigation: { label: "Åpne Approval Center", href: "/approvals" },
    });
  }

  const illustrativeModel = await findIllustrativeModel(supabase, verified.brandId);
  const requestedChannels = verified.channels || ["instagram", "facebook"];
  const channel = requestedChannels.length === 1 ? requestedChannels[0] : undefined;
  const correlationId = generateCorrelationId();
  const masterIdea = buildLifestyleMasterIdea({
    focus: verified.focus,
    brandName: verified.brandName,
    requestText: verified.requestText,
    illustrativeModel,
  });

  try {
    const campaign = await createManualReviewCampaignDraft(
      supabase,
      {
        brandId: verified.brandId,
        goal: { kind: "qualified_leads", target: 10, horizonDays: 30 },
        masterIdea,
        focus: verified.focus,
        channel,
        mediaUrl: illustrativeModel?.imageUrl,
        publishingCapacityPerWeek: 4,
        reuseCooldownDays: 14,
      },
      { marketingRunId, correlationId },
    );

    const approvalResults = campaign.results.filter((result) => Boolean(result.approvalId) && result.state === "draft");
    const rejected = campaign.results.filter((result) => result.state === "rejected" || result.error);
    if (!approvalResults.length) {
      return NextResponse.json({
        error: "Kampanjemotoren laget ingen godkjennbare utkast. Kvalitets- eller faktagrenser stoppet innholdet.",
        marketingRunId,
        results: campaign.results,
        illustrativeModel: illustrativeModel ? { ...illustrativeModel, imageUrl: undefined, illustrativeOnly: true } : null,
      }, { status: 409 });
    }

    const channelLabel = approvalResults.map((result) => result.channel).join(" + ");
    return NextResponse.json({
      ok: true,
      state: "waiting_approval",
      marketingRunId: campaign.marketingRunId,
      campaignId: campaign.campaignId,
      results: campaign.results,
      illustrativeModel: illustrativeModel ? {
        id: illustrativeModel.id,
        ref: illustrativeModel.ref,
        modelName: illustrativeModel.modelName,
        sourceLocation: illustrativeModel.sourceLocation,
        illustrativeOnly: true,
      } : null,
      safety: {
        manualReviewForced: true,
        publishedByThisAction: false,
        buildabilityVerified: false,
        concreteFocusPropertyClaimed: false,
      },
      message: rejected.length
        ? `Jeg har laget ${approvalResults.length} godkjennbart SoMe-utkast (${channelLabel}) for ${verified.focus}. ${rejected.length} utkast ble stoppet av kvalitetskontrollen. Ingenting er publisert.`
        : `Jeg har laget ${approvalResults.length} SoMe-utkast (${channelLabel}) for ${verified.focus}. De ligger i Approval Center. Ingenting er publisert.`,
      navigation: { label: "Åpne Approval Center", href: "/approvals" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Kampanjen kunne ikke opprettes.";
    return NextResponse.json({ error: message, marketingRunId }, { status: 500 });
  }
}
