/**
 * Marketing Growth OS — Phase 3: Unified Analytics.
 *
 * Hver plattform rapporterer metrics i sitt eget format. Her normaliseres alt
 * til den felles ContentMetrics-modellen, slik at Business Value Score og
 * Learning-motoren kan sammenligne på tvers av IG/FB/LinkedIn/YouTube/web.
 *
 * Plattform-metrics (views/saves/shares/clicks) kommer herfra; forretnings-
 * metrics (leads/qualified/viewings/sales) kommer fra attribution (Phase 4) og
 * flettes inn med mergeMetrics. website-skjemainnsendinger regnes som leads.
 */

import type { MarketingChannel } from "./genome";
import type { ContentMetrics } from "./value-score";

type Raw = Record<string, unknown>;

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/** Første tilstedeværende numeriske felt blant kandidat-nøklene. */
function pick(raw: Raw, keys: string[]): number {
  for (const k of keys) {
    if (raw[k] != null && Number.isFinite(Number(raw[k]))) return Number(raw[k]);
  }
  return 0;
}

export function normalizeInstagram(raw: Raw): ContentMetrics {
  return {
    views: pick(raw, ["views", "plays", "video_views", "reach", "impressions"]),
    engagedViews: pick(raw, ["engaged_views", "engagedViews"]),
    saves: pick(raw, ["saved", "saves"]),
    shares: pick(raw, ["shares", "reshares"]),
    clicks: pick(raw, ["website_clicks", "link_clicks", "clicks", "profile_visits"]),
  };
}

export function normalizeFacebook(raw: Raw): ContentMetrics {
  return {
    views: pick(raw, ["video_views", "impressions", "reach", "views"]),
    engagedViews: pick(raw, ["video_views_10s", "engaged_views"]),
    saves: pick(raw, ["saves"]),
    shares: pick(raw, ["shares", "reshares"]),
    clicks: pick(raw, ["post_clicks", "link_clicks", "clicks"]),
  };
}

export function normalizeLinkedin(raw: Raw): ContentMetrics {
  return {
    views: pick(raw, ["impressions", "impressionCount", "unique_impressions", "views"]),
    engagedViews: pick(raw, ["engagement", "engaged_views"]),
    shares: pick(raw, ["shares", "shareCount", "reshares"]),
    clicks: pick(raw, ["clicks", "clickCount", "landingPageClicks"]),
  };
}

export function normalizeYoutube(raw: Raw): ContentMetrics {
  return {
    views: pick(raw, ["views"]),
    engagedViews: pick(raw, ["engagedViews", "engaged_views"]),
    shares: pick(raw, ["shares"]),
    clicks: pick(raw, ["cardClicks", "annotationClicks", "clicks"]),
  };
}

export function normalizeWebsite(raw: Raw): ContentMetrics {
  return {
    views: pick(raw, ["pageviews", "page_views", "sessions", "views"]),
    clicks: pick(raw, ["cta_clicks", "ctaClicks", "clicks"]),
    // Skjemainnsendinger på nettsiden er reelle leads.
    leads: pick(raw, ["form_submissions", "formSubmissions", "leads"]),
  };
}

export function normalizeGeneric(raw: Raw): ContentMetrics {
  return {
    views: pick(raw, ["views", "impressions", "reach"]),
    saves: pick(raw, ["saves", "saved"]),
    shares: pick(raw, ["shares"]),
    clicks: pick(raw, ["clicks"]),
    leads: pick(raw, ["leads"]),
  };
}

export function normalizeChannelMetrics(channel: MarketingChannel | string, raw: Raw): ContentMetrics {
  switch (channel) {
    case "instagram":
      return normalizeInstagram(raw);
    case "facebook":
      return normalizeFacebook(raw);
    case "linkedin":
      return normalizeLinkedin(raw);
    case "youtube":
    case "youtube_shorts":
      return normalizeYoutube(raw);
    case "website":
      return normalizeWebsite(raw);
    default:
      return normalizeGeneric(raw);
  }
}

const METRIC_KEYS: (keyof ContentMetrics)[] = [
  "views", "engagedViews", "saves", "shares", "clicks",
  "leads", "qualifiedLeads", "viewings", "offers", "sales", "commissionEur",
];

/** Flett flere metrics-deler (plattform + attribution) ved å summere feltene. */
export function mergeMetrics(...parts: Array<Partial<ContentMetrics> | null | undefined>): ContentMetrics {
  const out = {} as ContentMetrics;
  for (const key of METRIC_KEYS) {
    const sum = parts.reduce((s, p) => s + num(p?.[key]), 0);
    if (sum !== 0) out[key] = sum;
  }
  return out;
}
