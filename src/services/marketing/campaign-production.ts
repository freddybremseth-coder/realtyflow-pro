/**
 * Phase 7.1B — production composition root for First Live Campaign Path.
 * Kobler HELE Instagram/Facebook-vertikalen med ekte komponenter:
 *   Brand Brain → CreativeGenerator → Autonomous Orchestrator → General Approval
 *   Gateway → Meta Publisher → Marketing Events/Attribution → Lead Form → Lead Intake
 *
 * COPILOT forblir aktivt (publisering krever godkjenning). Fail-closed:
 * manglende brand context, approval-tjeneste eller Meta-credentials stopper eller
 * dry-runner — aldri stille suksess. Ingen mock i live-path (dry-run kun uten
 * live-credentials).
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { askClaude } from "@/services/ai/claude-client";
import {
  atomizeCampaign,
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
  /** Førsteklasses routing/lærings-dimensjon. */
  service?: string;
  market?: string;
  language?: string;
  /** Menneske-valgt konto (external_id) — vinner over auto-routing. */
  publishingAccountId?: string;
  publishingCapacityPerWeek?: number;
  /**
   * CANARY: bruk ÉN eksplisitt legacy content_publications-rad som kilde (ingen
   * AI-generering, ingen fuzzy). Kjører kun på oppgitt kanal (default instagram).
   */
  legacyPublicationId?: string;
  channel?: "instagram" | "facebook";
  /** Public HTTPS media-URL (canary) hvis legacy-raden mangler ai_image_url. */
  mediaUrl?: string;
}

export interface CampaignDraftResult {
  marketingRunId: string;
  correlationId: string;
  campaignId: string;
  results: Array<{
    contentId: string; channel: string; publicationId: string; state: string; mode: string;
    qualityScore: number | null; approvalId: string | null; error?: string; source?: string;
    caption?: string; imageUrl?: string | null; brandId?: string; accountId?: string | null; assetHash?: string;
  }>;
  trace: unknown[];
}

/** DI-fabrikk for Creative Generator: ekte (askClaude) om nøkkel finnes, ellers dry-run. */
export function makeConfiguredCreativeGenerator() {
  if (process.env.ANTHROPIC_API_KEY) {
    return makeCreativeGenerator((prompt, opts) => askClaude(prompt, { ...opts, anthropicOnly: false }));
  }
  return makeDryRunCreativeGenerator();
}

/** DI-fabrikk for Meta Publisher: live kun med eksplisitt flagg + credentials, ellers dry-run. */
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

/**
 * Steg 1–5 av live-kjeden: plan → generér Meta-innhold → quality/brand-gate →
 * approval-kø. Publiserer ALDRI her (copilot). Fail-closed på manglende brand.
 */
export async function createCampaignDraft(
  supabase: MarketingSupabaseLike,
  input: CreateCampaignDraftInput,
  ctx: { correlationIdSeed?: string } = {},
): Promise<CampaignDraftResult> {
  const brand = await loadBrandContext(supabase, input.brandId);
  if (!brand) throw new Error("MISSING_BRAND_CONTEXT: brand_context mangler for " + input.brandId);

  // Canary bruker kun oppgitt kanal (default instagram); ellers Meta-standard.
  const channels: MarketingChannel[] = input.legacyPublicationId ? [(input.channel ?? "instagram")] : META_CHANNELS;
  const directorInput = {
    brandId: input.brandId, brandName: brand.brandName, goals: [input.goal],
    channels, pipelineGaps: [], inventoryFocus: input.focus ? [input.focus] : [],
    activeCampaignIds: [], budget: {}, publishingCapacityPerWeek: input.publishingCapacityPerWeek ?? 4,
  };

  // ÉN kanonisk run: planMarketingRun EIER run-opprettelse + persistering. Fail
  // CLOSED — hvis marketing_runs-persisteringen feiler, opprettes ingen publikasjon
  // (ellers brytes FK marketing_publications.marketing_run_id → marketing_runs).
  const { run, plan, recommendation } = await planMarketingRun(
    { supabase, loadGuardState: guardStateLoader() },
    directorInput as any,
    { level: "copilot" },
  );

  // Agent-run-BRO: sikre ÉN agent_runs-konvolutt (id == run-ID) FØR approval —
  // agentic_approvals.run_id har FK → agent_runs.id. Fail closed (ingen catch).
  await ensureMarketingAgentRun(supabase as any, { marketingRunId: run.marketingRunId, correlationId: run.correlationId });

  const orchestratorDeps: OrchestratorDeps = {
    supabase,
    loadGuardState: guardStateLoader(),
    requestApproval: makeMarketingApprovalRequester(supabase as any, { runId: run.marketingRunId, correlationId: run.correlationId }),
  };

  // Kampanje + atomisering til Meta-kanaler (samme kanoniske run-ID overalt).
  const campaignId = `camp_${run.marketingRunId}`;
  const fav = plan.favoredDimensions;
  const baseGenome: ContentGenome = {
    brandId: input.brandId, channel: "instagram", format: "reel",
    hookType: (fav.hookType as any) ?? "price_first", ctaType: (fav.ctaType as any) ?? "book_viewing",
    goal: mapGoal(input.goal.kind), area: input.focus?.toLowerCase().replace(/\s+/g, "_"),
  };
  const campaign: CampaignPlan = {
    campaignId, marketingRunId: run.marketingRunId, brandId: input.brandId, strategy: "exploit",
    goal: input.goal, focus: input.focus, channels, masterIdea: input.masterIdea,
  };
  const briefs = atomizeCampaign(campaign, { baseGenome, makeContentId: (i, c) => `${campaignId}_${i}_${c}`, leadCaptureChannels: [] });

  // Content Resolver-kilder + konto (best-effort på draft-tid; executor er hard fail-closed).
  const sources: ResolverSourceMap = { organizationId: brand.contentHubOrgId ?? null, adCampaignIds: brand.adCampaignIds ?? null };

  const generator = makeConfiguredCreativeGenerator();
  const results: CampaignDraftResult["results"] = [];
  const trace: unknown[] = [];
  // Riktig rekkefølge (P0): resolve/generér → persist asset → resolve konto →
  // dispatch (publishability → quality → policy → lås hash → persist publikasjon
  // → approval SIST). Approval opprettes aldri før hele payloaden er låst.
  for (const brief of briefs) {
    let creative: CreativeResult;
    let sourceType = "generated";
    let sourceId: string | null = null;
    let reuseMode: string | null = null;
    try {
      if (input.legacyPublicationId) {
        // CANARY: eksplisitt legacy content_publications-rad (ingen AI, ingen fuzzy).
        const candidate = await loadLegacyPublicationCandidate(supabase, { publicationId: input.legacyPublicationId, brandId: input.brandId, channel: brief.channel, mediaUrl: input.mediaUrl });
        creative = assetFromCandidate(brief, brand, candidate);
        sourceType = "legacy_content_publication";
        sourceId = candidate.contentId;
        reuseMode = "reuse_exact";
      } else {
        // 1) RESOLVE FØR GENERERING: bruk eksisterende (publishable) innhold hvis egnet.
        const decision = await resolveMarketingContent(supabase, { brandId: input.brandId, channel: brief.channel, goal: brief.genome.goal, language: brief.genome.language, area: brief.genome.area, format: brief.genome.format }, sources).catch(() => null);
        if (decision && decision.decision !== "generate" && decision.chosen) {
          creative = assetFromCandidate(brief, brand, decision.chosen);
          sourceType = decision.chosen.source;
          sourceId = decision.chosen.contentId;
          reuseMode = decision.chosen.reuseMode;
        } else {
          creative = await generator.generate({ brief, brand, recommendation }); // kaster CREATIVE_OUTPUT_INVALID ved ugyldig AI-svar
        }
      }
    } catch (err) {
      // Ugyldig kreativt output / legacy-avvisning blir ALDRI et asset/approval (fail closed).
      results.push({ contentId: brief.contentId, channel: brief.channel, publicationId: "-", state: "rejected", mode: "n/a", qualityScore: null, approvalId: null, error: err instanceof Error ? err.message : "CREATIVE_OUTPUT_INVALID", source: sourceType });
      continue;
    }
    await persistAsset(supabase, creative).catch(() => undefined);

    // 2) Resolve EKSPLISITT destinasjon FØR dispatch (fail-closed bobler opp fra resolveren).
    const account = await resolvePublishingAccount(supabase, {
      brandId: input.brandId, channel: brief.channel, service: input.service ?? null,
      market: input.market ?? null, language: input.language ?? brief.genome.language ?? null,
      publishingAccountId: input.publishingAccountId ?? null,
    }).catch(() => null);

    // 3) Dispatch låser publishability/quality/hash/publikasjon og oppretter approval SIST.
    const d = await dispatchGeneratedAsset(orchestratorDeps, {
      asset: creative.asset, brief, run, brand, history: [],
      account: account ? { accountId: account.accountId } : null,
      service: input.service ?? null, sourceType, sourceId, reuseMode, propertyIds: creative.provenance.propertyIds ?? [],
    });

    results.push({
      contentId: brief.contentId, channel: brief.channel, publicationId: d.publicationId, state: String(d.state), mode: d.mode,
      qualityScore: d.qualityScore, approvalId: d.approvalId, error: d.error, source: sourceType,
      caption: [creative.asset.headline, creative.asset.body, creative.asset.cta].filter(Boolean).join("\n"),
      imageUrl: creative.asset.media?.imageUrl ?? null, brandId: input.brandId, accountId: account?.accountId ?? null, assetHash: d.assetHash,
    });
    trace.push(...d.trace);
  }

  return { marketingRunId: run.marketingRunId, correlationId: run.correlationId, campaignId, results, trace };
}

/** Bygg et GeneratedAsset + provenance fra et gjenbrukt/adaptert kandidat-asset. */
function assetFromCandidate(brief: any, brand: any, chosen: any): CreativeResult {
  return {
    asset: {
      contentId: brief.contentId, creativeVariantId: `${brief.contentId}_v1`, campaignId: brief.campaignId,
      channel: brief.channel, genome: brief.genome,
      headline: undefined, body: chosen.text ?? "", cta: brand.preferredCta,
      media: chosen.media ?? undefined, factSources: chosen.factSources ?? [], generator: {},
    },
    provenance: {
      generatedBy: "content-resolver", model: chosen.source, promptVersion: "resolver-1.0",
      learningRulesUsed: [], factSources: chosen.factSources ?? [], propertyIds: chosen.propertyIds ?? [],
      createdAt: new Date().toISOString(), approvedBy: null, approvedAt: null,
    },
  };
}

/** Steg 6: kjør en godkjent publisering gjennom Agentic Executor (separat audit-hendelse). */
export async function runApprovedPublicationProd(supabase: MarketingSupabaseLike, args: { approvalId: string; executedBy: string }) {
  const publisher = makeConfiguredMetaPublisher(supabase);
  // Live: hard fail-closed konto-resolusjon (eksplisitt konto, P0). Dry-run: hopp over.
  const live = process.env.MARKETING_META_LIVE === "true";
  const resolveAccount = live ? (a: { brandId: string; channel: string }) => resolvePublishingAccount(supabase, a) : undefined;
  return runApprovedPublication(supabase, { approvalId: args.approvalId, executedBy: args.executedBy, publisher, resolveAccount });
}

/** Server-side service-role klient (samme mønster som øvrige API-ruter). */
export function getServiceSupabase(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}
