/**
 * Phase 7.1B — publisering som Agentic Executor-handling. Kjører KUN godkjente
 * approvals gjennom eksisterende executeApproval-mønster, slik at approval og
 * execution forblir SEPARATE audit-hendelser. Fail-closed: publiserer ikke hvis
 * publikasjon/asset mangler, provenance mangler, eller sensitive fakta er
 * uverifiserte (FACT_NOT_VERIFIED).
 */

import { insertRevenueEvent } from "@/lib/revenue/events";
import { executeApproval, type ActionExecutor, type ExecuteResult, type ExecutorDeps } from "@/lib/agentic/executor";
import { makeExecutorStore } from "@/services/agentic/adapters";
import { contentQualityGate, type GeneratedAsset } from "@/lib/marketing/autonomous";
import type { ChannelPublisher } from "@/services/marketing/autonomous-orchestrator";
import type { MarketingSupabaseLike } from "@/services/marketing/adapters";

function rowToAsset(row: any): GeneratedAsset {
  return {
    contentId: row.content_id,
    creativeVariantId: row.creative_variant_id,
    campaignId: row.campaign_id,
    channel: row.channel,
    genome: row.genome,
    headline: row.headline ?? undefined,
    body: row.body ?? undefined,
    cta: row.cta ?? undefined,
    media: row.media ?? undefined,
    factSources: row.fact_sources ?? [],
    generator: {},
  };
}

export function makeMarketingPublishExecutor(cfg: { supabase: MarketingSupabaseLike; publisher: ChannelPublisher; now?: () => Date }): ActionExecutor {
  const supabase = cfg.supabase;
  return async (item) => {
    const publicationId = item.subjectRef;
    if (!publicationId) throw new Error("PUBLICATION_REF_MISSING");

    const { data: pub } = await supabase.from("marketing_publications").select("*").eq("publication_id", publicationId).maybeSingle();
    if (!pub) throw new Error("PUBLICATION_NOT_FOUND");

    const { data: assetRow } = await supabase.from("marketing_assets").select("*").eq("content_id", pub.content_id).maybeSingle();
    if (!assetRow) throw new Error("ASSET_NOT_FOUND");

    // Fail-closed: provenance MÅ finnes.
    if (!assetRow.provenance || Object.keys(assetRow.provenance).length === 0) throw new Error("PROVENANCE_MISSING");

    const asset = rowToAsset(assetRow);

    // Fail-closed: sensitive fakta uten kilde publiseres aldri (selv etter godkjenning).
    const quality = contentQualityGate(asset);
    if (quality.requiresApproval) throw new Error(`FACT_NOT_VERIFIED: ${quality.sensitiveClaimsWithoutSource.join(", ")}`);

    const res = await cfg.publisher.publish(asset, {
      idempotencyKey: pub.idempotency_key,
      publicationId,
      contentId: pub.content_id,
      campaignId: pub.campaign_id,
      marketingRunId: pub.marketing_run_id,
      correlationId: item.correlationId ?? undefined,
      channel: asset.channel,
    });

    const at = (cfg.now?.() ?? new Date()).toISOString();
    await supabase.from("marketing_publications").update({ state: res.state, updated_at: at }).eq("publication_id", publicationId);
    await supabase.from("marketing_assets").update({ approved_at: at, updated_at: at }).eq("creative_variant_id", asset.creativeVariantId);

    return { detail: `${res.dryRun ? "DRY-RUN: " : ""}publisert ${asset.channel} (${res.externalId})` };
  };
}

/**
 * Kjør en godkjent publisering gjennom executeApproval. Approval og execution er
 * separate audit-hendelser (executeApproval markerer executed + revenue-event).
 */
export async function runApprovedPublication(
  supabase: MarketingSupabaseLike,
  args: { approvalId: string; executedBy: string; publisher: ChannelPublisher; now?: () => Date },
): Promise<ExecuteResult> {
  const deps: ExecutorDeps = {
    store: makeExecutorStore(supabase as any),
    sender: { sendEmail: async () => ({ detail: "n/a", dryRun: true }) },
    publishEvent: async (e) => {
      await insertRevenueEvent(supabase as any, {
        eventType: "automation_executed",
        title: e.title,
        actorType: "system",
        revenueImpactEur: e.revenueImpactEur ?? null,
        metadata: { run_id: e.runId, agentic_outcome: "executed", subject_type: e.subjectType, subject_ref: e.subjectRef, marketing: true },
      });
    },
    now: args.now,
  };
  const exec = makeMarketingPublishExecutor({ supabase, publisher: args.publisher, now: args.now });
  return executeApproval(deps, { id: args.approvalId, executedBy: args.executedBy, executors: { publish_social: exec, publish_article: exec } });
}
