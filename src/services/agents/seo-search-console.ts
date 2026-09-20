/**
 * Read-only Google Search Console integration for Sam SEO.
 *
 * This connector never reads CRM contacts, publishes changes or submits URLs
 * to Google. Only a separately consented webmasters.readonly OAuth grant is
 * eligible. An authorized GSC property is matched to one of the fixed public
 * portfolio hosts and every returned page is filtered to that host.
 */
import { SEO_AUDIT_TARGETS } from "./seo-audit";
import { getDecryptedTokens, saveTokens } from "@/lib/oauth/channels";
import { createServerClient } from "@/lib/supabase/server";
import { getGoogleCredentials } from "@/lib/oauth/providers";

export const GSC_READ_SCOPE = "https://www.googleapis.com/auth/webmasters.readonly";
export type GSCProperty = { siteUrl: string; permissionLevel: string };
export type GSCQueryRow = {
  query: string; page: string; clicks: number; impressions: number;
  ctr: number; position: number;
};
export type GSCBrandSnapshot = {
  brandId: string; connected: true; property: string; collectedAt: string;
  period: { currentStart: string; currentEnd: string; previousStart: string; previousEnd: string };
  metric: "Google Search Console web Search Analytics; grouped by canonical page";
  totals: { currentClicks: number; currentImpressions: number; previousClicks: number;
    previousImpressions: number; currentCtr: number | null; previousCtr: number | null };
  topPages: Array<{ path: string; clicks: number; impressions: number; ctr: number; position: number }>;
  topQueryPages: GSCQueryRow[];
  dataQuality: { truncated: boolean; queryRowsSampled: boolean; note: string };
};

export function targetForBrand(brandId: string) {
  return SEO_AUDIT_TARGETS.find(target => target.brandId === brandId) || null;
}

const FREDDY_DOMAIN_FAMILY = new Set(["freddyb", "freddypublishing", "freddyart", "remasterfreddy"]);

export function isFreddyFamilyDomainProperty(value: string) {
  return value.toLowerCase() === "sc-domain:freddybremseth.com";
}

function canInheritFreddyRootProperty(brandId: string, channel: GSCStoredChannel) {
  return brandId !== "freddyb" && FREDDY_DOMAIN_FAMILY.has(brandId) &&
    channel.brand_id === "freddyb" && isFreddyFamilyDomainProperty(channel.external_id);
}
function allowedHost(value: string, target: { base: string }) {
  try {
    const page = new URL(value);
    const canonical = new URL(target.base).hostname;
    if (!["http:", "https:"].includes(page.protocol) || page.username || page.password) return false;
    if (page.hostname === canonical) return true;
    return canonical.startsWith("www.") && page.hostname === canonical.slice(4);
  } catch { return false; }
}

export function selectGSCProperty(brandId: string, sites: readonly GSCProperty[]): string | null {
  const target = targetForBrand(brandId);
  if (!target) return null;
  const host = new URL(target.base).hostname.toLowerCase();
  const candidates: Array<{ siteUrl: string; priority: number }> = [];
  for (const site of sites) {
    if (!["siteOwner", "siteFullUser", "siteRestrictedUser"].includes(site.permissionLevel)) continue;
    if (site.siteUrl.startsWith("sc-domain:")) {
      const domain = site.siteUrl.slice("sc-domain:".length).toLowerCase();
      const allowedParents = host.endsWith(".freddybremseth.com") ? ["freddybremseth.com"] : [];
      if (domain === host || (host.startsWith("www.") && domain === host.slice(4))) {
        candidates.push({ siteUrl: site.siteUrl, priority: 2 });
      } else if (allowedParents.includes(domain)) {
        candidates.push({ siteUrl: site.siteUrl, priority: 3 });
      }
      continue;
    }
    try {
      const parsed = new URL(site.siteUrl);
      if (!["http:", "https:"].includes(parsed.protocol) || parsed.pathname !== "/" ||
          parsed.search || parsed.hash || parsed.port || parsed.username || parsed.password) continue;
      if (parsed.hostname === host) candidates.push({ siteUrl: site.siteUrl, priority: parsed.protocol === "https:" ? 0 : 4 });
      else if (host.startsWith("www.") && parsed.hostname === host.slice(4)) {
        candidates.push({ siteUrl: site.siteUrl, priority: parsed.protocol === "https:" ? 1 : 5 });
      }
    } catch { /* malformed Google site resource */ }
  }
  return candidates.sort((a, b) => a.priority - b.priority)[0]?.siteUrl || null;
}

export async function listGSCProperties(accessToken: string): Promise<GSCProperty[]> {
  const response = await fetch("https://www.googleapis.com/webmasters/v3/sites", {
    headers: { Authorization: "Bearer " + accessToken, Accept: "application/json" },
    cache: "no-store", signal: AbortSignal.timeout(9000),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as {
      error?: { status?: string; errors?: Array<{ reason?: string }> };
    };
    const reason = body.error?.errors?.[0]?.reason || body.error?.status || "unknown";
    const category = ["accessNotConfigured", "SERVICE_DISABLED", "API_DISABLED"].includes(reason)
      ? "API_DISABLED" : "GOOGLE_API_ERROR";
    throw new Error("Google Search Console property listing failed: HTTP " + response.status + " " + category);
  }
  const payload = await response.json() as { siteEntry?: GSCProperty[] };
  return Array.isArray(payload.siteEntry) ? payload.siteEntry : [];
}

type GSCStoredChannel = { id: string; brand_id: string; external_id: string };

/**
 * The OAuth callback and Sam dashboard must resolve the SAME saved rows.
 * The former saved all seven grants, while the old generic getChannelsByBrand()
 * returned [] for every brand without reporting its query error. Query the
 * active GSC channel set directly, fail closed on a PostgREST error, and scope
 * the in-memory result to the exact configured brand.
 *
 * Select only non-secret metadata here; encrypted tokens are loaded by id
 * separately after the property has been checked.
 */
export function selectStoredGSCBrandChannels(brandId: string, channels: readonly GSCStoredChannel[]): GSCStoredChannel[] {
  const exact = channels.filter(channel => channel.brand_id === brandId &&
    selectGSCProperty(brandId, [{ siteUrl: channel.external_id, permissionLevel: "siteOwner" }]) === channel.external_id);
  if (exact.length > 0) return exact;
  // A verified DNS Domain property covers its subdomains. Reuse the already
  // consented Freddy root-domain OAuth grant for books/art/remaster instead of
  // forcing duplicate Google authorizations. Page rows are still filtered to
  // the exact child host before any metrics are counted.
  return channels.filter(channel => canInheritFreddyRootProperty(brandId, channel) &&
    selectGSCProperty(brandId, [{ siteUrl: channel.external_id, permissionLevel: "siteOwner" }]) === channel.external_id);
}

async function getStoredGSCChannels(brandId: string): Promise<GSCStoredChannel[]> {
  if (!targetForBrand(brandId)) throw new Error("Unknown public SEO brand");
  const { data, error } = await createServerClient()
    .from("social_channels")
    .select("id,brand_id,external_id")
    .eq("platform", "google_search_console")
    .eq("is_active", true);
  if (error) {
    console.error("[SamSEO] GSC channel lookup failed", { brandId, code: error.code });
    throw new Error("Google channel database lookup failed: " + (error.code || "unknown"));
  }
  return selectStoredGSCBrandChannels(brandId, data || []);
}

export async function getGSCConnectionStatus() {
  return Promise.all(SEO_AUDIT_TARGETS.map(async target => {
    const domain = new URL(target.base).hostname;
    try {
      const channels = await getStoredGSCChannels(target.brandId);
      const valid = channels.filter(channel =>
        selectGSCProperty(target.brandId, [{ siteUrl: channel.external_id, permissionLevel: "siteOwner" }]) !== null);
      if (valid.length !== 1) return {
        brandId: target.brandId, domain, connected: false, property: null,
        temporary: false, expiresAt: null,
        error: valid.length > 1 ? "Flere aktive Google-eiendommer er registrert for samme merke." :
          channels.length === 0 ? "Ingen aktiv Google-tilkobling lagret for dette nettstedet." :
          "Den lagrede Search Console-eiendommen samsvarer ikke med nettstedet.",
      };
      // A registered channel alone is not proof of an OAuth grant. Do not
      // mark a brand connected when the read-only token is missing or unusable.
      const tokens = await getDecryptedTokens(valid[0].id);
      const hasScope = Boolean(tokens?.scopes.includes(GSC_READ_SCOPE));
      const canRead = Boolean(tokens?.accessToken) &&
        (!tokens?.expiresAt || tokens.expiresAt.getTime() > Date.now() + 90000 || Boolean(tokens.refreshToken));
      const connected = hasScope && canRead;
      return {
        brandId: target.brandId, domain, connected,
        property: connected ? valid[0].external_id : null,
        temporary: connected && !tokens?.refreshToken,
        expiresAt: tokens?.expiresAt?.toISOString() || null,
        error: connected ? null : "Search Console readonly OAuth authorization is missing or expired; reconnect Google",
      };
    } catch (cause) {
      // Never hide all seven brands behind the same anonymous disconnected
      // state: a storage/decryption issue is not a missing Google consent.
      const detail = cause instanceof Error ? cause.message : "";
      const error = /OAUTH_ENCRYPTION_KEY|authenticate data|auth tag|decrypt|bytea|key_id/i.test(detail)
        ? "RealtyFlow klarer ikke å lese den lagrede Google-nøkkelen. Kontroller OAuth-krypteringsnøkkel og dekryptering på serveren."
        : "RealtyFlow kunne ikke kontrollere den lagrede Google-tilkoblingen. Se serverloggene.";
      console.error("[SamSEO] GSC connection check failed", {
        brandId: target.brandId, category: error.startsWith("RealtyFlow klarer") ? "token_unreadable" : "connection_check_failed",
      });
      return { brandId: target.brandId, domain, connected: false, property: null,
        temporary: false, expiresAt: null, error };
    }
  }));
}

async function authorizedAccessToken(brandId: string) {
  const channels = await getStoredGSCChannels(brandId);
  if (channels.length === 0) return null;
  const valid = channels.filter(channel =>
    selectGSCProperty(brandId, [{ siteUrl: channel.external_id, permissionLevel: "siteOwner" }]) === channel.external_id);
  if (valid.length !== 1) {
    throw new Error("Search Console saved property is missing or ambiguous for the selected brand");
  }
  const channel = valid[0];
  const tokens = await getDecryptedTokens(channel.id);
  if (!tokens) throw new Error("Search Console channel exists, but its saved OAuth token is unavailable");
  if (!tokens.scopes.includes(GSC_READ_SCOPE)) {
    throw new Error("Search Console readonly scope missing: reconnect the selected Google account");
  }
  if (selectGSCProperty(brandId, [{ siteUrl: channel.external_id, permissionLevel: "siteOwner" }]) !== channel.external_id) {
    throw new Error("Connected Search Console property does not match approved brand");
  }
  if (tokens.expiresAt && tokens.expiresAt.getTime() > Date.now() + 90000) {
    return { property: channel.external_id, token: tokens.accessToken };
  }
  if (!tokens.refreshToken) throw new Error("Search Console token expired; reconnect Google account");
  const credentials = getGoogleCredentials();
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: credentials.clientId, client_secret: credentials.clientSecret,
      refresh_token: tokens.refreshToken, grant_type: "refresh_token",
    }), cache: "no-store", signal: AbortSignal.timeout(9000),
  });
  if (!response.ok) throw new Error("Google Search Console access needs reauthorization: HTTP " + response.status);
  const refreshed = await response.json() as { access_token?: string; expires_in?: number; refresh_token?: string; scope?: string };
  if (!refreshed.access_token) throw new Error("Search Console refresh returned no access token");
  const refreshedScopes = refreshed.scope ? refreshed.scope.split(" ") : tokens.scopes;
  if (!refreshedScopes.includes(GSC_READ_SCOPE)) throw new Error("Search Console readonly scope was revoked");
  await saveTokens({
    socialChannelId: channel.id,
    accessToken: refreshed.access_token,
    refreshToken: refreshed.refresh_token || tokens.refreshToken,
    expiresAt: new Date(Date.now() + Math.max(60, refreshed.expires_in || 3600) * 1000),
    scopes: refreshedScopes,
  });
  return { property: channel.external_id, token: refreshed.access_token };
}

type RawRow = { keys?: string[]; clicks?: number; impressions?: number; ctr?: number; position?: number };
async function getSearchAnalytics(
  property: string, token: string, startDate: string, endDate: string, dimensions: string[], limit: number,
): Promise<RawRow[]> {
  const response = await fetch(
    "https://www.googleapis.com/webmasters/v3/sites/" + encodeURIComponent(property) + "/searchAnalytics/query",
    {
      method: "POST",
      headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
      body: JSON.stringify({
        startDate, endDate, dimensions, type: "web", dataState: "final", rowLimit: limit,
      }),
      cache: "no-store", signal: AbortSignal.timeout(13000),
    },
  );
  if (!response.ok) throw new Error("Search Console Search Analytics query failed: HTTP " + response.status);
  const result = await response.json() as { rows?: RawRow[] };
  return Array.isArray(result.rows) ? result.rows : [];
}
function rounded(v: number) { return Math.round(v * 10000) / 10000; }
function periodDay(now: number, offsetDays: number) {
  // Safe finalized-data windows, ending three full days before today's UTC
  // date. Display the exact dates: Google Search Console uses Pacific dates.
  return new Date(now - offsetDays * 86400000).toISOString().slice(0, 10);
}
export export function sumPageRows(rows: RawRow[], target: { base: string }) {
  let clicks = 0, impressions = 0;
  for (const row of rows) {
    if (!row.keys?.[0] || !allowedHost(row.keys[0], target)) continue;
    clicks += Math.max(0, Number(row.clicks) || 0);
    impressions += Math.max(0, Number(row.impressions) || 0);
  }
  return { clicks, impressions, ctr: impressions > 0 ? rounded(clicks / impressions) : null };
}

/** Read-only, admin/cron only. Results are bounded and scoped to the exact brand. */
export async function getGSCBrandSnapshot(brandId: string): Promise<GSCBrandSnapshot | null> {
  const target = targetForBrand(brandId);
  if (!target) throw new Error("Unknown public SEO brand");
  const access = await authorizedAccessToken(brandId);
  if (!access) return null;
  return getGSCBrandSnapshotForAccess(brandId, target, access);
}

/** A URL-prefix homepage grant must never be reused to read sister hosts. */
export function isFreddyFamilyDomainProperty(property: string): boolean {
  return property === "sc-domain:freddybremseth.com";
}

async function getGSCBrandSnapshotForAccess(
  brandId: string, target: { base: string }, access: { property: string; token: string },
): Promise<GSCBrandSnapshot> {
  const now = Date.now();
  const currentEnd = periodDay(now, 3);
  const currentStart = periodDay(now, 32);
  const previousEnd = periodDay(now, 33);
  const previousStart = periodDay(now, 62);
  const [currentPages, previousPages, queryPages] = await Promise.all([
    getSearchAnalytics(access.property, access.token, currentStart, currentEnd, ["page"], 5000),
    getSearchAnalytics(access.property, access.token, previousStart, previousEnd, ["page"], 5000),
    getSearchAnalytics(access.property, access.token, currentStart, currentEnd, ["query", "page"], 2000),
  ]);
  const current = sumPageRows(currentPages, target);
  const previous = sumPageRows(previousPages, target);
  const topPages = currentPages.filter(row => row.keys?.[0] && allowedHost(row.keys[0], target))
    .sort((a,b) => (b.clicks || 0) - (a.clicks || 0)).slice(0, 25)
    .map(row => ({
      path: new URL(row.keys![0]).pathname,
      clicks: Math.max(0, Number(row.clicks) || 0),
      impressions: Math.max(0, Number(row.impressions) || 0),
      ctr: rounded(Number(row.ctr) || 0),
      position: rounded(Number(row.position) || 0),
    }));
  const topQueryPages = queryPages.filter(row =>
    row.keys?.length === 2 && allowedHost(row.keys[1], target) &&
    row.keys[0].length <= 150 && !/[\r\n@]/.test(row.keys[0]))
    .sort((a,b) => (b.impressions || 0) - (a.impressions || 0)).slice(0, 30)
    .map(row => ({
      query: row.keys![0], page: new URL(row.keys![1]).pathname,
      clicks: Math.max(0, Number(row.clicks) || 0),
      impressions: Math.max(0, Number(row.impressions) || 0),
      ctr: rounded(Number(row.ctr) || 0), position: rounded(Number(row.position) || 0),
    }));
  const truncated = currentPages.length >= 5000 || previousPages.length >= 5000;
  return {
    brandId, connected: true, property: access.property, collectedAt: new Date(now).toISOString(),
    period: { currentStart, currentEnd, previousStart, previousEnd },
    metric: "Google Search Console web Search Analytics; grouped by canonical page",
    totals: {
      currentClicks: current.clicks, currentImpressions: current.impressions,
      previousClicks: previous.clicks, previousImpressions: previous.impressions,
      currentCtr: current.ctr, previousCtr: previous.ctr,
    },
    topPages, topQueryPages,
    dataQuality: {
      truncated, queryRowsSampled: true,
      note: "Clicks/impressions are Google Search Console web performance for returned canonical pages on this brand, not onsite sessions, submitted leads, or full query inventory. Search Console may omit anonymized and low-frequency queries. "
        + (truncated ? "Page row cap reached; totals are incomplete. " : "")
        + "Date windows use calendar dates and exclude the newest three days. Search Console uses Pacific dates.",
    },
  };
}

/** Separate art metrics from the already-authorized Freddy domain property.
 * Do not count derived art access as an eighth OAuth authorization. */
export async function getGSCFreddyArtSnapshot(): Promise<GSCBrandSnapshot | null> {
  const access = await authorizedAccessToken("freddyb");
  if (!access || !isFreddyFamilyDomainProperty(access.property)) return null;
  const snapshot = await getGSCBrandSnapshotForAccess(
    "freddyart", { base: "https://art.freddybremseth.com" }, access,
  );
  snapshot.dataQuality.note += " Art-host figures were read from the verified parent Domain property, not a separate OAuth connection.";
  return snapshot;
}

export async function readGSCAllBrands() {
  const core = await Promise.all(SEO_AUDIT_TARGETS.map(async target => {
    try {
      const result = await getGSCBrandSnapshot(target.brandId);
      return { brandId: target.brandId, status: result ? "connected" as const : "not_connected" as const, result };
    } catch (error) {
      return { brandId: target.brandId, status: "error" as const, result: null,
        error: error instanceof Error ? error.message.slice(0, 200) : "Google Search Console unavailable" };
    }
  }));
  // A single root OAuth grant may cover art only when its property is the
  // exact Freddy parent Domain property, never a root URL-prefix property.
  // Read after the seven originals to avoid competing OAuth refresh writes.
  let art: { brandId: string; status: "connected" | "not_connected" | "error";
    result: GSCBrandSnapshot | null; error?: string };
  try {
    const result = await getGSCFreddyArtSnapshot();
    art = { brandId: "freddyart", status: result ? "connected" : "not_connected", result };
  } catch (error) {
    art = { brandId: "freddyart", status: "error", result: null,
      error: error instanceof Error ? error.message.slice(0, 200) : "Freddy art GSC unavailable" };
  }
  return [...core, art];
}
