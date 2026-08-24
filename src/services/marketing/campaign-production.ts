/**
 * Phase 7.1B — production composition root for First Live Campaign Path.
 * Brand Brain → CreativeGenerator → Autonomous Orchestrator → Approval → Meta.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { askClaude } from "@/services/ai/claude-client";
import {
  atomizeCampaign,
  routeContentFormat,
  type CampaignPlan,
  type CommercialGoal,
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

const META_CHANNELS: MarketingChannel[] = ["instagram", "facebook"];

function mapGoal(kind: CommercialGoal["kind"]): ContentGoal {
  switch (kind) {
    case "sales": return "sale";
    case "viewings": return "booking";
    case "awareness": return "awareness";
    default: return "lead_generation";
  }
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
  /** Property-driven AI: resolve SAME RealtyFlow Inventory used by /inventory. */
  useInventoryProperty?: boolean;
  /** Optional explicit property. If omitted, adapter selects an eligible visible property for brand. */
  propertyId?: string;
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
  }>;
  trace: unknown[];
}

export function makeConfiguredCreativeGenerator() {
  if (process.env.ANTHROPIC_API_KEY) {
    return makeCreativeGenerator((prompt, opts) => askClaude(prompt, { ...opts, anthropicOnly: false }));
  }
  return makeDryRunCreativeGenerator();
}

export function makeConfiguredMetaPublisher(supabase: MarketingSupabaseLike): ChannelPublisher {
  const igUserId = process.env.META_IG_USER_ID;
  const pageId = process.env.META_PAGE_ID;
  const token = process.env.META_ACCESS_TOKEN;
  const graph = token ? makeGraphApi(token) : undefined;
  const live = process.env.MARKETING_META_LIVE === "true" && metaCredentialsPresent({ graph, igUserId, pageId });
  return makeMetaPublisher({ supabase, graph, igUserId, pageId, live });
}

function guardStateLoader() {
  return async () => ({ autopilotEnabled: process.env.MARKETING_AUTOPILOT_ENABLED !== "false" });
}

export async function createCampaignDraft(
  supabase: MarketingSupabaseLike,
  input: CreateCampaignDraftInput,
  ctx: { correlationIdSeed?: string } = {},
): Promise<CampaignDraftResult> {
  const brand = await loadBrandContext(supabase, input.brandId);
  if (!brand) throw new Error("MISSING_BRAND_CONTEXT: brand_context mangler for " + input.brandId);

  // Property-driven AI resolves inventory BEFORE planning/generation. This is the
  // authoritative source for media + facts + propertyIds. Legacy remains untouched.
  const inventoryProperty = !input.legacyPublicationId && input.useInventoryProperty
    ? await resolveInventoryMarketingProperty(supabase, { brandId: input.brandId, propertyId: input.propertyId ?? null })
    : null;
  const effectiveMediaUrl = inventoryProperty?.primaryImage ?? input.mediaUrl;
  const effectiveFocus = input.focus || inventoryProperty?.location || undefined;
  const effectiveMasterIdea = inventoryProperty
    ? `${input.masterIdea}\n\nMARKEDSFØR DENNE KONKRETE REALTYFLOW-BOLIGEN: ${inventoryProperty.title}${inventoryProperty.ref ? ` (ref ${inventoryProperty.ref})` : ""}. Bruk bare oppgitte Inventory-fakta; ikke finn på egenskaper.`
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
    { level: "copilot" },
  );

  await ensureMarketingAgentRun(supabase as any, { marketingRunId: run.marketingRunId, correlationId: run.correlationId });

  const orchestratorDeps: OrchestratorDeps = {
    supabase,
    loadGuardState: guardStateLoader(),
    requestApproval: makeMarketingApprovalRequester(supabase as any, { runId: run.marketingRunId, correlationId: run.correlationId }),
  };

  const campaignId = `camp_${run.marketingRunId}`;
  const fav = plan.favoredDimensions;
  const routedFormat = routeContentFormat(effectiveMediaUrl) ?? "post";
  const baseGenome: ContentGenome = {
    brandId: input.brandId, channel: "instagram", format: routedFormat,
    hookType: (fav.hookType as any) ?? "price_first", ctaType: (fav.ctaType as any) ?? "book_viewing",
    goal: mapGoal(input.goal.kind), area: effectiveFocus?.toLowerCase().replace(/\s+/g, "_"),
  };
  const campaign: CampaignPlan = {
    campaignId, marketingRunId: run.marketingRunId, brandId: input.brandId, strategy: "exploit",
    goal: input.goal, focus: effectiveFocus, channels, masterIdea: effectiveMasterIdea,
  };
  const briefs = atomizeCampaign(campaign, {
    baseGenome,
    makeContentId: (i, c) => `${campaignId}_${i}_${c}`,
    leadCaptureChannels: [],
    formatOverride: routedFormat,
  });

  const sources: ResolverSourceMap = { organizationId: brand.contentHubOrgId ?? null, adCampaignIds: brand.adCampaignIds ?? null };
  const generator = makeConfiguredCreativeGenerator();
  const results: CampaignDraftResult["results"] = [];
  const trace: unknown[] = [];

  for (const brief of briefs) {
    let creative: CreativeResult;
    let sourceType = "generated";
    let sourceId: string | null = null;
    let reuseMode: string | null = null;
    try {
      if (input.legacyPublicationId) {
        const candidate = await loadLegacyPublicationCandidate(supabase, {
          publicationId: input.legacyPublicationId,
          brandId: input.brandId,
          channel: brief.channel,
          mediaUrl: input.mediaUrl,
        });
        creative = assetFromCandidate(brief, brand, candidate);
        sourceType = "legacy_content_publication";
        sourceId = candidate.contentId;
        reuseMode = "reuse_exact";
      } else if (inventoryProperty) {
        // Property-driven mode: force fresh AI copy grounded in inventory. Do NOT
        // let Content Resolver substitute unrelated existing content.
        creative = await generator.generate({
          brief,
          brand,
          recommendation,
          facts: inventoryProperty.factSources,
          propertyIds: [inventoryProperty.id],
        });
        creative = {
          ...creative,
          asset: {
            ...creative.asset,
            media: { imageUrl: inventoryProperty.primaryImage, mediaType: "image" },
          },
        };
        sourceType = "generated";
        sourceId = `property:${inventoryProperty.id}`;
        reuseMode = "inventory_grounded";
      } else {
        const decision = await resolveMarketingContent(supabase, {
          brandId: input.brandId,
          channel: brief.channel,
          goal: brief.genome.goal,
          language: brief.genome.language,
          area: brief.genome.area,
          format: brief.genome.format,
        }, sources).catch(() => null);
        if (decision && decision.decision !== "generate" && decision.chosen) {
          creative = assetFromCandidate(brief, brand, decision.chosen);
          sourceType = decision.chosen.source;
          sourceId = decision.chosen.contentId;
          reuseMode = decision.chosen.reuseMode;
        } else {
          creative = await generator.generate({ brief, brand, recommendation });
          if (input.mediaUrl && /^https:\/\//i.test(input.mediaUrl)) {
            creative = { ...creative, asset: { ...creative.asset, media: { imageUrl: input.mediaUrl, mediaType: "image" } } };
          }
        }
      }
    } catch (err) {
      results.push({
        contentId: brief.contentId,
        channel: brief.channel,
        publicationId: "-",
        state: "rejected",
        mode: "n/a",
        qualityScore: null,
        approvalId: null,
        error: err instanceof Error ? err.message : "CREATIVE_OUTPUT_INVALID",
        source: sourceType,
        propertyId: inventoryProperty?.id ?? null,
        propertyRef: inventoryProperty?.ref ?? null,
        propertyTitle: inventoryProperty?.title ?? null,
      });
      continue;
    }

    await persistAsset(supabase, creative).catch(() => undefined);

    const account = await resolvePublishingAccount(supabase, {
      brandId: input.brandId,
      channel: brief.channel,
      service: input.service ?? null,
      market: input.market ?? null,
      language: input.language ?? brief.genome.language ?? null,
      publishingAccountId: input.publishingAccountId ?? null,
    }).catch(() => null);

    const d = await dispatchGeneratedAsset(orchestratorDeps, {
      asset: creative.asset,
      brief,
      run,
      brand,
      history: [],
      account: account ? { accountId: account.accountId } : null,
      service: input.service ?? null,
      sourceType,
      sourceId,
      reuseMode,
      propertyIds: creative.provenance.propertyIds ?? [],
    });

    results.push({
      contentId: brief.contentId,
      channel: brief.channel,
      publicationId: d.publicationId,
      state: String(d.state),
      mode: d.mode,
      qualityScore: d.qualityScore,
      approvalId: d.approvalId,
      error: d.error,
      source: sourceType,
      caption: [creative.asset.headline, creative.asset.body, creative.asset.cta].filter(Boolean).join("\n"),
      imageUrl: creative.asset.media?.imageUrl ?? null,
      brandId: input.brandId,
      accountId: account?.accountId ?? null,
      assetHash: d.assetHash,
      factSources: creative.asset.factSources ?? [],
      propertyId: inventoryProperty?.id ?? null,
      propertyRef: inventoryProperty?.ref ?? null,
      propertyTitle: inventoryProperty?.title ?? null,
    });
    trace.push(...d.trace);
  }

  return { marketingRunId: run.marketingRunId, correlationId: run.correlationId, campaignId, results, trace };
}

function assetFromCandidate(brief: any, brand: any, chosen: any): CreativeResult {
  return {
    asset: {
      contentId: brief.contentId,
      creativeVariantId: `${brief.contentId}_v1`,
      campaignId: brief.campaignId,
      channel: brief.channel,
      genome: brief.genome,
      headline: undefined,
      body: chosen.text ?? "",
      cta: brand.preferredCta,
      media: chosen.media ?? undefined,
      factSources: chosen.factSources ?? [],
      generator: {},
    },
    provenance: {
      generatedBy: "content-resolver",
      model: chosen.source,
      promptVersion: "resolver-1.0",
      learningRulesUsed: [],
      factSources: chosen.factSources ?? [],
      propertyIds: chosen.propertyIds ?? [],
      createdAt: new Date().toISOString(),
      approvedBy: null,
      approvedAt: null,
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
