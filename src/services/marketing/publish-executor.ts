/**
 * Phase 7.1B — publisering som Agentic Executor-handling. Kjører KUN godkjente
 * approvals gjennom eksisterende executeApproval-mønster, slik at approval og
 * execution forblir SEPARATE audit-hendelser. Fail-closed: publiserer ikke hvis
 * publikasjon/asset mangler, provenance mangler, eller innholdet bryter dagens
 * publishability/quality/claim/role/format-gater.
 */

import { insertRevenueEvent } from "@/lib/revenue/events";
import { executeApproval, type ActionExecutor, type ExecuteResult, type ExecutorDeps } from "@/lib/agentic/executor";
import { makeExecutorStore } from "@/services/agentic/adapters";
import { approvedAssetHash, contentPublishabilityGate, contentQualityGate, type GeneratedAsset } from "@/lib/marketing/autonomous";
import { loadBrandContext } from "@/services/marketing/brand-brain-adapter";
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

/**
 * Sørger for at en faktisk ekstern publisering også finnes i den canonical
 * content_publications-ledgeren som engagement-tracker leser. Dette er en ren
 * observability/learning-bro: den publiserer ingenting selv, og dry-runs skrives
 * aldri som ekte kanalposter.
 */
async function syncCanonicalContentPublication(
  supabase: MarketingSupabaseLike,
  args: {
    publicationId: string;
    pub: any;
    asset: GeneratedAsset;
    externalId?: string;
    dryRun?: boolean;
    at: string;
    isGenerated: boolean;
  },
) {
  if (args.dryRun || !args.externalId || args.pub?.state === "failed") return;
  if (!args.pub?.brand_id) return;
  if (args.asset.channel !== "instagram" && args.asset.channel !== "facebook") return;

  const caption = [args.asset.headline, args.asset.body, args.asset.cta].filter(Boolean).join("\n\n");
  const media = (args.asset.media ?? {}) as Record<string, unknown>;
  const mediaUrls = [media.imageUrl, media.videoUrl].filter((value): value is string => typeof value === "string" && value.length > 0);
  const genome = (args.asset.genome ?? {}) as Record<string, unknown>;

  const row = {
    brand_id: args.pub.brand_id,
    content_type: "social",
    title: args.asset.headline ?? `${args.asset.channel}: ${args.pub.source_id ?? args.asset.contentId}`,
    description: caption || null,
    media_urls: mediaUrls,
    ai_generated: args.isGenerated,
    ai_title: args.asset.headline ?? null,
    ai_description: args.asset.body ?? null,
    status: "published",
    published_at: args.at,
    scheduled_platforms: [args.asset.channel],
    publish_attempts: 1,
    last_publish_error: null,
    marketing_publication_id: args.publicationId,
    marketing_content_id: args.pub.content_id ?? args.asset.contentId,
    content_features: {
      source: "marketing_publish_executor",
      marketingPublicationId: args.publicationId,
      marketingContentId: args.pub.content_id ?? args.asset.contentId,
      campaignId: args.pub.campaign_id ?? args.asset.campaignId ?? null,
      creativeVariantId: args.asset.creativeVariantId ?? null,
      sourceType: args.pub.source_type ?? null,
      sourceId: args.pub.source_id ?? null,
      genome,
    },
    performance_goal: typeof genome.goal === "string" ? genome.goal : null,
    ...(args.asset.channel === "instagram" ? { instagram_post_id: args.externalId } : { facebook_post_id: args.externalId }),
  };

  const { data: existing } = await supabase
    .from("content_publications")
    .select("id")
    .eq("marketing_publication_id", args.publicationId)
    .maybeSingle();

  if (existing?.id) {
    const { error } = await supabase.from("content_publications").update(row).eq("id", existing.id);
    if (error) throw new Error(`CONTENT_PUBLICATION_SYNC_FAILED: ${error.message}`);
    return;
  }

  const { error } = await supabase.from("content_publications").insert(row);
  if (error) throw new Error(`CONTENT_PUBLICATION_SYNC_FAILED: ${error.message}`);
}

export interface PublishExecutorConfig {
  supabase: MarketingSupabaseLike;
  publisher: ChannelPublisher;
  now?: () => Date;
  /** P0: resolve eksplisitt konto for (brand, service, kanal). Fail-closed hvis satt og finner ingen/tvetydig. */
  resolveAccount?: (args: { brandId: string; channel: string; service?: string | null; publishingAccountId?: string | null }) => Promise<{ accountId: string }>;
}

export function makeMarketingPublishExecutor(cfg: PublishExecutorConfig): ActionExecutor {
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

    // Defense in depth: intern/meta-tekst publiseres ALDRI, selv om den kom seg
    // gjennom approval. Kjøres FØR ev. Meta-call → null Meta-kall ved feil.
    const caption = [asset.headline, asset.body, asset.cta].filter(Boolean).join("\n");
    const pub2 = contentPublishabilityGate(caption);
    if (!pub2.publishable) throw new Error(`PUBLISHABILITY_FAILED: ${pub2.result} — ${pub2.reason}`);

    // STALE-APPROVAL DEFENSE: re-kjør dagens autoritative quality/claim-gater
    // rett før Meta-kallet. En approval opprettet før en sikkerhetsoppdatering
    // skal aldri kunne omgå nye regler bare fordi status senere ble "approved".
    const isGenerated = (pub.source_type ?? "generated") === "generated";
    const brand = pub.brand_id
      ? await loadBrandContext(supabase, pub.brand_id).catch(() => null)
      : null;
    const quality = contentQualityGate(asset, {
      generated: isGenerated,
      brand: brand ?? undefined,
      duplicateFree: true,
    });

    // Sensitive fakta uten kilde publiseres aldri (selv etter approval).
    if (quality.requiresApproval) {
      throw new Error(`FACT_NOT_VERIFIED: ${quality.sensitiveClaimsWithoutSource.join(", ")}`);
    }

    // AI-genererte utfalls-, trend- eller absolutte påstander uten uavhengig
    // provenance publiseres aldri — også når approvalen er eldre enn regelen.
    if (isGenerated && quality.unsupportedOutcomeClaims.length) {
      throw new Error(`CLAIM_NOT_VERIFIED: ${quality.unsupportedOutcomeClaims.join(", ")}`);
    }

    // Eierskaps-/rollepåstander må fortsatt stemme med dagens Brand Brain.
    if (isGenerated && quality.roleViolations.length) {
      throw new Error(`BRAND_ROLE_MISMATCH: ${quality.roleViolations.join(", ")}`);
    }

    // Produksjonsmanus/HOOK/SCENE osv. kan aldri bli selve Meta-captionen.
    if (!quality.checks.formatClean) {
      throw new Error("CHANNEL_FORMAT_MISMATCH: captionen bryter channel-format-kontrakten");
    }

    // P0: re-resolve destinasjon. Endret siden godkjenning → APPROVED_ASSET_CHANGED.
    // BRAND_MISMATCH/ACCOUNT_AMBIGUOUS/ACCOUNT_SCOPE_MISMATCH kastes av resolveren.
    let accountId: string | undefined = pub.account_id ?? undefined;
    if (cfg.resolveAccount) {
      if (!pub.brand_id) throw new Error("BRAND_UNRESOLVED: publikasjon mangler brand_id");
      const acc = await cfg.resolveAccount({ brandId: pub.brand_id, channel: asset.channel, service: pub.service ?? null, publishingAccountId: pub.account_id ?? null });
      if (pub.account_id && pub.account_id !== acc.accountId) throw new Error(`APPROVED_ASSET_CHANGED: publishing-konto endret siden godkjenning (${pub.account_id} → ${acc.accountId}) — krever ny godkjenning.`);
      accountId = acc.accountId;
    }

    // Asset-integritet: godkjent innhold er bundet til en hash. Endres noe → ASSET_MODIFIED.
    if (pub.asset_hash) {
      const recomputed = approvedAssetHash({
        sourceContentId: pub.source_id ?? asset.contentId,
        finalCopy: [asset.headline, asset.body, asset.cta].filter(Boolean).join("\n"),
        finalMedia: JSON.stringify(asset.media ?? {}),
        brandId: pub.brand_id ?? "",
        accountId: accountId ?? "",
        channel: asset.channel,
        propertyIds: (assetRow.provenance?.propertyIds as string[]) ?? [],
        cta: asset.cta ?? "",
        factSources: asset.factSources ?? [],
      });
      if (recomputed !== pub.asset_hash) throw new Error("ASSET_MODIFIED: innhold/konto endret etter godkjenning — publiserer ikke.");
    }

    const res = await cfg.publisher.publish(asset, {
      idempotencyKey: pub.idempotency_key,
      publicationId,
      contentId: pub.content_id,
      campaignId: pub.campaign_id,
      marketingRunId: pub.marketing_run_id,
      correlationId: item.correlationId ?? undefined,
      channel: asset.channel,
      accountId,
    });

    const at = (cfg.now?.() ?? new Date()).toISOString();
    await supabase.from("marketing_publications").update({ state: res.state, updated_at: at }).eq("publication_id", publicationId);
    await supabase.from("marketing_assets").update({ approved_at: at, updated_at: at }).eq("creative_variant_id", asset.creativeVariantId);

    // Publisering og læring må være samme canonical kjede. Best-effort etter at
    // Meta allerede har bekreftet posten; en sync-feil må IKKE føre til retry og
    // dermed risiko for dobbeltpublisering. Feilen logges tydelig for Attention.
    if (res.state === "published" && !res.dryRun && res.externalId) {
      try {
        await syncCanonicalContentPublication(supabase, {
          publicationId,
          pub,
          asset,
          externalId: res.externalId,
          dryRun: res.dryRun,
          at,
          isGenerated,
        });
      } catch (e) {
        console.error(`[publish-executor] canonical content-publication sync feilet (post er allerede publisert): ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    // Lukk run-livssyklusen: agent_runs.status→completed, marketing_runs.stage→done.
    // BEST-EFFORT (aldri kaste) — posten er allerede ute, og executeApproval markerer
    // executed FØRST etter at vi returnerer. En throw her ville hindret markExecuted
    // → retry → dobbel-post. En feilet lukking er kun en kosmetisk DB-inkonsistens.
    const runId = pub.marketing_run_id ?? item.runId ?? null;
    if (runId) {
      try {
        await supabase.from("agent_runs").update({ status: "completed", outcome: "executed", finished_at: at, updated_at: at }).eq("id", runId);
        await supabase.from("marketing_runs").update({ stage: "done", updated_at: at }).eq("marketing_run_id", runId);
      } catch (e) {
        console.error(`[publish-executor] run-livssyklus-lukking feilet (ikke-kritisk, post er publisert): ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    return { detail: `${res.dryRun ? "DRY-RUN: " : ""}publisert ${asset.channel} (${res.externalId})` };
  };
}

/**
 * Kjør en godkjent publisering gjennom executeApproval. Approval og execution er
 * separate audit-hendelser (executeApproval markerer executed + revenue-event).
 */
export async function runApprovedPublication(
  supabase: MarketingSupabaseLike,
  args: { approvalId: string; executedBy: string; publisher: ChannelPublisher; now?: () => Date; resolveAccount?: PublishExecutorConfig["resolveAccount"] },
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
  const exec = makeMarketingPublishExecutor({ supabase, publisher: args.publisher, now: args.now, resolveAccount: args.resolveAccount });
  return executeApproval(deps, { id: args.approvalId, executedBy: args.executedBy, executors: { publish_social: exec, publish_article: exec } });
}
