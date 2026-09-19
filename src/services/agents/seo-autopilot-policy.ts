/**
 * Sam's pre-approved SEO pilot has two separate permissions:
 * (1) unattended observation/analysis and (2) narrowly scoped, reversible edits
 * through a VERIFIED owner-controlled publisher. GSC provides evidence, not
 * write access. Never infer that a CMS webhook or static GitHub page is editable
 * simply because Search Console can read it.
 */
import type { GSCBrandSnapshot } from "./seo-search-console";

export const SEO_AUTOPILOT_BRANDS = ["zeneco", "freddyb"] as const;
export type SeoPilotBrand = typeof SEO_AUTOPILOT_BRANDS[number];
export type SeoPilotDisposition = "monitor" | "candidate" | "human_review" | "blocked";
export type SeoPilotAssessment = {
  brandId: string;
  status: SeoPilotDisposition;
  page: string | null;
  currentImpressions: number | null;
  currentClicks: number | null;
  note: string;
  evidence: string | null;
  publicChangePermitted: false;
};

const PILOT_BRANDS = new Set<string>(SEO_AUTOPILOT_BRANDS);
const ELIGIBLE_QUERY_IMPRESSIONS = 40;
const ELIGIBLE_PAGE_IMPRESSIONS = 100;

export function evaluateSeoPilotBrand(
  brandId: string,
  snapshot: GSCBrandSnapshot | null,
  error?: string,
): SeoPilotAssessment {
  const evidence = snapshot
    ? [snapshot.property, snapshot.period.currentStart, snapshot.period.currentEnd].join(" · ")
    : null;
  const base = {
    brandId, page: null, currentImpressions: snapshot?.totals.currentImpressions ?? null,
    currentClicks: snapshot?.totals.currentClicks ?? null, evidence,
    publicChangePermitted: false as const,
  };
  if (!PILOT_BRANDS.has(brandId)) return {
    ...base, status: "monitor", note: "Utenfor den godkjente pilotens to nettsteder; bare måling.",
  };
  if (!snapshot) return {
    ...base, status: "blocked",
    note: "Ingen verifisert Google-lesing: " + (error || "tilkobling eller data utilgjengelig").slice(0, 140),
  };
  if (snapshot.dataQuality.truncated) return {
    ...base, status: "blocked", note: "Google-resultatet er avkortet; ingen endring på ufullstendige tall.",
  };
  if (snapshot.totals.currentImpressions === 0) return {
    ...base, status: "monitor",
    note: "0 målte Google-visninger. Kontroller indeksering og målegrunnlag; ikke omskriv sider basert på null observasjoner.",
  };
  // A measured query/page signal warrants investigation; it does not authorize
  // rewriting a static route, price/availability claim, customer information,
  // schema, or a page with unknown ownership. The publisher must independently
  // verify exact page ownership, old revision, narrow fields and rollback.
  const signal = snapshot.topQueryPages.find(row =>
    row.impressions >= ELIGIBLE_QUERY_IMPRESSIONS &&
    row.position >= 4 && row.position <= 20 && row.ctr < 0.03 &&
    snapshot.topPages.some(page => page.path === row.page &&
      page.impressions >= ELIGIBLE_PAGE_IMPRESSIONS));
  if (!signal) return {
    ...base, status: "monitor",
    note: "Ikke tilstrekkelig dokumentert søkesignal for automatisk innholdsendring i denne perioden.",
  };
  return {
    ...base, status: "candidate", page: signal.page,
    note: "Målt mulighet. Neste trinn: verifiser eksakt publiseringskilde, faktagrunnlag, gammel versjon, trygg endringsflate og tilbakeføring. Ingen publisering fra målesyklusen.",
  };
}

export function seoPublicWriteAllowed(input: {
  brandId: string;
  ownedPageVerified: boolean;
  publisherVerified: boolean;
  reversibleRevisionRecorded: boolean;
  contentScope: "meta_description" | "meta_title" | "internal_link" | "body" | "price" | "other";
  sourceMatchedExactly: boolean;
  hasFactualClaims: boolean;
}): boolean {
  return PILOT_BRANDS.has(input.brandId) &&
    input.ownedPageVerified && input.publisherVerified &&
    input.reversibleRevisionRecorded && input.sourceMatchedExactly &&
    !input.hasFactualClaims &&
    ["meta_description", "meta_title", "internal_link"].includes(input.contentScope);
}
