/**
 * Phase 7.1 — MetaPublisher (Instagram + Facebook) bak ChannelPublisher.
 * Idempotent: publiserer aldri samme idempotencyKey to ganger (retry-trygt).
 * Selve Graph API-kallet er en DI-søm (krever tokens/side-IDer i miljøet).
 * På COPILOT nås denne kun ETTER menneskelig godkjenning.
 */

import type { ChannelPublisher } from "@/services/marketing/autonomous-orchestrator";
import type { GeneratedAsset } from "@/lib/marketing/autonomous";
import type { MarketingSupabaseLike } from "@/services/marketing/adapters";

export type GraphPost = (path: string, body: Record<string, unknown>) => Promise<{ id: string }>;

export interface MetaPublisherConfig {
  graphPost: GraphPost;
  igUserId?: string;
  pageId?: string;
}

function caption(asset: GeneratedAsset): string {
  return [asset.headline, asset.body, asset.cta].filter(Boolean).join("\n\n");
}

export function makeMetaPublisher(supabase: MarketingSupabaseLike, cfg: MetaPublisherConfig): ChannelPublisher {
  return {
    async publish(asset, opts) {
      // Idempotens-sjekk mot allerede publiserte rader.
      const { data: existing } = await supabase
        .from("marketing_publications")
        .select("state")
        .eq("idempotency_key", opts.idempotencyKey)
        .maybeSingle();
      if (existing && (existing.state === "published" || existing.state === "scheduled")) {
        return { state: existing.state };
      }

      const target = asset.channel === "facebook" ? cfg.pageId : cfg.igUserId;
      if (!target) throw new Error(`MetaPublisher: mangler ${asset.channel === "facebook" ? "pageId" : "igUserId"}`);

      const res = await cfg.graphPost(`/${target}/media`, { caption: caption(asset), idempotency_key: opts.idempotencyKey });
      return { state: "published", externalId: res.id };
    },
  };
}
