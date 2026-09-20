import { SEO_SUPPLEMENTAL_AUDIT_TARGETS, type SiteAudit } from "./seo-audit";
import type { SEOLeadSummary } from "./seo-leads";
import type { getSEOObservedSignals } from "./seo-data";
import type { GSCBrandSnapshot } from "./seo-search-console";

type Signals = Awaited<ReturnType<typeof getSEOObservedSignals>>;
export type SEODiagnostic = {
  id: string; brandId: string | null;
  category: "measurement" | "technical" | "search" | "leads";
  title: string; finding: string; nextStep: string; evidence: string;
  kind: "check" | "observed"; needsApproval: false;
};

const BRANDS = ["zeneco", "pinosoecolife", "freddyb", "freddypublishing", "freddyart", "remasterfreddy", "donaanna", "chatgenius"] as const;
function diagnostic(input: Omit<SEODiagnostic, "needsApproval">): SEODiagnostic {
  return { ...input, needsApproval: false };
}

/** A low-traffic SEO portfolio still needs a grounded next check.
 * These are read-only diagnostic suggestions, NOT editorial approvals, tasks,
 * indexation verdicts, conversion rates or implied Google ranking predictions.
 * Never fabricate a search query/landing page when none was returned. */
export function planSEODiagnostics(input: {
  snapshots: readonly GSCBrandSnapshot[];
  signals: Signals | null;
  leads: SEOLeadSummary | null;
  audits: readonly SiteAudit[];
}): SEODiagnostic[] {
  const { snapshots, signals, leads, audits } = input;
  const checks: SEODiagnostic[] = [];
  const totalClicks = snapshots.reduce((sum, snap) => sum + snap.totals.currentClicks, 0);
  if (signals && signals.totals.current === 0 && totalClicks > 0) {
    checks.push(diagnostic({
      id: "check-referral-instrumentation", brandId: null, category: "measurement",
      title: "Sjekk henvisningsmålingen på tvers av nettstedene",
      finding: snapshots.length + " nettsteder hadde til sammen " + totalClicks +
        " Google-klikk i Search Console, men RealtyFlow har ingen registrerte søke-/AI-henvisningsankomster siste 30 dager.",
      nextStep: "Test en virkelig søkehenvisning fra et nettsted til RealtyFlow: nettleserens nettverksforespørsel, Origin/CORS, sporingskode, eventuelle samtykkesperrer og registrert databasehendelse. Search Console-klikk er ikke identisk med økter, og periodene er ikke helt like.",
      evidence: "Google Search Console sine datoangitte webklikk og separate RealtyFlow first-party arrival events.",
      kind: "check",
    }));
  }
  if (leads && leads.dataQuality.leadsWithoutPage > 0) {
    checks.push(diagnostic({
      id: "check-lead-source-page", brandId: null, category: "leads",
      title: "Verifiser kildesiden på neste reelle nettsidehenvendelse",
      finding: leads.dataQuality.leadsWithoutPage + " av " + leads.totals.current +
        " website_lead-henvendelser siste 30 dager mangler lagret offentlig kildeside. Tidligere henvendelser kan stamme fra før skjemafiksen.",
      nextStep: "Bekreft at neste ekte skjemahenvendelse lagrer den faktiske offentlige sideadressen i RealtyFlow uten URL-spørringsparametere. Ikke opprett testkunde i CRM eller tilskriv Google en henvendelse uten sesjonskobling.",
      evidence: "Aggregerte website_lead-work_items for siste 30 dager, ikke verifiserte organiske leads.",
      kind: "check",
    }));
  }
  const byBrand = new Map(snapshots.map(snapshot => [snapshot.brandId, snapshot]));
  const auditsByBrand = new Map(audits.map(audit => [audit.brandId, audit]));
  for (const brandId of BRANDS) {
    const snap = byBrand.get(brandId);
    if (!snap) {
      checks.push(diagnostic({
        id: "check-google-source:" + brandId, brandId, category: "measurement",
        title: "Bekreft faktisk Google-datalesing",
        finding: "Ingen fullført Search Console-måling er tilgjengelig for nettstedet i den valgte rapporten.",
        nextStep: "Kontroller korrekt Search Console-eiendom og API-svar før du trekker slutninger om synlighet eller oppretter innholdstiltak.",
        evidence: "Ingen verifisert Google-måleresultat i siste innhenting.", kind: "check",
      }));
      continue;
    }
    const { currentImpressions: views, currentClicks: clicks } = snap.totals;
    const page = snap.topPages.find(item => item.path.startsWith("/") && !item.path.includes("@") && item.path.length < 200);
    const pageHint = page ? " Høyest registrerte side i dette uttrekket: " + page.path +
      " (" + page.impressions + " visninger / " + page.clicks + " klikk)." : "";
    let title: string;
    let finding: string;
    let nextStep: string;
    if (views === 0) {
      title = "Undersøk grunnlaget for Google-synlighet";
      finding = "Google Search Console returnerte ingen visninger for nettstedets målte sider i perioden. Dette beviser ikke at nettstedet er uindeksert.";
      nextStep = "Kontroller valgt Search Console-eiendom, indekseringsrapporten, eksisterende sitemap, canonical og offentlig tilgjengelighet. Ikke opprett en publiseringsoppgave basert på null visninger alene.";
    } else if (views < 30) {
      title = "Kontroller at viktige offentlige sider kan oppdages";
      finding = views + " målte Google-visninger og " + clicks + " klikk over perioden. Utvalget er for lite til en pålitelig rangering eller CTR-konklusjon." + pageHint;
      nextStep = "Kontroller indeksering og internlenker til de eksisterende hovedsidene, at de svarer på faktisk søkeintensjon, og at relevant kontakt- eller produktvei er tydelig. Skill nettstedets Google web-målinger fra YouTube/Instagram.";
    } else {
      title = "Gå gjennom en dokumentert søkeside og dens kontaktvei";
      finding = views + " målte Google-visninger og " + clicks +
        " klikk i siste Google-periode. Tallene alene påviser ingen feil i tittel, innhold eller klikkrate." + pageHint;
      nextStep = "Velg en side fra Googles faktiske side-/søkefrasedata. Sjekk at tittelen svarer på intensjonen, at siden har originale svar, tydelige internlenker og en fungerende relevant CTA på mobil. Dokumenter én konkret hypotese før en liten reversibel endring.";
    }
    checks.push(diagnostic({
      id: "check-search-page:" + brandId, brandId, category: "search",
      title, finding, nextStep,
      evidence: "Search Console " + snap.property + " · " + snap.period.currentStart + "–" + snap.period.currentEnd +
        "; ikke nettstedssesjoner eller verifiserte leads.",
      kind: "check",
    }));

  }
  // Technical observations must remain visible even when Google's read-only
  // API is temporarily unavailable for this brand. A sitemap page that names
  // a different same-domain canonical is an investigation, never a license to
  // rewrite a URL or remove deliberately canonicalized/private content.
  for (const brandId of BRANDS) {
    const audit = auditsByBrand.get(brandId);
    if (!audit) continue;
    const explicit = audit.observations.filter(observation =>
      /noindex|site-wide disallow|canonical refers to a different host|canonical pointing to|non-HTTPS canonical|unparsable JSON-LD|did not return HTTP 200|has no server-rendered <title>/i.test(observation));
    if (explicit.length > 0) checks.push(diagnostic({
      id: "check-public-audit:" + brandId, brandId, category: "technical",
      title: "Et konkret offentlig SEO-avvik må bekreftes",
      finding: explicit.slice(0, 3).join("; ") + ". Den avgrensede HTTP-kontrollen er ikke en fullstendig Google-indekseringskontroll.",
      nextStep: "Gjenta HTTP-kontrollen på eksakt offentlig URL; bekreft ønsket canonical og om siden er ment å indekseres. Rett bare dokumenterte feil i godkjent, reversibel publiseringsflyt.",
      evidence: audit.base + " · begrenset offentlig SEO-audit " + audit.checkedAt, kind: "observed",
    }));
  }
  // Care is a technical-only satellite. Public service information may be
  // inspected, while private customer routes must retain intended auth/noindex.
  for (const target of SEO_SUPPLEMENTAL_AUDIT_TARGETS) {
    const audit = auditsByBrand.get(target.brandId);
    const pageStatus = audit?.home.status;
    const explicitlyBlocked = audit
      ? /\bnoindex\b/i.test([audit.home.robotsMeta, audit.home.xRobots].join(" ")) ||
        audit.robots.googlebotBlocked === true
      : false;
    checks.push(diagnostic({
      id: "check-satellite-public:" + target.brandId,
      brandId: target.brandId, category: "technical",
      title: "Kontroller offentlig Care-side uten å indeksere private kundeområder",
      finding: !audit
        ? "Ingen offentlig HTTP-kontroll av dette delnettstedet er tilgjengelig i siste kjøring."
        : pageStatus === null
          ? "Offentlig HTTP-status er ukjent; en nettverksfeil er ikke bevis for indekseringsfeil."
          : "Offentlig forside ga HTTP " + pageStatus +
            (explicitlyBlocked ? " og en eksplisitt indeks-/crawlerblokk ble observert." : ".") +
            " Den tekniske kontrollen er ikke i seg selv en Google-måling.",
      nextStep: "Avklar hvilke Care-sider som er offentlig tjenesteinformasjon og hvilke som er private kundeområder. Kontroller bare de offentlige sidene; ikke fjern tilsiktet noindex eller autentisering.",
      evidence: target.base + (audit ? " · offentlig HTTP-kontroll " + audit.checkedAt : " · ingen fullført HTTP-kontroll"),
      kind: "check",
    }));
  }
  return checks;
}
