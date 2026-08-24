/**
 * Phase 7.1B (hardened) — MetaPublisher for Instagram + Facebook.
 *
 * Modellerer Meta-plattformenes VIRKELIGE publiseringslivssyklus:
 *   Instagram: /media (container) → [poll status for video/reel] → /media_publish
 *              → verifisert media-ID. `posted` settes FØRST etter media_publish.
 *   Facebook:  /feed (tekst/lenke) eller /photos (bilde), single-step.
 *
 * Ekstern idempotens via attempt-ledger (state machine):
 *   reserved → container_created → processing → publishing → posted
 *   (feil → failed; uavklart publish → manual_review).
 * På retry gjenopptas fra state — aldri ny container/post blindt; uavklart
 * publish avstemmes (reconcile) før ev. PUBLISH_UNCONFIRMED. Vi stoler IKKE på
 * en Graph-idempotency-parameter; ledgeren + reconciliation er mekanismen.
 * Uten live-credentials: dry-run (default). På COPILOT nås dette kun ETTER
 * godkjenning.
 */

import type { ChannelPublisher, PublishContext } from "@/services/marketing/autonomous-orchestrator";
import type { GeneratedAsset } from "@/lib/marketing/autonomous";
import type { MarketingSupabaseLike } from "@/services/marketing/adapters";

/** DI-søm mot Meta Graph API — hver plattformoperasjon som egen metode. */
export interface MetaGraph {
  createIgContainer(igUserId: string, p: { imageUrl?: string; videoUrl?: string; caption?: string; mediaType?: string; altText?: string }): Promise<{ id: string }>;
  getContainerStatus(containerId: string): Promise<{ status: string }>; // FINISHED | IN_PROGRESS | ERROR
  publishIgMedia(igUserId: string, creationId: string): Promise<{ id: string }>;
  createFbPost(pageId: string, p: { message: string; link?: string }): Promise<{ id: string }>;
  createFbPhoto(pageId: string, p: { url: string; caption?: string }): Promise<{ id: string }>;
  /** Avstem et uavklart publish (finn allerede-publisert media for nøkkelen). */
  reconcile?(idempotencyKey: string): Promise<{ externalId: string } | null>;
}

export interface MetaPublisherConfig {
  supabase: MarketingSupabaseLike;
  graph?: MetaGraph;
  igUserId?: string;
  pageId?: string;
  live?: boolean;
  now?: () => Date;
}

export function metaCredentialsPresent(cfg: Pick<MetaPublisherConfig, "graph" | "igUserId" | "pageId">): boolean {
  return !!cfg.graph && (!!cfg.igUserId || !!cfg.pageId);
}

function caption(asset: GeneratedAsset): string {
  return [asset.headline, asset.body, asset.cta].filter(Boolean).join("\n\n");
}

export function makeMetaPublisher(cfg: MetaPublisherConfig): ChannelPublisher {
  const supabase = cfg.supabase;
  const live = !!cfg.live && metaCredentialsPresent(cfg);
  const nowIso = () => (cfg.now?.() ?? new Date()).toISOString();

  const loadAttempt = async (key: string) => {
    const { data } = await supabase.from("marketing_publish_attempts").select("*").eq("idempotency_key", key).maybeSingle();
    return data as any;
  };
  const writeAttempt = async (key: string, base: Record<string, unknown>, patch: Record<string, unknown>) => {
    await supabase.from("marketing_publish_attempts").upsert({ idempotency_key: key, ...base, ...patch, updated_at: nowIso() }, { onConflict: "idempotency_key" });
  };

  async function publishInstagram(asset: GeneratedAsset, key: string, base: Record<string, unknown>, attempt: any, graph: MetaGraph, target: string): Promise<{ state: any; externalId?: string }> {
    const media = asset.media ?? {};
    if (!media.imageUrl && !media.videoUrl) throw new Error("MEDIA_ASSET_MISSING: Instagram krever gyldig image/video URL — publiserer ikke bare caption");

    // Uavklart publish fra forrige forsøk → avstem, ikke re-publiser.
    if (attempt?.status === "publishing") {
      const found = graph.reconcile ? await graph.reconcile(key) : null;
      if (found?.externalId) {
        await writeAttempt(key, base, { status: "posted", external_id: found.externalId, external_media_id: found.externalId });
        return { state: "published", externalId: found.externalId };
      }
      await writeAttempt(key, base, { status: "manual_review" });
      throw new Error("PUBLISH_UNCONFIRMED: publish uavklart, avstemming fant ingen post — manuell sjekk kreves.");
    }

    // Gjenopptak: bruk eksisterende container, opprett aldri på nytt.
    let containerId: string | undefined = attempt?.container_id;
    if (!containerId) {
      await writeAttempt(key, base, { status: "reserved" });
      const c = await graph.createIgContainer(target, { imageUrl: media.imageUrl, videoUrl: media.videoUrl, caption: caption(asset), mediaType: media.mediaType, altText: media.altText });
      containerId = c.id;
      await writeAttempt(key, base, { status: "container_created", container_id: containerId });
    }

    // Video/Reel må være ferdig prosessert før publisering.
    const isVideo = media.mediaType === "video" || media.mediaType === "reel" || (!media.imageUrl && !!media.videoUrl);
    if (isVideo) {
      const st = await graph.getContainerStatus(containerId);
      if (st.status === "ERROR") {
        await writeAttempt(key, base, { status: "failed", error: "container ERROR" });
        throw new Error("IG_CONTAINER_ERROR: media-container feilet prosessering");
      }
      if (st.status !== "FINISHED") {
        await writeAttempt(key, base, { status: "processing" });
        throw new Error("IG_CONTAINER_PROCESSING: container ikke ferdig prosessert — prøv igjen (gjenopptar fra container)");
      }
    }

    // Publiser containeren.
    await writeAttempt(key, base, { status: "publishing", container_id: containerId });
    try {
      const pub = await graph.publishIgMedia(target, containerId);
      await writeAttempt(key, base, { status: "posted", external_id: pub.id, external_media_id: pub.id });
      return { state: "published", externalId: pub.id };
    } catch (err) {
      // La status stå "publishing" så neste retry avstemmer (unngår dobbel-post).
      await writeAttempt(key, base, { error: err instanceof Error ? err.message : String(err) });
      throw err;
    }
  }

  async function publishFacebook(asset: GeneratedAsset, key: string, base: Record<string, unknown>, attempt: any, graph: MetaGraph, target: string): Promise<{ state: any; externalId?: string }> {
    if (attempt?.status === "publishing") {
      const found = graph.reconcile ? await graph.reconcile(key) : null;
      if (found?.externalId) {
        await writeAttempt(key, base, { status: "posted", external_id: found.externalId, external_media_id: found.externalId });
        return { state: "published", externalId: found.externalId };
      }
      await writeAttempt(key, base, { status: "manual_review" });
      throw new Error("PUBLISH_UNCONFIRMED: publish uavklart, avstemming fant ingen post — manuell sjekk kreves.");
    }
    const media = asset.media ?? {};
    await writeAttempt(key, base, { status: "publishing" });
    try {
      const id = media.imageUrl
        ? (await graph.createFbPhoto(target, { url: media.imageUrl, caption: caption(asset) })).id
        : (await graph.createFbPost(target, { message: caption(asset), link: media.linkUrl })).id;
      await writeAttempt(key, base, { status: "posted", external_id: id, external_media_id: id });
      return { state: "published", externalId: id };
    } catch (err) {
      await writeAttempt(key, base, { error: err instanceof Error ? err.message : String(err) });
      throw err;
    }
  }

  return {
    async publish(asset: GeneratedAsset, opts: PublishContext) {
      const key = opts.idempotencyKey;
      const base = {
        publication_id: opts.publicationId ?? null, content_id: opts.contentId ?? null, campaign_id: opts.campaignId ?? null,
        marketing_run_id: opts.marketingRunId ?? null, correlation_id: opts.correlationId ?? null,
        channel: asset.channel, media_type: asset.media?.mediaType ?? null,
      };
      const attempt = await loadAttempt(key);

      // Allerede publisert → idempotent retur, ingen ny post.
      if (attempt?.status === "posted" && (attempt.external_media_id || attempt.external_id)) {
        return { state: "published", externalId: String(attempt.external_media_id ?? attempt.external_id), dryRun: !!attempt.dry_run };
      }
      if (attempt?.status === "manual_review") {
        throw new Error("PUBLISH_UNCONFIRMED: forsøket er flagget for manuell gjennomgang.");
      }

      // Dry-run (default uten live-credentials): fullfør sløyfen uten ekte posting.
      if (!live) {
        const externalId = `dryrun:${key}`;
        await writeAttempt(key, base, { status: "posted", external_id: externalId, external_media_id: externalId, dry_run: true, created_at: nowIso() });
        return { state: "published", externalId, dryRun: true };
      }

      const graph = cfg.graph!;
      // Eksplisitt konto (P0): fra PublishContext, ellers cfg-fallback. Aldri «velg selv».
      const target = opts.accountId ?? (asset.channel === "facebook" ? cfg.pageId : cfg.igUserId);
      if (!target) throw new Error(`ACCOUNT_NOT_FOUND: mangler eksplisitt ${asset.channel === "facebook" ? "Facebook-side" : "Instagram-konto"}`);
      return asset.channel === "facebook"
        ? publishFacebook(asset, key, base, attempt, graph, target)
        : publishInstagram(asset, key, base, attempt, graph, target);
    },
  };
}

/** Ekte Graph API-klient (fetch). Bygges av composition root når credentials finnes. */
export function makeGraphApi(token: string, apiVersion = "v21.0"): MetaGraph {
  const base = `https://graph.facebook.com/${apiVersion}`;
  const post = async (path: string, body: Record<string, unknown>) => {
    const res = await fetch(`${base}${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, access_token: token }) });
    const json = (await res.json().catch(() => ({}))) as { id?: string; error?: { message?: string } };
    if (!res.ok || !json.id) throw new Error(`Meta Graph feilet (${path}): ${json.error?.message ?? res.status}`);
    return { id: json.id };
  };
  return {
    createIgContainer: (ig, p) => post(`/${ig}/media`, { ...(p.imageUrl ? { image_url: p.imageUrl } : {}), ...(p.videoUrl ? { video_url: p.videoUrl, media_type: (p.mediaType ?? "video").toUpperCase() === "REEL" ? "REELS" : "VIDEO" } : {}), caption: p.caption, ...(p.altText ? { alt_text: p.altText } : {}) }),
    getContainerStatus: async (containerId) => {
      const res = await fetch(`${base}/${containerId}?fields=status_code&access_token=${encodeURIComponent(token)}`);
      const json = (await res.json().catch(() => ({}))) as { status_code?: string; error?: { message?: string } };
      if (!res.ok) throw new Error(`Meta container-status feilet: ${json.error?.message ?? res.status}`);
      return { status: json.status_code ?? "IN_PROGRESS" };
    },
    publishIgMedia: (ig, creationId) => post(`/${ig}/media_publish`, { creation_id: creationId }),
    createFbPost: (pageId, p) => post(`/${pageId}/feed`, { message: p.message, ...(p.link ? { link: p.link } : {}) }),
    createFbPhoto: (pageId, p) => post(`/${pageId}/photos`, { url: p.url, caption: p.caption }),
  };
}
