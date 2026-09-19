import type { GSCBrandSnapshot } from "./seo-search-console";

/**
 * Strictly approved, fixed-text SEO experiment variants for existing Zen Eco
 * Homes Norwegian landing pages. Untrusted Google query text can select only
 * a pre-reviewed variant; it never becomes public copy or a writable URL.
 */
export const ZENECO_METADATA_VARIANTS = [
  {
    path: "/bolig-i-spania", query: "bolig i spania",
    title: "Bolig i Spania | Finn riktig område med norsk rådgiver",
    description: "Vurderer du bolig i Spania? Utforsk områder på Costa Blanca og få hjelp til å sammenligne nybygg, villaer og leiligheter, finansiering og kjøpsprosess.",
  },
  {
    path: "/nybygg-i-spania", query: "nybygg i spania",
    title: "Nybygg i Spania | Se boliger og få norsk rådgivning",
    description: "Utforsk nybygg i Spania med norsk rådgivning. Sammenlign områder, utbyggere, standard, betalingsplaner og boliger før du reserverer nytt hjem.",
  },
  {
    path: "/nybygg-costa-blanca", query: "nybygg costa blanca",
    title: "Nybygg Costa Blanca | Finn prosjekter og boliger i Spania",
    description: "Utforsk nybygg på Costa Blanca og sammenlign områder, priser, villaer og leiligheter. Få norsk rådgivning om prosjekter og kjøpsprosessen i Spania.",
  },
  {
    path: "/eiendomsradgiver-spania", query: "eiendomsradgiver spania",
    title: "Eiendomsrådgiver Spania | Norsk hjelp ved boligkjøp",
    description: "Få norsk rådgivning om boligkjøp i Spania. Sammenlign områder, boliger, nybygg og tomter på Costa Blanca, og forstå finansiering og kjøpsprosess.",
  },
] as const;

export type ZenEcoMetadataCandidate = {
  brandId: "zeneco"; path: string; query: string; title: string; description: string;
  baseline: { start: string; end: string; impressions: number; clicks: number; position: number };
};

export function zenEcoReadinessValid(
  value: unknown, expectedDbHost: string,
): boolean {
  if (!value || typeof value !== "object") return false;
  const result = value as Record<string, unknown>;
  return result.service === "zeneco-metadata-v1" &&
    result.databaseReadable === true &&
    typeof result.dbHost === "string" &&
    result.dbHost === expectedDbHost;
}

export function selectZenEcoMetadataCandidate(
  snapshot: GSCBrandSnapshot | null,
  now = new Date(),
): ZenEcoMetadataCandidate | null {
  if (!snapshot || snapshot.brandId !== "zeneco" || snapshot.dataQuality.truncated ||
      snapshot.dataQuality.queryRowsSampled === false ||
      !["https://www.zenecohomes.com/", "sc-domain:zenecohomes.com"].includes(snapshot.property)) return null;
  const collected = Date.parse(snapshot.collectedAt);
  const periodEnd = Date.parse(snapshot.period.currentEnd + "T23:59:59Z");
  if (!Number.isFinite(collected) || !Number.isFinite(periodEnd) ||
      collected > now.getTime() + 60000 ||
      now.getTime() - collected > 7 * 86400000 ||
      now.getTime() - periodEnd > 10 * 86400000 ||
      snapshot.totals.currentImpressions < 100) return null;
  for (const variant of ZENECO_METADATA_VARIANTS) {
    const page = snapshot.topPages.find(row => row.path === variant.path && row.impressions >= 100);
    const query = snapshot.topQueryPages.find(row =>
      row.page === variant.path &&
      row.query.trim().toLocaleLowerCase("nb-NO") === variant.query &&
      row.impressions >= 40 && row.clicks >= 0 &&
      row.position >= 4 && row.position <= 20 && row.ctr >= 0 && row.ctr < 0.03);
    if (!page || !query) continue;
    return {
      brandId: "zeneco", path: variant.path, query: variant.query,
      title: variant.title, description: variant.description,
      baseline: {
        start: snapshot.period.currentStart, end: snapshot.period.currentEnd,
        impressions: query.impressions, clicks: query.clicks, position: query.position,
      },
    };
  }
  return null;
}
