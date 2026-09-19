/**
 * Read-only Google Search Console integration for Sam SEO.
 *
 * This connector never reads CRM contacts, publishes changes or submits URLs
 * to Google. Only a separately consented webmasters.readonly OAuth grant is
 * eligible. An authorized GSC property is matched to one of the fixed public
 * portfolio hosts and every returned page is filtered to that host.
 */
import { SEO_AUDIT_TARGETS } from "./seo-audit";
import { getChannelsByBrand, getDecryptedTokens, getTokensForBrandPlatform, saveTokens } from "@/lib/oauth/channels";
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
  if (!response.ok) throw new Error("Google Search Console property listing failed: HTTP " + response.status);
  const payload = await response.json() as { siteEntry?: GSCProperty[] };
  return Array.isArray(payload.siteEntry) ? payload.siteEntry : [];
}

export async function getGSCConnectionStatus() {
  return Promise.all(SEO_AUDIT_TARGETS.map(async target => {
    const domain = new URL(target.base).hostname;
    try {
      const channels = await getChannelsByBrand(target.brandId, "google_search_console");
      const valid = channels.filter(channel =>
        selectGSCProperty(target.brandId, [{ siteUrl: channel.external_id, permissionLevel: "siteOwner" }]) !== null);
      if (valid.length !== 1) return {
        brandId: target.brandId, domain, connected: false, property: null,
        error: valid.length > 1 ? "Multiple Search Console connections need reauthorization" : null,
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
        error: connected ? null : "Search Console readonly OAuth authorization is missing or expired; reconnect Google",
      };
    } catch {
      return { brandId: target.brandId, domain, connected: false, property: null,
        error: "Google Search Console connection needs inspection or reauthorization" };
    }
  }));
}

async function authorizedAccessToken(brandId: string) {
  const connection = await getTokensForBrandPlatform(brandId, "google_search_console");
  if (!connection) return null;
  const { channel, tokens } = connection;
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
function sumPageRows(rows: RawRow[], target: { base: string }) {
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

export async function readGSCAllBrands() {
  return Promise.all(SEO_AUDIT_TARGETS.map(async target => {
    try {
      const result = await getGSCBrandSnapshot(target.brandId);
      return { brandId: target.brandId, status: result ? "connected" as const : "not_connected" as const, result };
    } catch (error) {
      return { brandId: target.brandId, status: "error" as const, result: null,
        error: error instanceof Error ? error.message.slice(0, 200) : "Google Search Console unavailable" };
    }
  }));
}
