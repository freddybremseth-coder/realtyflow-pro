/**
 * Phase 7.1B — MetaPublisher (Instagram + Facebook) bak ChannelPublisher.
 *
 * EKSTERN idempotens (ikke bare DB): en attempt-ledger (marketing_publish_attempts,
 * unik idempotency_key) skrives FØR Graph-kallet. Timer et forsøk ut etter
 * posting, avstemmes neste forsøk mot Graph (reconcile) i stedet for å poste på
 * nytt — retry etter timeout kan aldri lage dobbelt innlegg. Mangler live-
 * credentials kjøres dry-run (default). På COPILOT nås denne kun ETTER godkjenning.
 */

import type { ChannelPublisher, PublishContext } from "@/services/marketing/autonomous-orchestrator";
import type { GeneratedAsset } from "@/lib/marketing/autonomous";
import type { MarketingSupabaseLike } from "@/services/marketing/adapters";

export type GraphPost = (path: string, body: Record<string, unknown>) => Promise<{ id: string }>;

export interface MetaPublisherConfig {
  supabase: MarketingSupabaseLike;
  graphPost?: GraphPost;
  igUserId?: string;
  pageId?: string;
  /** Live kun når eksplisitt på OG credentials finnes. Ellers dry-run. */
  live?: boolean;
  /** Avstem et uavklart forsøk mot Graph (finn media tagget med idempotency-nøkkel). */
  reconcile?: (idempotencyKey: string) => Promise<{ externalId: string } | null>;
  now?: () => Date;
}

function caption(asset: GeneratedAsset): string {
  return [asset.headline, asset.body, asset.cta].filter(Boolean).join("\n\n");
}

export function metaCredentialsPresent(cfg: Pick<MetaPublisherConfig, "graphPost" | "igUserId" | "pageId">): boolean {
  return !!cfg.graphPost && (!!cfg.igUserId || !!cfg.pageId);
}

export function makeMetaPublisher(cfg: MetaPublisherConfig): ChannelPublisher {
  const supabase = cfg.supabase;
  const live = !!cfg.live && metaCredentialsPresent(cfg);
  const nowIso = () => (cfg.now?.() ?? new Date()).toISOString();

  return {
    async publish(asset: GeneratedAsset, opts: PublishContext) {
      const key = opts.idempotencyKey;

      // 1) Ledger-oppslag — ekstern idempotens.
      const { data: attempt } = await supabase.from("marketing_publish_attempts").select("*").eq("idempotency_key", key).maybeSingle();
      if (attempt?.status === "posted" && attempt.external_id) {
        return { state: "published", externalId: String(attempt.external_id), dryRun: !!attempt.dry_run };
      }
      if (attempt?.status === "posting") {
        // Forrige forsøk kan ha postet før timeout — avstem, ikke re-post.
        const found = cfg.reconcile ? await cfg.reconcile(key) : null;
        if (found?.externalId) {
          await supabase.from("marketing_publish_attempts").update({ status: "posted", external_id: found.externalId, updated_at: nowIso() }).eq("idempotency_key", key);
          return { state: "published", externalId: found.externalId };
        }
        throw new Error("PUBLISH_UNCONFIRMED: forrige forsøk uavklart — avstemming fant ingen ekstern post. Manuell sjekk kreves.");
      }

      const base = {
        idempotency_key: key, publication_id: opts.publicationId ?? null, content_id: opts.contentId ?? null,
        campaign_id: opts.campaignId ?? null, marketing_run_id: opts.marketingRunId ?? null,
        correlation_id: opts.correlationId ?? null, channel: asset.channel,
      };

      // 2) Dry-run (default uten live-credentials): fullfør sløyfen uten ekte posting.
      if (!live) {
        const externalId = `dryrun:${key}`;
        await supabase.from("marketing_publish_attempts").upsert({ ...base, status: "posted", external_id: externalId, dry_run: true, created_at: nowIso(), updated_at: nowIso() }, { onConflict: "idempotency_key" });
        return { state: "published", externalId, dryRun: true };
      }

      // 3) Reserver forsøket FØR Graph-kallet (unik nøkkel → hindrer parallell dobbel).
      await supabase.from("marketing_publish_attempts").upsert({ ...base, status: "posting", created_at: nowIso(), updated_at: nowIso() }, { onConflict: "idempotency_key" });

      // 4) Ekte Graph-kall med idempotency-token.
      const target = asset.channel === "facebook" ? cfg.pageId : cfg.igUserId;
      if (!target) throw new Error(`MetaPublisher: mangler ${asset.channel === "facebook" ? "pageId" : "igUserId"}`);
      try {
        const res = await cfg.graphPost!(`/${target}/media`, { caption: caption(asset), idempotency_key: key });
        await supabase.from("marketing_publish_attempts").update({ status: "posted", external_id: res.id, updated_at: nowIso() }).eq("idempotency_key", key);
        return { state: "published", externalId: res.id };
      } catch (err) {
        // La forsøket stå "posting" så neste retry avstemmer (unngår dobbel-post ved timeout).
        await supabase.from("marketing_publish_attempts").update({ error: err instanceof Error ? err.message : String(err), updated_at: nowIso() }).eq("idempotency_key", key);
        throw err;
      }
    },
  };
}
