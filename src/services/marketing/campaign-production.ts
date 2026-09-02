/**
 * Phase 7.1B — production composition root for First Live Campaign Path.
 * Brand Brain → CreativeGenerator → Autonomous Orchestrator → Approval/Guarded Auto → Meta.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { askClaude } from "@/services/ai/claude-client";
import {
  atomizeCampaign,
  routeContentFormat,
  type CampaignPlan,
  type CommercialGoal,
  type ContentHistoryItem,
  type CreativeResult,
} from "@/lib/marketing/autonomous";
import type { ContentGenome, ContentGoal, MarketingChannel } from "@/lib/marketing/genome";
import { loadBrandContext } from "@/services/marketing/brand-brain-adapter";
import { makeCreativeGenerator, makeDryRunCreativeGenerator, persistAsset } from "@/services/marketing/creative-generator";
import { ensureMarketingAgentRun, makeMarketingApprovalRequester } from "@/services/marketing/marketing-approval";
import { makeGraphApi, makeMetaPublisher, metaCredentialsPresent } from "@/services/marketing/publishers/meta-publisher";
import { runApprovedPublication } from "@/services/marketing/publish-executor";
import { resolveMarketingContent, type ResolverSourceMap } from "@/services/marketing/content-resolver-adapter";
import { loadLegacyPublicationCandidate } from "@/services/marketing/legacy-content-adapter";
import { resolvePublishingAccount } from "@/services/marketing/account-resolver";
import { resolveInventoryMarketingProperty } from "@/services/marketing/inventory-property-adapter";
import { dispatchGeneratedAsset, planMarketingRun, type ChannelPublisher, type OrchestratorDeps } from "@/services/marketing/autonomous-orchestrator";
import type { MarketingSupabaseLike } from "@/services/marketing/adapters";
import { getTokensForBrandPlatform } from "@/lib/oauth/channels";

const META_CHANNELS: MarketingChannel[] = ["instagram", "facebook"];
const PREAPPROVED_REUSABLE_SOURCES = new Set(["ad_creative", "content_hub_approved"]);

type CampaignAutonomy = {
  level: "copilot" | "guarded";
  controlledAuto: boolean;
  preapprovedChannels: Set<string>;
};

function mapGoal(kind: CommercialGoal["kind"]): ContentGoal {
  switch (kind) {
    case "sales": return "sale";
    case "viewings": return "booking";
    case "awareness": return "awareness";
    default: return "lead_generation";
  }
}

function normalizeConfiguredChannels(metadata: Record<string, unknown> | null | undefined): Set<string> {
  const raw = metadata?.autopilot_channels ?? metadata?.autopilot_scope;
  if (Array.isArray(raw)) return new Set(raw.map(String).map((v) => v.trim().toLowerCase()).filter(Boolean));
  if (typeof raw === "string") return new Set(raw.split(",").map((v) => v.trim().toLowerCase()).filter(Boolean));
  return new Set();
}

async function resolveCampaignAutonomy(supabase: MarketingSupabaseLike, brandId: string): Promise<CampaignAutonomy> {
  const { data } = await supabase.from("marketing_brand_growth_plans").select("autonomy_mode, metadata").eq("brand_id", brandId).maybeSingle();
  const controlledAuto = data?.autonomy_mode === "controlled_auto";
  return {
    level: controlledAuto ? "guarded" : "copilot",
    controlledAuto,
    preapprovedChannels: controlledAuto ? normalizeConfiguredChannels((data?.metadata ?? {}) as Record<string, unknown>) : new Set<string>(),
  };
}

function normalizedCta(value: string | null | undefined): string {
  return String(value ?? "").toLowerCase().replace(/[^a-z0-9æøå]+/gi, " ").replace(/\s+/g, " ").trim();
}

function hasSemanticBookingCta(value: string): boolean {
  const n = normalizedCta(value);
  if (!n) return false;
  const hasBookingVerb = /\b(book|bestill|avtal|kontakt|ta kontakt)\b/.test(n);
  const hasConversation = /\b(boligsamtale|samtale|rådgivning|visning)\b/.test(n);
  const hasFree = /\b(gratis|uforpliktende)\b/.test(n);
  return hasBookingVerb && hasConversation && hasFree;
}

function dedupeCreativeCta(creative: CreativeResult): CreativeResult {
  const cta = String(creative.asset.cta ?? "").trim();
  const body = String(creative.asset.body ?? "");
  if (!cta || !body) return creative;
  const target = normalizedCta(cta);
  if (!target) return creative;
  const paragraphs = body.split(/\n\s*\n/);
  let last = paragraphs.length - 1;
  while (last >= 0 && !paragraphs[last].trim()) last -= 1;
  if (last < 0) return creative;
  const lastParagraph = paragraphs[last].trim();
  const lastNorm = normalizedCta(lastParagraph);
  if (lastNorm.includes(target) && lastParagraph.length <= 220) {
    paragraphs.splice(last, 1);
    return { ...creative, asset: { ...creative.asset, body: paragraphs.join("\n\n").trim() } };
  }
  const tail = body.slice(-420);
  if (hasSemanticBookingCta(cta) && hasSemanticBookingCta(tail)) return { ...creative, asset: { ...creative.asset, cta: undefined } };
  return creative;
}

export interface CreateCampaignDraftInput {
  brandId: string;
  goal: CommercialGoal;
  masterIdea: string;
  focus?: string;
  service?: string;
  market?: string;
  language?: string;
  publishingAccountId?: string;
  publishingCapacityPerWeek?: number;
  legacyPublicationId?: string;
  channel?: "instagram" | "facebook";
  mediaUrl?: string;
  useInventoryProperty?: boolean;
  propertyId?: string;
  /** Autopilot-only: an exact reusable source cannot be selected inside this window. */
  reuseCooldownDays?: number;
  /** Fail closed if recent publication history cannot be loaded. */
  requirePublicationHistory?: boolean;
}

export interface CampaignDraftResult {
  marketingRunId: string;
  correlationId: string;
  campaignId: string;
  results: Array<{
    contentId: string; channel: string; publicationId: string; state: string; mode: string;
    qualityScore: number | null; approvalId: string | null; error?: string; source?: string;
    caption?: string; imageUrl?: string | null; brandId?: string; accountId?: string | null; assetHash?: string;
    factSources?: Array<{ claim: string; source: string }>;
    propertyId?: string | null; propertyRef?: string | null; propertyTitle?: string | null;
    propertyLocation?: string | null; selectionReason?: string | null;
  }>;
  trace: unknown[];
}

export function makeConfiguredCreativeGenerator() {
  if (process.env.ANTHROPIC_API_KEY) return makeCreativeGenerator((prompt, opts) => askClaude(prompt, { ...opts, anthropicOnly: false }));
  return makeDryRunCreativeGenerator();
}

/** Exact brand/channel OAuth is mandatory for controlled auto. Legacy env credentials
 * are retained only for old manual approval flows where no brand is supplied. */
export function makeConfiguredMetaPublisher(supabase: MarketingSupabaseLike, brandId?: string): ChannelPublisher {
  return {
    async publish(asset, opts) {
      const liveRequested = process.env.MARKETING_META_LIVE === "true";
      const platform = asset.channel === "facebook" ? "facebook" : "instagram";
      if (brandId && liveRequested) {
        const connected = await getTokensForBrandPlatform(brandId, platform);
        if (!connected?.tokens.accessToken) throw new Error(`META_TOKEN_MISSING: ingen aktiv OAuth-token for ${brandId}/${platform}`);
        const target = connected.channel.external_id;
        if (opts.accountId && String(opts.accountId) !== String(target)) {
          throw new Error(`BRAND_MISMATCH: resolved account ${opts.accountId} differs from connected ${brandId}/${platform} account ${target}`);
        }
        const graph = makeGraphApi(connected.tokens.accessToken);
        const publisher = makeMetaPublisher({
          supabase,
          graph,
          igUserId: platform === "instagram" ? target : undefined,
          pageId: platform === "facebook" ? target : undefined,
          live: true,
        });
        return publisher.publish(asset, { ...opts, accountId: target });
      }

      const igUserId = process.env.META_IG_USER_ID;
      const pageId = process.env.META_PAGE_ID;
      const token = process.env.META_ACCESS_TOKEN;
      const graph = token ? makeGraphApi(token) : undefined;
      const live = liveRequested && metaCredentialsPresent({ graph, igUserId, pageId });
      return makeMetaPublisher({ supabase, graph, igUserId, pageId, live }).publish(asset, opts);
    },
  };
}

async function loadRecentPublicationHistory(
  supabase: MarketingSupabaseLike,
  brandId: string,
  channel: MarketingChannel,
  days = 14,
): Promise<ContentHistoryItem[]> {
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const { data: publications, error: publicationError } = await supabase
    .from("marketing_publications")
    .select("content_id,campaign_id,created_at,updated_at,state")
    .eq("brand_id", brandId)
    .eq("channel", channel)
    .in("state", ["published", "scheduled"])
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(250);
  if (publicationError) throw new Error(`PUBLICATION_HISTORY_FAILED: ${publicationError.message}`);

  const contentIds = Array.from(new Set((publications ?? []).map((row: any) => String(row.content_id ?? "")).filter(Boolean)));
  if (!contentIds.length) return [];
  const { data: assets, error: assetError } = await supabase
    .from("marketing_assets")
    .select("content_id,campaign_id,genome,headline,body,cta")
    .in("content_id", contentIds)
    .limit(500);
  if (assetError) throw new Error(`PUBLICATION_ASSET_HISTORY_FAILED: ${assetError.message}`);

  const publicationByContent = new Map<string, any>();
  for (const row of publications ?? []) {
    const contentId = String((row as any).content_id ?? "");
    if (contentId && !publicationByContent.has(contentId)) publicationByContent.set(contentId, row);
  }
  return (assets ?? []).flatMap((asset: any) => {
    const genome = asset.genome as ContentGenome | null;
    const publication = publicationByContent.get(String(asset.content_id ?? ""));
    if (!genome || genome.brandId !== brandId || genome.channel !== channel || !publication) return [];
    return [{
      genome,
      angle: [asset.headline, asset.body, asset.cta].filter(Boolean).join("\n"),
      campaignId: asset.campaign_id ?? publication.campaign_id ?? undefined,
      usedAt: publication.created_at ?? publication.updated_at,
    } satisfies ContentHistoryItem];
  });
}

function guardStateLoader() {
  return async () => ({ autopilotEnabled: process.env.MARKETING_AUTOPILOT_ENABLED !== "false" });
}

export async function createCampaignDraft(
  supabase: MarketingSupabaseLike,
  input: CreateCampaignDraftInput,
  ctx: { marketingRunId?: string; correlationId?: string } = {},
): Promise<CampaignDraftResult> {
  const brand = await loadBrandContext(supabase, input.brandId);
  if (!brand) throw new Error("MISSING_BRAND_CONTEXT: brand_context mangler for " + input.brandId);

  const autonomy = await resolveCampaignAutonomy(supabase, input.brandId);
  const inventoryProperty = !input.legacyPublicationId && input.useInventoryProperty
    ? await resolveInventoryMarketingProperty(supabase, { brandId: input.brandId, propertyId: input.propertyId ?? null })
    : null;
  const effectiveMediaUrl = inventoryProperty?.primaryImage ?? input.mediaUrl;
  const effectiveFocus = input.focus || inventoryProperty?.location || undefined;
  const locationInstruction = inventoryProperty
    ? inventoryProperty.locationSpecificity === "specific"
      ? `KONKRET STED: ${inventoryProperty.location}. Bruk konkret by/område når relevant; bruk ikke bare den brede Costa-regionen som stedsnavn.`
      : `KUN REGION ER VERIFISERT: ${inventoryProperty.location || "ukjent"}. Ikke presenter denne brede regionen som om den var konkret by/sted, og ikke finn på kommune.`
    : "";
  const effectiveMasterIdea = inventoryProperty
    ? `${input.masterIdea}\n\nMARKEDSFØR DENNE KONKRETE REALTYFLOW-BOLIGEN: ${inventoryProperty.title}${inventoryProperty.ref ? ` (ref ${inventoryProperty.ref})` : ""}. ${locationInstruction} Bruk bare oppgitte Inventory-fakta; ikke finn på egenskaper.`
    : input.masterIdea;

  const channels: MarketingChannel[] = input.channel ? [input.channel] : (input.legacyPublicationId ? ["instagram"] : META_CHANNELS);
  const directorInput = {
    brandId: input.brandId, brandName: brand.brandName, goals: [input.goal],
    channels, pipelineGaps: [], inventoryFocus: effectiveFocus ? [effectiveFocus] : [],
    activeCampaignIds: [], budget: {}, publishingCapacityPerWeek: input.publishingCapacityPerWeek ?? 4,
  };

  const { run, plan, recommendation } = await planMarketingRun(
    { supabase, loadGuardState: guardStateLoader() },
    directorInput as any,
    { level: autonomy.level, marketingRunId: ctx.marketingRunId, correlationId: ctx.correlationId },
  );
  await ensureMarketingAgentRun(supabase as any, { marketingRunId: run.marketingRunId, correlationId: run.correlationId });

  const orchestratorDeps: OrchestratorDeps = {
    supabase,
    loadGuardState: guardStateLoader(),
    publisher: autonomy.controlledAuto ? makeConfiguredMetaPublisher(supabase, input.brandId) : undefined,
    requestApproval: makeMarketingApprovalRequester(supabase as any, { runId: run.marketingRunId, correlationId: run.correlationId }),
  };

  const campaignId = `camp_${run.marketingRunId}`;
  const fav = plan.favoredDimensions;
  const routedFormat = routeContentFormat(effectiveMediaUrl) ?? "post";
  const baseGenome: ContentGenome = {
    brandId: input.brandId, channel: input.channel ?? "instagram", format: routedFormat,
    hookType: (fav.hookType as any) ?? "price_first", ctaType: (fav.ctaType as any) ?? "book_viewing",
    goal: mapGoal(input.goal.kind), area: effectiveFocus?.toLowerCase().replace(/\s+/g, "_"),
  };
  const campaign: CampaignPlan = { campaignId, marketingRunId: run.marketingRunId, brandId: input.brandId, strategy: "exploit", goal: input.goal, focus: effectiveFocus, channels, masterIdea: effectiveMasterIdea };
  const briefs = atomizeCampaign(campaign, { baseGenome, makeContentId: (i, c) => `${campaignId}_${i}_${c}`, leadCaptureChannels: [], formatOverride: routedFormat });

  const sources: ResolverSourceMap = { organizationId: brand.contentHubOrgId ?? null, adCampaignIds: brand.adCampaignIds ?? null };
  const generator = makeConfiguredCreativeGenerator();
  const results: CampaignDraftResult["results"] = [];
  const trace: unknown[] = [];
  const historyByChannel = new Map<MarketingChannel, ContentHistoryItem[]>();

  async function historyFor(channel: MarketingChannel) {
    const existing = historyByChannel.get(channel);
    if (existing) return existing;
    try {
      const history = await loadRecentPublicationHistory(supabase, input.brandId, channel, input.reuseCooldownDays ?? 14);
      historyByChannel.set(channel, history);
      return history;
    } catch (error) {
      if (input.requirePublicationHistory) throw error;
      historyByChannel.set(channel, []);
      return [];
    }
  }

  for (const brief of briefs) {
    let creative: CreativeResult;
    let sourceType = "generated";
    let sourceId: string | null = null;
    let reuseMode: string | null = null;
    let sourceHumanApproved = false;
    try {
      if (input.legacyPublicationId) {
        const candidate = await loadLegacyPublicationCandidate(supabase, { publicationId: input.legacyPublicationId, brandId: input.brandId, channel: brief.channel, mediaUrl: input.mediaUrl });
        creative = assetFromCandidate(brief, brand, candidate);
        sourceType = "legacy_content_publication";
        sourceId = candidate.contentId;
        reuseMode = "reuse_exact";
        sourceHumanApproved = !!candidate.humanApproved;
      } else if (inventoryProperty) {
        creative = await generator.generate({ brief, brand, recommendation, facts: inventoryProperty.factSources, propertyIds: [inventoryProperty.id] });
        creative = { ...creative, asset: { ...creative.asset, media: { imageUrl: inventoryProperty.primaryImage, mediaType: "image" } } };
        sourceType = "generated";
        sourceId = `property:${inventoryProperty.id}`;
        reuseMode = "inventory_grounded";
      } else {
        let decision = null;
        try {
          decision = await resolveMarketingContent(supabase, {
            brandId: input.brandId, channel: brief.channel, goal: brief.genome.goal, language: brief.genome.language, area: brief.genome.area, format: brief.genome.format,
            minimumReuseIntervalDays: input.reuseCooldownDays,
          }, sources);
        } catch (error) {
          if (input.requirePublicationHistory) throw error;
        }
        if (decision && decision.decision !== "generate" && decision.chosen) {
          creative = assetFromCandidate(brief, brand, decision.chosen);
          sourceType = decision.chosen.source;
          sourceId = decision.chosen.contentId;
          reuseMode = decision.chosen.reuseMode;
          sourceHumanApproved = !!decision.chosen.humanApproved;
        } else {
          creative = await generator.generate({ brief, brand, recommendation });
          if (input.mediaUrl && /^https:\/\//i.test(input.mediaUrl)) creative = { ...creative, asset: { ...creative.asset, media: { imageUrl: input.mediaUrl, mediaType: "image" } } };
        }
      }
    } catch (err) {
      results.push({
        contentId: brief.contentId, channel: brief.channel, publicationId: "-", state: "rejected", mode: "n/a", qualityScore: null, approvalId: null,
        error: err instanceof Error ? err.message : "CREATIVE_OUTPUT_INVALID", source: sourceType,
        propertyId: inventoryProperty?.id ?? null, propertyRef: inventoryProperty?.ref ?? null, propertyTitle: inventoryProperty?.title ?? null,
        propertyLocation: inventoryProperty?.location ?? null, selectionReason: inventoryProperty?.selectionReason ?? null,
      });
      continue;
    }

    creative = dedupeCreativeCta(creative);
    await persistAsset(supabase, creative).catch(() => undefined);

    const account = await resolvePublishingAccount(supabase, {
      brandId: input.brandId, channel: brief.channel, service: input.service ?? null, market: input.market ?? null,
      language: input.language ?? brief.genome.language ?? null, publishingAccountId: input.publishingAccountId ?? null,
    }).catch(() => null);

    const approvedGenerated = sourceType === "generated" && (!inventoryProperty || reuseMode === "inventory_grounded");
    const approvedReusable = sourceHumanApproved
      && PREAPPROVED_REUSABLE_SOURCES.has(sourceType)
      && reuseMode === "reuse_exact"
      && !!creative.asset.media?.imageUrl;
    const preapprovedFormat = !!(
      autonomy.controlledAuto
      && autonomy.preapprovedChannels.has(String(brief.channel).toLowerCase())
      && (approvedGenerated || approvedReusable)
    );

    const history = await historyFor(brief.channel);
    const d = await dispatchGeneratedAsset(orchestratorDeps, {
      asset: creative.asset, brief, run, brand, history, account: account ? { accountId: account.accountId } : null,
      service: input.service ?? null, sourceType, sourceId, reuseMode, preapprovedFormat, propertyIds: creative.provenance.propertyIds ?? [],
    });

    results.push({
      contentId: brief.contentId, channel: brief.channel, publicationId: d.publicationId, state: String(d.state), mode: d.mode,
      qualityScore: d.qualityScore, approvalId: d.approvalId, error: d.error, source: sourceType,
      caption: [creative.asset.headline, creative.asset.body, creative.asset.cta].filter(Boolean).join("\n"), imageUrl: creative.asset.media?.imageUrl ?? null,
      brandId: input.brandId, accountId: account?.accountId ?? null, assetHash: d.assetHash, factSources: creative.asset.factSources ?? [],
      propertyId: inventoryProperty?.id ?? null, propertyRef: inventoryProperty?.ref ?? null, propertyTitle: inventoryProperty?.title ?? null,
      propertyLocation: inventoryProperty?.location ?? null, selectionReason: inventoryProperty?.selectionReason ?? null,
    });
    trace.push(...d.trace);
  }

  return { marketingRunId: run.marketingRunId, correlationId: run.correlationId, campaignId, results, trace };
}

function assetFromCandidate(brief: any, brand: any, chosen: any): CreativeResult {
  return {
    asset: {
      contentId: brief.contentId, creativeVariantId: `${brief.contentId}_v1`, campaignId: brief.campaignId, channel: brief.channel, genome: brief.genome,
      headline: undefined, body: chosen.text ?? "", cta: brand.preferredCta, media: chosen.media ?? undefined,
      factSources: chosen.factSources ?? [], generator: {},
    },
    provenance: {
      generatedBy: "content-resolver", model: chosen.source, promptVersion: "resolver-1.0", learningRulesUsed: [],
      factSources: chosen.factSources ?? [], propertyIds: chosen.propertyIds ?? [], createdAt: new Date().toISOString(),
      approvedBy: chosen.humanApproved ? "content-resolver:human-approved" : null,
      approvedAt: chosen.humanApproved ? new Date().toISOString() : null,
    },
  };
}

export async function runApprovedPublicationProd(supabase: MarketingSupabaseLike, args: { approvalId: string; executedBy: string }) {
  const publisher = makeConfiguredMetaPublisher(supabase);
  const live = process.env.MARKETING_META_LIVE === "true";
  const resolveAccount = live ? (a: { brandId: string; channel: string }) => resolvePublishingAccount(supabase, a) : undefined;
  return runApprovedPublication(supabase, { approvalId: args.approvalId, executedBy: args.executedBy, publisher, resolveAccount });
}

export function getServiceSupabase(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}
