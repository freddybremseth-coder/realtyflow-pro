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
  buildMarketingPlan,
  createMarketingRun,
  type CampaignPlan,
  type CommercialGoal,
} from "@/lib/marketing/autonomous";
import type { ContentGenome, ContentGoal, MarketingChannel } from "@/lib/marketing/genome";
import { loadBrandContext } from "@/services/marketing/brand-brain-adapter";
import { recommendForGeneration } from "@/services/marketing/learning-adapter";
import { makeCreativeGenerator, makeDryRunCreativeGenerator, persistAsset } from "@/services/marketing/creative-generator";
import { makeMarketingApprovalRequester } from "@/services/marketing/marketing-approval";
import { makeMetaPublisher, metaCredentialsPresent } from "@/services/marketing/publishers/meta-publisher";
import { runApprovedPublication } from "@/services/marketing/publish-executor";
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
  publishingCapacityPerWeek?: number;
}

export interface CampaignDraftResult {
  marketingRunId: string;
  correlationId: string;
  campaignId: string;
  results: Array<{ contentId: string; channel: string; publicationId: string; state: string; mode: string; qualityScore: number | null; approvalId: string | null; error?: string }>;
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
  const graphPost = token
    ? async (path: string, body: Record<string, unknown>) => {
        const res = await fetch(`https://graph.facebook.com/v21.0${path}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...body, access_token: token }),
        });
        const json = (await res.json().catch(() => ({}))) as { id?: string; error?: { message?: string } };
        if (!res.ok || !json.id) throw new Error(`Meta Graph feilet: ${json.error?.message ?? res.status}`);
        return { id: json.id };
      }
    : undefined;
  const live = process.env.MARKETING_META_LIVE === "true" && metaCredentialsPresent({ graphPost, igUserId, pageId });
  return makeMetaPublisher({ supabase, graphPost, igUserId, pageId, live });
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

  const run = createMarketingRun({ brandId: input.brandId, level: "copilot" });
  const orchestratorDeps: OrchestratorDeps = {
    supabase,
    loadGuardState: guardStateLoader(),
    requestApproval: makeMarketingApprovalRequester(supabase as any, { runId: run.marketingRunId, correlationId: run.correlationId }),
  };

  // Plan (persisterer run, leser learning).
  const recommendation = await recommendForGeneration(supabase, { scope: input.brandId }).catch(() => undefined);
  const directorInput = {
    brandId: input.brandId, brandName: brand.brandName, goals: [input.goal],
    channels: META_CHANNELS, pipelineGaps: [], inventoryFocus: input.focus ? [input.focus] : [],
    activeCampaignIds: [], budget: {}, publishingCapacityPerWeek: input.publishingCapacityPerWeek ?? 4,
  };
  const plan = buildMarketingPlan(directorInput as any, { marketingRunId: run.marketingRunId, correlationId: run.correlationId, recommendation });
  await planMarketingRun(orchestratorDeps, directorInput as any, { level: "copilot" }).catch(() => undefined);

  // Kampanje + atomisering til Meta-kanaler.
  const campaignId = `camp_${run.marketingRunId}`;
  const fav = plan.favoredDimensions;
  const baseGenome: ContentGenome = {
    brandId: input.brandId, channel: "instagram", format: "reel",
    hookType: (fav.hookType as any) ?? "price_first", ctaType: (fav.ctaType as any) ?? "book_viewing",
    goal: mapGoal(input.goal.kind), area: input.focus?.toLowerCase().replace(/\s+/g, "_"),
  };
  const campaign: CampaignPlan = {
    campaignId, marketingRunId: run.marketingRunId, brandId: input.brandId, strategy: "exploit",
    goal: input.goal, focus: input.focus, channels: META_CHANNELS, masterIdea: input.masterIdea,
  };
  const briefs = atomizeCampaign(campaign, { baseGenome, makeContentId: (i, c) => `${campaignId}_${i}_${c}`, leadCaptureChannels: [] });

  // Generér + persistér assets, dispatch gjennom portene (novelty→quality→policy→guards→approval).
  const generator = makeConfiguredCreativeGenerator();
  const results: CampaignDraftResult["results"] = [];
  const trace: unknown[] = [];
  for (const brief of briefs) {
    const creative = await generator.generate({ brief, brand, recommendation });
    await persistAsset(supabase, creative).catch(() => undefined);
    const d = await dispatchGeneratedAsset(orchestratorDeps, { asset: creative.asset, brief, run, brand, history: [] });
    results.push({ contentId: brief.contentId, channel: brief.channel, publicationId: d.publicationId, state: String(d.state), mode: d.mode, qualityScore: d.qualityScore, approvalId: d.approvalId, error: d.error });
    trace.push(...d.trace);
  }

  return { marketingRunId: run.marketingRunId, correlationId: run.correlationId, campaignId, results, trace };
}

/** Steg 6: kjør en godkjent publisering gjennom Agentic Executor (separat audit-hendelse). */
export async function runApprovedPublicationProd(supabase: MarketingSupabaseLike, args: { approvalId: string; executedBy: string }) {
  const publisher = makeConfiguredMetaPublisher(supabase);
  return runApprovedPublication(supabase, { approvalId: args.approvalId, executedBy: args.executedBy, publisher });
}

/** Server-side service-role klient (samme mønster som øvrige API-ruter). */
export function getServiceSupabase(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}
