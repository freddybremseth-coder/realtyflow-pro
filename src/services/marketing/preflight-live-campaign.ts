/**
 * Phase 7.1E — First Live Campaign Canary (preflight).
 *
 * Verifiserer ALLE produksjonsforutsetninger for ÉN valgt Content Hub-item, uten
 * å publisere noe. Ingen Meta-call skjer her — preflight har ingen publisher-
 * avhengighet. Returnerer READY_FOR_LIVE kun hvis alle KRITISKE checks er grønne;
 * ellers NOT_READY (fail closed) med eksplisitt årsak per check. COPILOT uendret.
 *
 * Bygger ikke nye moduler — gjenbruker brand-brain, account-resolver og
 * asset-integrity.
 */

import { approvedAssetHash, contentPublishabilityGate } from "@/lib/marketing/autonomous";
import { loadBrandContext } from "@/services/marketing/brand-brain-adapter";
import { resolvePublishingAccount, type ResolvedAccount } from "@/services/marketing/account-resolver";
import type { MarketingSupabaseLike } from "@/services/marketing/adapters";

export interface PreflightInput {
  brandId: string;
  service?: string;
  channel: string;
  /**
   * "live" = første ekte post: Meta-credentials blir KRITISK. "dry_run" (default)
   * = canary uten ekte posting, Meta-creds er kun warn.
   */
  mode?: "dry_run" | "live";
  market?: string;
  language?: string;
  /** Menneske-valgt konto (external_id). */
  publishingAccountId?: string;
  /** "social_post:<id>", "media_asset:<id>" eller "content_publication:<id>". Utelates i AI-modus. */
  contentHubItemId?: string;
  /** Public HTTPS media-URL (kan overstyre/utfylle asset-ens egen). */
  mediaUrl?: string;
  cta?: string;
  /** AI-modus: ingen forhåndsvalgt item — innhold genereres i campaign-draft. */
  aiMode?: boolean;
}

export interface PreflightEnv {
  autopilotEnabled: boolean;
  metaLive: boolean;
  metaToken?: string;
  igUserId?: string;
  pageId?: string;
  anthropicKey?: string;
}

export interface PreflightDeps {
  supabase: MarketingSupabaseLike;
  env: PreflightEnv;
  /** Er General Approval Gateway koblet (agentic_approvals skrivbar)? */
  approvalConfigured: boolean;
}

export type CheckStatus = "ok" | "warn" | "fail";
export interface PreflightCheck {
  name: string;
  critical: boolean;
  status: CheckStatus;
  detail: string;
}

export interface PreflightResult {
  status: "READY_FOR_LIVE" | "NOT_READY";
  mode: "dry_run" | "live";
  checks: PreflightCheck[];
  criticalFailures: string[];
  assetHash?: string;
  account?: ResolvedAccount;
}

const isHttps = (u?: string | null) => typeof u === "string" && /^https:\/\//i.test(u);

export async function preflightLiveCampaign(deps: PreflightDeps, input: PreflightInput): Promise<PreflightResult> {
  const supabase = deps.supabase;
  const checks: PreflightCheck[] = [];
  const add = (name: string, critical: boolean, status: CheckStatus, detail: string) => checks.push({ name, critical, status, detail });

  // 1) Kill switch må være PÅ (ellers publiserer ingenting).
  add("kill_switch", true, deps.env.autopilotEnabled ? "ok" : "fail", deps.env.autopilotEnabled ? "MARKETING_AUTOPILOT_ENABLED på" : "Kill switch AV — ingen publisering mulig");

  // 2) Brand context.
  const brand = await loadBrandContext(supabase, input.brandId).catch(() => null);
  add("brand_context", true, brand ? "ok" : "fail", brand ? `brand «${brand.brandName}»` : `MISSING_BRAND_CONTEXT for «${input.brandId}»`);

  // 3) Service (routing-dimensjon).
  add("service", false, input.service ? "ok" : "warn", input.service ? `service «${input.service}»` : "ingen service angitt (kan gi tvetydig routing ved flere kontoer)");

  // AI-modus: intet forhåndsvalgt item — innhold genereres i campaign-draft, som
  // kjører publishability/quality/fakta-gate. Item-checkene her er N/A.
  const hasItem = !!input.contentHubItemId && !input.aiMode;
  const isSocialPost = hasItem && input.contentHubItemId!.startsWith("social_post:");
  let itemMediaUrl: string | null = null;
  let itemText = "";

  if (hasItem) {
    // 4) Content Hub-org-mapping (nødvendig for å slå opp Content Hub-innhold).
    add("content_hub_org", isSocialPost, brand?.contentHubOrgId ? "ok" : (isSocialPost ? "fail" : "warn"),
      brand?.contentHubOrgId ? `content_hub_org_id «${brand.contentHubOrgId}»` : "brand_context.content_hub_org_id mangler");

    // 5) Content Hub-item finnes + er godkjent/menneske-eid.
    const rawId = input.contentHubItemId!.split(":")[1];
    let humanApproved = false; let itemFound = false;
    if (isSocialPost) {
      const { data } = await supabase.from("social_posts").select("id, content, status, organization_id").eq("id", rawId).maybeSingle();
      if (data) { itemFound = true; itemText = data.content ?? ""; humanApproved = data.status === "approved"; }
    } else if (input.contentHubItemId!.startsWith("media_asset:")) {
      const { data } = await supabase.from("media_assets").select("id, public_url, brand_id, status, is_favorite, exported_to_content_hub_at").eq("id", rawId).maybeSingle();
      if (data) { itemFound = true; itemMediaUrl = data.public_url ?? null; humanApproved = !!data.is_favorite || !!data.exported_to_content_hub_at; }
    } else if (input.contentHubItemId!.startsWith("content_publication:")) {
      const { data } = await supabase.from("content_publications").select("*").eq("id", rawId).maybeSingle();
      if (data) {
        itemFound = true;
        itemText = String(data.description ?? data.content ?? data.body ?? data.caption ?? "");
        itemMediaUrl = data.ai_image_url ?? data.image_url ?? (Array.isArray(data.media_urls) ? data.media_urls[0] : null) ?? null;
        humanApproved = ["published", "approved", "scheduled", "review"].includes(String(data.status));
      }
    }
    add("content_hub_item", true, itemFound ? "ok" : "fail", itemFound ? `fant «${input.contentHubItemId}»` : `CONTENT_ITEM_NOT_FOUND «${input.contentHubItemId}»`);
    add("human_approved", true, humanApproved ? "ok" : "fail", humanApproved ? "menneske-godkjent/tiltrodd status" : "innholdet er ikke i en tiltrodd/godkjent status");
    const pubItem = contentPublishabilityGate(itemText);
    add("content_publishable", true, pubItem.publishable ? "ok" : "fail", pubItem.publishable ? "innhold er publishable" : `${pubItem.result} — ${pubItem.reason}`);
  } else {
    add("content_source", false, "warn", "AI-modus: innhold genereres i campaign-draft (publishability/quality/fakta-gate kjøres der).");
  }

  // 6) Eksplisitt publiseringskonto (routing + isolasjon). Aldri tvetydig.
  let account: ResolvedAccount | undefined;
  try {
    account = await resolvePublishingAccount(supabase, {
      brandId: input.brandId, channel: input.channel, service: input.service ?? null,
      market: input.market ?? null, language: input.language ?? null, publishingAccountId: input.publishingAccountId ?? null,
    });
    add("publishing_account", true, "ok", `konto «${account.accountId}» (${account.displayName})`);
  } catch (e) {
    add("publishing_account", true, "fail", e instanceof Error ? e.message : "konto kunne ikke resolves");
  }

  // 7) Media: public HTTPS-URL. Kritisk for IG KUN i item-modus; i AI-modus
  // legges bilde til i campaign-draft (eller dry-run) → non-kritisk her.
  const mediaUrl = input.mediaUrl ?? itemMediaUrl;
  const igNeedsMedia = input.channel === "instagram";
  const mediaOk = isHttps(mediaUrl);
  add("media_url", igNeedsMedia && hasItem, mediaOk ? "ok" : (igNeedsMedia && hasItem ? "fail" : "warn"),
    mediaOk ? `media OK (${mediaUrl})` : (mediaUrl ? "MEDIA_ASSET_INVALID: ikke public HTTPS-URL" : hasItem ? "MEDIA_ASSET_MISSING: ingen media-URL" : "AI-modus: bilde legges til i campaign-draft (eller dry-run)"));

  // 8) Approval-tjeneste koblet (fail closed hvis ikke).
  add("approval_service", true, deps.approvalConfigured ? "ok" : "fail", deps.approvalConfigured ? "General Approval Gateway koblet" : "APPROVAL_SERVICE_UNAVAILABLE");

  // 9) Meta-credentials. I live-modus KRITISK (ekte post); i dry_run kun warn.
  const liveMode = input.mode === "live";
  const metaReady = deps.env.metaLive && !!deps.env.metaToken && (!!deps.env.igUserId || !!deps.env.pageId);
  add("meta_credentials", liveMode, metaReady ? "ok" : (liveMode ? "fail" : "warn"),
    metaReady ? "MARKETING_META_LIVE + token + konto satt"
      : liveMode ? "META_CREDENTIALS_MISSING: live-modus krever MARKETING_META_LIVE + META_ACCESS_TOKEN + konto"
        : "ikke live — kjører dry-run (sett MARKETING_META_LIVE + META_ACCESS_TOKEN + konto for ekte post)");

  // 10) Asset-integritet: approved_asset_hash. Kritisk KUN i item-modus (der
  // innholdet finnes nå). I AI-modus beregnes hashen i campaign-draft.
  const canHash = hasItem && !!account && mediaOk && !!brand;
  let assetHash: string | undefined;
  if (canHash) {
    assetHash = approvedAssetHash({
      sourceContentId: input.contentHubItemId!,
      finalCopy: itemText,
      finalMedia: JSON.stringify({ imageUrl: mediaUrl }),
      brandId: input.brandId, accountId: account!.accountId, channel: input.channel,
      propertyIds: [], cta: input.cta ?? brand!.preferredCta ?? "", factSources: [],
    });
  }
  add("asset_hash", hasItem, canHash ? "ok" : (hasItem ? "fail" : "warn"), canHash ? `hash ${assetHash}` : hasItem ? "kan ikke beregne hash (mangler konto/media/brand)" : "AI-modus: hash beregnes i campaign-draft");

  const criticalFailures = checks.filter((c) => c.critical && c.status === "fail").map((c) => `${c.name}: ${c.detail}`);
  return {
    status: criticalFailures.length === 0 ? "READY_FOR_LIVE" : "NOT_READY",
    mode: input.mode === "live" ? "live" : "dry_run",
    checks,
    criticalFailures,
    assetHash,
    account,
  };
}
