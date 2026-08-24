/** Phase 7.1E — First Live Campaign Canary preflight. */
import { approvedAssetHash, contentPublishabilityGate } from "@/lib/marketing/autonomous";
import { loadBrandContext } from "@/services/marketing/brand-brain-adapter";
import { resolvePublishingAccount, type ResolvedAccount } from "@/services/marketing/account-resolver";
import { resolveInventoryMarketingProperty, type InventoryMarketingProperty } from "@/services/marketing/inventory-property-adapter";
import type { MarketingSupabaseLike } from "@/services/marketing/adapters";

export interface PreflightInput {
  brandId: string;
  service?: string;
  channel: string;
  mode?: "dry_run" | "live";
  market?: string;
  language?: string;
  publishingAccountId?: string;
  contentHubItemId?: string;
  mediaUrl?: string;
  cta?: string;
  aiMode?: boolean;
  /** Property-driven AI uses RealtyFlow Inventory as source of media + facts. */
  useInventoryProperty?: boolean;
  propertyId?: string;
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
  approvalConfigured: boolean;
}

export type CheckStatus = "ok" | "warn" | "fail";
export interface PreflightCheck { name: string; critical: boolean; status: CheckStatus; detail: string; }

export interface PreflightResult {
  status: "READY_FOR_LIVE" | "NOT_READY";
  mode: "dry_run" | "live";
  checks: PreflightCheck[];
  criticalFailures: string[];
  assetHash?: string;
  account?: ResolvedAccount;
  inventoryProperty?: { id: string; ref: string | null; title: string; imageUrl: string; factSourceCount: number };
}

const isHttps = (u?: string | null) => typeof u === "string" && /^https:\/\//i.test(u);

export async function preflightLiveCampaign(deps: PreflightDeps, input: PreflightInput): Promise<PreflightResult> {
  const supabase = deps.supabase;
  const checks: PreflightCheck[] = [];
  const add = (name: string, critical: boolean, status: CheckStatus, detail: string) => checks.push({ name, critical, status, detail });
  const liveMode = input.mode === "live";

  add("kill_switch", true, deps.env.autopilotEnabled ? "ok" : "fail", deps.env.autopilotEnabled ? "MARKETING_AUTOPILOT_ENABLED på" : "Kill switch AV — ingen publisering mulig");

  const brand = await loadBrandContext(supabase, input.brandId).catch(() => null);
  add("brand_context", true, brand ? "ok" : "fail", brand ? `brand «${brand.brandName}»` : `MISSING_BRAND_CONTEXT for «${input.brandId}»`);

  add("service", false, input.service ? "ok" : "warn", input.service ? `service «${input.service}»` : "ingen service angitt (kan gi tvetydig routing ved flere kontoer)");

  const hasItem = !!input.contentHubItemId && !input.aiMode;
  const isSocialPost = hasItem && input.contentHubItemId!.startsWith("social_post:");
  let itemMediaUrl: string | null = null;
  let itemText = "";

  if (hasItem) {
    add("content_hub_org", isSocialPost, brand?.contentHubOrgId ? "ok" : (isSocialPost ? "fail" : "warn"), brand?.contentHubOrgId ? `content_hub_org_id «${brand.contentHubOrgId}»` : "brand_context.content_hub_org_id mangler");
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
  }

  // Property-driven AI: the authoritative content source is RealtyFlow Inventory.
  let inventoryProperty: InventoryMarketingProperty | null = null;
  if (input.aiMode && input.useInventoryProperty) {
    try {
      inventoryProperty = await resolveInventoryMarketingProperty(supabase, { brandId: input.brandId, propertyId: input.propertyId ?? null });
      add("inventory_property", true, "ok", `ref ${inventoryProperty.ref ?? "—"} · ${inventoryProperty.title} · ${inventoryProperty.factSources.length} verifiserte fakta`);
      add("content_source", true, "ok", `RealtyFlow Inventory property:${inventoryProperty.id}`);
    } catch (e) {
      add("inventory_property", true, "fail", e instanceof Error ? e.message : "Inventory-resolusjon feilet");
      add("content_source", true, "fail", "AI property-mode krever en synlig, tilgjengelig RealtyFlow-bolig");
    }
  } else if (!hasItem) {
    add("content_source", false, "warn", "AI-modus uten Inventory-property: innhold genereres i campaign-draft.");
  }

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

  const mediaUrl = inventoryProperty?.primaryImage ?? input.mediaUrl ?? itemMediaUrl;
  const igNeedsMedia = input.channel === "instagram";
  const mediaOk = isHttps(mediaUrl);
  const mediaCritical = igNeedsMedia && (hasItem || liveMode);
  add("media_url", mediaCritical, mediaOk ? "ok" : (mediaCritical ? "fail" : "warn"),
    mediaOk
      ? `media OK (${mediaUrl})${inventoryProperty ? " · hentet fra RealtyFlow Inventory" : ""}`
      : mediaUrl
        ? "MEDIA_ASSET_INVALID: ikke public HTTPS-URL"
        : mediaCritical
          ? "MEDIA_ASSET_MISSING: live Instagram krever public HTTPS image/video URL"
          : "AI dry-run: media kan utelates");

  add("approval_service", true, deps.approvalConfigured ? "ok" : "fail", deps.approvalConfigured ? "General Approval Gateway koblet" : "APPROVAL_SERVICE_UNAVAILABLE");

  const metaReady = deps.env.metaLive && !!deps.env.metaToken && (!!deps.env.igUserId || !!deps.env.pageId);
  add("meta_credentials", liveMode, metaReady ? "ok" : (liveMode ? "fail" : "warn"),
    metaReady ? "MARKETING_META_LIVE + token + konto satt"
      : liveMode ? "META_CREDENTIALS_MISSING: live-modus krever MARKETING_META_LIVE + META_ACCESS_TOKEN + konto"
        : "ikke live — kjører dry-run");

  const canHash = hasItem && !!account && mediaOk && !!brand;
  let assetHash: string | undefined;
  if (canHash) {
    assetHash = approvedAssetHash({
      sourceContentId: input.contentHubItemId!,
      finalCopy: itemText,
      finalMedia: JSON.stringify({ imageUrl: mediaUrl }),
      brandId: input.brandId,
      accountId: account!.accountId,
      channel: input.channel,
      propertyIds: [],
      cta: input.cta ?? brand!.preferredCta ?? "",
      factSources: [],
    });
  }
  add("asset_hash", hasItem, canHash ? "ok" : (hasItem ? "fail" : "warn"), canHash ? `hash ${assetHash}` : hasItem ? "kan ikke beregne hash" : "AI-modus: hash beregnes etter Inventory-grounded generation");

  const criticalFailures = checks.filter((c) => c.critical && c.status === "fail").map((c) => `${c.name}: ${c.detail}`);
  return {
    status: criticalFailures.length === 0 ? "READY_FOR_LIVE" : "NOT_READY",
    mode: liveMode ? "live" : "dry_run",
    checks,
    criticalFailures,
    assetHash,
    account,
    inventoryProperty: inventoryProperty ? {
      id: inventoryProperty.id,
      ref: inventoryProperty.ref,
      title: inventoryProperty.title,
      imageUrl: inventoryProperty.primaryImage,
      factSourceCount: inventoryProperty.factSources.length,
    } : undefined,
  };
}
