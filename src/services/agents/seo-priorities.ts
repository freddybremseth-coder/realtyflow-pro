import type { GSCBrandSnapshot } from "./seo-search-console";
import type { SEOReviewOpportunity } from "./seo-opportunities";

/** Review-only hypotheses based on observed GSC web metrics, not guaranteed ranking outcomes. */
export function planGSCOpportunities(snapshots: readonly GSCBrandSnapshot[]): SEOReviewOpportunity[] {
  const proposals: SEOReviewOpportunity[] = [];
  for (const snapshot of snapshots) {
    const { brandId, totals, period } = snapshot;
    const evidencePeriod = "Google Search Console · " + snapshot.property + " · " + period.currentStart + "–" + period.currentEnd;
    if (snapshot.dataQuality.truncated) {
      proposals.push({
        issueId: "gsc-pagination:" + brandId, brandId, priority: "HIGH",
        title: "Sam SEO: Gå gjennom avkortet Search Console-uttrekk",
        description: "Google returnerte maksimalantallet sider for " + brandId + "; målt sum er ikke komplett.",
        nextAction: "Hent data med paginering og segmentering før du prioriterer endringer eller beregner vekst.",
        evidence: evidencePeriod,
      });
      continue;
    }
    if (totals.previousImpressions >= 100 && totals.currentImpressions < totals.previousImpressions * 0.7) {
      proposals.push({
        issueId: "gsc-impressions-review:" + brandId, brandId, priority: "HIGH",
        title: "Sam SEO: Undersøk endring i søkevisninger for " + brandId,
        description: "Målte visninger: " + totals.currentImpressions + " mot " + totals.previousImpressions +
          " i forrige sammenlignbare 30-dagersperiode. Dette beviser ikke en bestemt årsak.",
        nextAction: "Sammenlign søkefraser, landingssider, sesong, indeksering og faktiske henvendelser. Dokumenter hypotesen før endring.",
        evidence: evidencePeriod,
      });
    }
    if (totals.currentImpressions === 0) {
      proposals.push({
        issueId: "gsc-zero-visibility:" + brandId, brandId, priority: "MEDIUM",
        title: "Sam SEO: Undersøk søkeytelse for " + brandId,
        description: "Ingen Google web-visninger ble returnert for målte sider i perioden. Det er ikke bevis for at nettstedet er uindeksert.",
        nextAction: "Sjekk valgt Search Console-eiendom, datofilter, sitemap, indeksering og om dette domenet faktisk er ment å ha søketrafikk.",
        evidence: evidencePeriod,
      });
      continue;
    }
    // One review per brand and category avoids creating a flood of near-duplicate tasks.
    const snippet = snapshot.topQueryPages.find(row =>
      row.impressions >= 40 && row.position >= 4 && row.position <= 20 && row.ctr < 0.03);
    if (snippet) {
      proposals.push({
        issueId: "gsc-snippet:" + brandId + ":" + encodeURIComponent(snippet.page).slice(0, 105),
        brandId, priority: "MEDIUM",
        title: "Sam SEO: Undersøk søketreffet for «" + snippet.query + "»",
        description: snippet.impressions + " visninger · " + snippet.clicks + " klikk · " +
          (100 * snippet.ctr).toFixed(1) + " % CTR · snittposisjon " + snippet.position.toFixed(1) +
          " · side " + snippet.page + ". Målingene indikerer en side å undersøke, ikke en påvist feil.",
        nextAction: "Sammenlign brukerintensjon med faktisk innhold, titteltagg og metabeskrivelse. Foreslå én faktabasert endring og mål samme spørring/side i neste like lange periode.",
        evidence: evidencePeriod,
      });
    }
    const content = snapshot.topQueryPages.find(row =>
      row.impressions >= 80 && row.position >= 8 && row.position <= 25 &&
      (!snippet || row.page !== snippet.page));
    if (content) {
      proposals.push({
        issueId: "gsc-content:" + brandId + ":" + encodeURIComponent(content.page).slice(0, 105),
        brandId, priority: "MEDIUM",
        title: "Sam SEO: Undersøk innholdsdekning for «" + content.query + "»",
        description: content.impressions + " visninger · snittposisjon " + content.position.toFixed(1) +
          " · side " + content.page + ". Søkeytelse alene dokumenterer ikke et innholdshull.",
        nextAction: "Kontroller om siden faktisk svarer godt på spørsmålet. Vurder originale opplysninger, tydelig svar, intern lenking og en relevant CTA; unngå masseproduserte like sider.",
        evidence: evidencePeriod,
      });
    }
  }
  return proposals;
}
