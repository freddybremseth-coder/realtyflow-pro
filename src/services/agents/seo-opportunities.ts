import type { SiteAudit } from "./seo-audit";
import type { SEOLeadSummary } from "./seo-leads";
import type { getSEOObservedSignals } from "./seo-data";

type Signals = Awaited<ReturnType<typeof getSEOObservedSignals>>;
export type SEOReviewOpportunity = {
  issueId: string; brandId: string | null; title: string; description: string;
  priority: "HIGH" | "MEDIUM"; nextAction: string; evidence: string;
};

/** Deterministic, limited recommendations; no AI can author executable commands here. */
export function planSEOOpportunities(
  signals: Signals, leads: SEOLeadSummary, audits: SiteAudit[],
): SEOReviewOpportunity[] {
  const results: SEOReviewOpportunity[] = [];
  const current = signals.totals.current;
  if (current === 0 || signals.dataQuality.truncated) {
    results.push({
      issueId: "portfolio-referrer-instrumentation",
      brandId: null,
      title: "Sam SEO: Verifiser målbar søke- og AI-trafikk for porteføljen",
      description: current === 0
        ? "Ingen sentrale søke-/AI-henvisningshendelser registrert de siste 30 dagene. Dette er ikke bevis for null faktisk trafikk."
        : "Målingen er avkortet ved 10 000 hendelser og må pagineres før resultater brukes.",
      priority: "HIGH",
      nextAction: "Kontroller trackers, ekte hendelser, korrekt domain/brand_id, CORS, endpoint-svar og datakvalitet. Dokumenter en reell henvisning og mottatt databasehendelse. Koble deretter verifiserte søkeorddata fra Google Search Console/Bing.",
      evidence: "RealtyFlow search_discovery_events last 30 days; first-party referral arrivals only.",
    });
  }
  for (const brand of leads.byBrand) {
    if (brand.withoutPage > 0) {
      results.push({
        issueId: "source-page-attribution:" + brand.brandId,
        brandId: brand.brandId,
        title: "Sam SEO: Bevar kildesiden for nettsidehenvendelser (" + brand.brandId + ")",
        description: brand.withoutPage + " av " + brand.current + " målte website_lead-henvendelser siste 30 dager mangler dokumentert kildeside.",
        priority: "HIGH",
        nextAction: "Legg til faktisk offentlig page_url i skjemaets sendeflyt, bevar den i CRM-work-item og mål de neste reelle henvendelsene. Ikke påstå organisk lead-attribusjon uten separat kildemåling.",
        evidence: "Privacy-minimal website_lead work items, source page coverage, last 30 days.",
      });
    }
  }
  // Flag only explicit block signals. The scoped audit is not a full crawl.
  for (const audit of audits) {
    if (audit.robots.googlebotBlocked === true ||
        /\bnoindex\b/i.test([audit.home.robotsMeta, audit.home.xRobots].join(" "))) {
      results.push({
        issueId: "explicit-index-block:" + audit.brandId,
        brandId: audit.brandId,
        title: "Sam SEO: Undersøk eksplisitt crawler-/indekseringsblokk på " + audit.brandId,
        description: "Avgrenset HTTP-kontroll fant " + [
          audit.robots.googlebotBlocked ? "site-wide robots.txt Disallow: /" : "",
          /\bnoindex\b/i.test([audit.home.robotsMeta, audit.home.xRobots].join(" ")) ? "homepage noindex" : "",
        ].filter(Boolean).join(" og ") + ".",
        priority: "HIGH",
        nextAction: "Bekreft på live canonical domene, avgjør om blokkeringen er tilsiktet, og opprett separat godkjent kode-/konfigurasjonsendring dersom feil. Re-test etter deploy.",
        evidence: audit.base + " public homepage/robots snapshot " + audit.checkedAt,
      });
    }
  }
  // Prioritize verified HTTP 404/noindex signals on a limited public sitemap
  // sample. A one-off failure is a review trigger, not proof of Google index
  // coverage or that the content should be removed.
  for (const audit of audits) {
    for (const sample of audit.samples || []) {
      if (sample.status !== 404 && sample.noindex !== true) continue;
      const reason = sample.status === 404 ? "HTTP 404" : "noindex";
      results.push({
        issueId: "sitemap-sampled-issue:" + audit.brandId + ":" + sample.path,
        brandId: audit.brandId,
        title: "Sam SEO: Undersøk " + reason + " på offentlig sitemap-side",
        description: "Sitemap-kontrollen på " + audit.brandId + " fant " + reason +
          " for " + sample.path + ". Dette er en prøve av maksimalt tre sider, ikke full indekseringskontroll.",
        priority: "HIGH",
        nextAction: "Bekreft feilen ved ny offentlig HTTP-kontroll, sammenlign sitemap og tilsiktet canonical/tilgjengelighet. Dersom dette er en faktisk feil, lag separat kodeendring til godkjenning og test på nytt etter deploy.",
        evidence: audit.base + sample.path + " · offentlig sitemap-sample " + audit.checkedAt +
          " · " + reason,
      });
    }
  }
  if (!signals.dataQuality.truncated && !leads.dataQuality.truncated) {
    const leadsByBrand = new Map(leads.byBrand.map(b => [b.brandId, b.current]));
    for (const brand of signals.byBrand) {
      if (brand.current >= 25 && (leadsByBrand.get(brand.brandId) ?? 0) === 0) {
        results.push({
          issueId: "evaluate-lead-journey:" + brand.brandId,
          brandId: brand.brandId,
          title: "Sam SEO: Undersøk kontaktreisen på " + brand.brandId,
          description: brand.current + " registrerte søke-/AI-henvisningsankomster, men ingen website_lead-work-items i samme 30-dagers vindu. Kildene er ikke koblet per besøk/session, og andre henvendelseskanaler kan mangle.",
          priority: "MEDIUM",
          nextAction: "Kontroller de mest besøkte sidene, at CTA og skjema fungerer på mobil, mål fullførte henvendelser og test en faktabasert forbedring med godkjenning.",
          evidence: "Independent portfolio referral and website_lead work-item aggregates, no individual attribution.",
        });
      }
    }
  }
  return results.slice(0, 5);
}
