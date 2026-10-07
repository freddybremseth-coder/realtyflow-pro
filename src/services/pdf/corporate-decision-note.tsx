import React from "react";
import {
  Document,
  Image,
  Link,
  Page,
  StyleSheet,
  Text,
  View,
  renderToBuffer,
} from "@react-pdf/renderer";
import {
  DEFAULT_CORPORATE_DECISION_NOTE_TEMPLATE,
  type CorporateDecisionNoteReport,
  type CorporateMarketHistoryPoint,
} from "@/lib/corporate-decision-note";
import { isSvgLogoSource, svgToReactPdfDataUri } from "@/services/pdf/svg-logo";

const styles = StyleSheet.create({
  page: {
    paddingTop: 36,
    paddingBottom: 48,
    paddingHorizontal: 42,
    fontFamily: "Helvetica",
    fontSize: 9,
    color: "#17242a",
    backgroundColor: "#fbfaf7",
    lineHeight: 1.45,
  },
  brandRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    minHeight: 42,
    marginBottom: 18,
  },
  logo: {
    width: 176,
    height: 42,
    objectFit: "contain",
  },
  logoFallback: {
    fontSize: 15,
    fontFamily: "Helvetica-Bold",
    color: "#17242a",
  },
  corporateBadge: {
    border: "1 solid #b58b43",
    borderRadius: 12,
    paddingVertical: 6,
    paddingHorizontal: 10,
    fontSize: 7.5,
    fontFamily: "Helvetica-Bold",
    color: "#765821",
    textTransform: "uppercase",
    letterSpacing: 1.1,
  },
  eyebrow: {
    fontSize: 8,
    color: "#8b6a31",
    textTransform: "uppercase",
    letterSpacing: 1.4,
    marginBottom: 7,
  },
  title: {
    fontSize: 27,
    fontFamily: "Helvetica-Bold",
    lineHeight: 1.1,
    marginBottom: 7,
    color: "#17242a",
  },
  subtitle: {
    fontSize: 10,
    color: "#5c6970",
    marginBottom: 18,
  },
  pageKicker: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    color: "#8b6a31",
    textTransform: "uppercase",
    letterSpacing: 1.2,
    marginBottom: 5,
  },
  pageTitle: {
    fontSize: 21,
    fontFamily: "Helvetica-Bold",
    color: "#17242a",
    marginBottom: 8,
  },
  pageIntro: {
    fontSize: 10,
    color: "#536268",
    lineHeight: 1.55,
    marginBottom: 12,
  },
  section: {
    marginTop: 14,
  },
  sectionTitle: {
    fontSize: 12,
    fontFamily: "Helvetica-Bold",
    marginBottom: 7,
    color: "#21383c",
  },
  summaryBox: {
    backgroundColor: "#edf3f0",
    borderRadius: 8,
    padding: 14,
    marginTop: 3,
    border: "1 solid #d9e2de",
  },
  summary: {
    fontSize: 10.2,
    lineHeight: 1.55,
  },
  leaderConclusion: {
    marginTop: 12,
    backgroundColor: "#17242a",
    borderRadius: 8,
    padding: 12,
    color: "#ffffff",
  },
  leaderConclusionLabel: {
    color: "#e4c68f",
    fontSize: 7.5,
    fontFamily: "Helvetica-Bold",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 4,
  },
  leaderConclusionText: {
    fontSize: 9.6,
    lineHeight: 1.5,
  },
  metaGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: 13,
    gap: 7,
  },
  metaCard: {
    width: "48.7%",
    border: "1 solid #d8dfdc",
    borderRadius: 7,
    padding: 9,
    backgroundColor: "#ffffff",
    minHeight: 45,
  },
  metaLabel: {
    fontSize: 6.8,
    color: "#6d787d",
    textTransform: "uppercase",
    letterSpacing: 0.7,
    marginBottom: 3,
  },
  metaValue: {
    fontSize: 9.3,
    fontFamily: "Helvetica-Bold",
  },
  kpiGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 7,
    marginTop: 4,
  },
  kpi: {
    width: "48.7%",
    padding: 10,
    minHeight: 66,
    borderRadius: 7,
    backgroundColor: "#ffffff",
    border: "1 solid #d8dfdc",
  },
  kpiLabel: {
    fontSize: 7.3,
    color: "#68747a",
    marginBottom: 3,
  },
  kpiValue: {
    fontSize: 13.5,
    fontFamily: "Helvetica-Bold",
    color: "#183338",
  },
  kpiNote: {
    fontSize: 7.2,
    color: "#738086",
    marginTop: 3,
    lineHeight: 1.35,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderBottom: "1 solid #e2e6e3",
    paddingVertical: 5,
    gap: 10,
  },
  rowLabel: {
    color: "#59666b",
    maxWidth: "67%",
  },
  rowValue: {
    fontFamily: "Helvetica-Bold",
    textAlign: "right",
    maxWidth: "31%",
  },
  bulletRow: {
    flexDirection: "row",
    gap: 7,
    marginBottom: 5,
  },
  bullet: {
    width: 10,
    color: "#9b7534",
    fontFamily: "Helvetica-Bold",
  },
  bulletText: {
    flex: 1,
    lineHeight: 1.45,
  },
  benefitCard: {
    border: "1 solid #d8dfdc",
    borderRadius: 8,
    backgroundColor: "#ffffff",
    padding: 11,
    marginBottom: 8,
  },
  benefitNumber: {
    fontSize: 7,
    color: "#8b6a31",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 4,
  },
  benefitText: {
    fontSize: 9.5,
    lineHeight: 1.45,
  },
  capacityGrid: {
    flexDirection: "row",
    gap: 7,
    marginTop: 11,
  },
  capacityCard: {
    flex: 1,
    borderRadius: 8,
    backgroundColor: "#edf3f0",
    padding: 10,
    minHeight: 62,
  },
  capacityValue: {
    fontSize: 16,
    fontFamily: "Helvetica-Bold",
    color: "#183338",
  },
  capacityLabel: {
    marginTop: 3,
    fontSize: 7.2,
    color: "#68747a",
    lineHeight: 1.3,
  },
  stayHeader: {
    flexDirection: "row",
    borderBottom: "1 solid #bdc8c4",
    paddingBottom: 5,
    marginTop: 4,
    fontFamily: "Helvetica-Bold",
    color: "#46555a",
  },
  stayRow: {
    flexDirection: "row",
    borderBottom: "1 solid #e2e6e3",
    paddingVertical: 5,
  },
  stayName: { width: "38%" },
  staySmall: { width: "14%", textAlign: "right" },
  stayCost: { width: "20%", textAlign: "right" },
  noteBox: {
    marginTop: 10,
    padding: 10,
    borderRadius: 7,
    backgroundColor: "#f5efe3",
    border: "1 solid #eadfc9",
  },
  noteTitle: {
    fontFamily: "Helvetica-Bold",
    marginBottom: 3,
    color: "#765821",
  },
  needBox: {
    padding: 12,
    borderRadius: 7,
    backgroundColor: "#ffffff",
    border: "1 solid #d8dfdc",
  },
  nextBox: {
    marginTop: 9,
    padding: 11,
    borderRadius: 7,
    backgroundColor: "#17242a",
    color: "#ffffff",
  },
  nextTitle: {
    fontFamily: "Helvetica-Bold",
    marginBottom: 4,
    color: "#e4c68f",
  },
  decisionBox: {
    backgroundColor: "#edf3f0",
    border: "1 solid #d4dfda",
    borderRadius: 9,
    padding: 14,
    marginBottom: 13,
  },
  decisionTitle: {
    fontSize: 13,
    fontFamily: "Helvetica-Bold",
    color: "#183338",
    marginBottom: 6,
  },
  decisionText: {
    fontSize: 9.6,
    lineHeight: 1.55,
  },
  marketHero: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 12,
    marginTop: 4,
    marginBottom: 12,
  },
  marketHeroValue: {
    fontSize: 25,
    fontFamily: "Helvetica-Bold",
    color: "#183338",
  },
  marketHeroLabel: {
    fontSize: 8,
    color: "#68747a",
    marginBottom: 3,
  },
  marketChart: {
    marginTop: 8,
    backgroundColor: "#ffffff",
    border: "1 solid #d8dfdc",
    borderRadius: 8,
    padding: 12,
  },
  marketBarRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 7,
  },
  marketBarLabel: {
    width: 55,
    fontSize: 7.5,
    color: "#59666b",
  },
  marketBarTrack: {
    flex: 1,
    height: 11,
    borderRadius: 5,
    backgroundColor: "#edf0ee",
    overflow: "hidden",
  },
  marketBarFill: {
    height: 11,
    borderRadius: 5,
    backgroundColor: "#315e64",
  },
  marketBarValue: {
    width: 70,
    textAlign: "right",
    fontSize: 7.5,
    fontFamily: "Helvetica-Bold",
  },
  sourceBox: {
    marginTop: 9,
    padding: 9,
    borderRadius: 7,
    backgroundColor: "#ffffff",
    border: "1 solid #d8dfdc",
  },
  sourceLabel: {
    fontSize: 7.2,
    color: "#68747a",
    lineHeight: 1.4,
  },
  sourceLink: {
    color: "#315e64",
    textDecoration: "none",
  },
  disclaimer: {
    fontSize: 7.6,
    color: "#657277",
    lineHeight: 1.45,
  },
  footer: {
    position: "absolute",
    left: 42,
    right: 42,
    bottom: 20,
    fontSize: 6.8,
    color: "#7a8589",
    flexDirection: "row",
    justifyContent: "space-between",
    borderTop: "1 solid #e2e6e3",
    paddingTop: 7,
  },
});

function eur(value: number) {
  return new Intl.NumberFormat("nb-NO", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(Math.round(value));
}

function number(value: number) {
  return new Intl.NumberFormat("nb-NO", { maximumFractionDigits: 0 }).format(Math.round(value));
}

function date(value: string) {
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return value;
  return new Intl.DateTimeFormat("nb-NO", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(d);
}

function stringField(report: CorporateDecisionNoteReport, key: "corporate_label" | "logo_url") {
  const current = (report as unknown as Record<string, unknown>)[key];
  if (typeof current === "string" && current.trim()) return current.trim();
  return DEFAULT_CORPORATE_DECISION_NOTE_TEMPLATE[key];
}

function BulletList({ items }: { items: string[] }) {
  return (
    <View>
      {items.map((item, index) => (
        <View style={styles.bulletRow} key={index} wrap={false}>
          <Text style={styles.bullet}>•</Text>
          <Text style={styles.bulletText}>{item}</Text>
        </View>
      ))}
    </View>
  );
}

function Header({
  report,
  logoSource,
}: {
  report: CorporateDecisionNoteReport;
  logoSource?: string;
}) {
  return (
    <View style={styles.brandRow} wrap={false}>
      {logoSource ? (
        <Image src={logoSource} style={styles.logo} />
      ) : (
        <Text style={styles.logoFallback}>Zen Eco Homes</Text>
      )}
      <Text style={styles.corporateBadge}>{stringField(report, "corporate_label")}</Text>
    </View>
  );
}

function Footer({ report }: { report: CorporateDecisionNoteReport }) {
  return (
    <View style={styles.footer} fixed>
      <Text>Zen Eco Homes · {stringField(report, "corporate_label")} · zenecohomes.com</Text>
      <Text render={({ pageNumber, totalPages }) => `Side ${pageNumber} av ${totalPages}`} />
    </View>
  );
}

function PageHeading({
  kicker,
  title,
  intro,
}: {
  kicker: string;
  title: string;
  intro?: string;
}) {
  return (
    <View wrap={false}>
      <Text style={styles.pageKicker}>{kicker}</Text>
      <Text style={styles.pageTitle}>{title}</Text>
      {intro ? <Text style={styles.pageIntro}>{intro}</Text> : null}
    </View>
  );
}

function MarketChart({ points }: { points: CorporateMarketHistoryPoint[] }) {
  const max = Math.max(...points.map((point) => point.price_per_m2_eur), 1);
  return (
    <View style={styles.marketChart} wrap={false}>
      {points.map((point) => (
        <View style={styles.marketBarRow} key={point.label}>
          <Text style={styles.marketBarLabel}>{point.label}</Text>
          <View style={styles.marketBarTrack}>
            <View style={[styles.marketBarFill, { width: `${Math.max(8, point.price_per_m2_eur / max * 100)}%` }]} />
          </View>
          <Text style={styles.marketBarValue}>{number(point.price_per_m2_eur)} €/m²</Text>
        </View>
      ))}
    </View>
  );
}

function IntroPage({ report, logoSource }: { report: CorporateDecisionNoteReport; logoSource?: string }) {
  const calc = report.calculator;
  return (
    <Page size="A4" style={styles.page}>
      <Header report={report} logoSource={logoSource} />
      <Text style={styles.eyebrow}>Første beslutningsgrunnlag</Text>
      <Text style={styles.title}>{report.report_title || "Beslutningsgrunnlag"}</Text>
      <Text style={styles.subtitle}>
        {report.company_name} · {report.report_subtitle || "Firmabolig / bedriftshytte i Spania"} · {date(report.generated_at)}
      </Text>

      <View style={styles.summaryBox} wrap={false}>
        <Text style={styles.summary}>{report.executive_summary}</Text>
      </View>

      <View style={styles.leaderConclusion} wrap={false}>
        <Text style={styles.leaderConclusionLabel}>Ledelsens første spørsmål</Text>
        <Text style={styles.leaderConclusionText}>
          Er modellen interessant nok til at virksomheten bør bruke tid på å konkretisere område, boligtype, totalramme og faktisk bruk?
        </Text>
      </View>

      <View style={styles.metaGrid} wrap={false}>
        <View style={styles.metaCard}>
          <Text style={styles.metaLabel}>Modell</Text>
          <Text style={styles.metaValue}>{report.model || "Må avklares"}</Text>
        </View>
        <View style={styles.metaCard}>
          <Text style={styles.metaLabel}>Budsjett</Text>
          <Text style={styles.metaValue}>{report.budget_label || "Må avklares"}</Text>
        </View>
        <View style={styles.metaCard}>
          <Text style={styles.metaLabel}>Kontakt</Text>
          <Text style={styles.metaValue}>
            {[report.contact_name, report.contact_role].filter(Boolean).join(" · ") || "Ikke oppgitt"}
          </Text>
        </View>
        <View style={styles.metaCard}>
          <Text style={styles.metaLabel}>Tidslinje</Text>
          <Text style={styles.metaValue}>{report.timeline || "Må avklares"}</Text>
        </View>
      </View>

      {calc ? (
        <View style={styles.section} wrap={false}>
          <Text style={styles.sectionTitle}>Tallene i kortform</Text>
          <View style={styles.kpiGrid}>
            <View style={styles.kpi}>
              <Text style={styles.kpiLabel}>Kjøpesum</Text>
              <Text style={styles.kpiValue}>{eur(calc.property_price_eur)}</Text>
              <Text style={styles.kpiNote}>Valgt i kalkulatoren</Text>
            </View>
            <View style={styles.kpi}>
              <Text style={styles.kpiLabel}>Årlig kostnad før verdiendring</Text>
              <Text style={styles.kpiValue}>{eur(calc.annual_cost_before_value_eur)}</Text>
              <Text style={styles.kpiNote}>Drift + kapital + periodiserte kjøpskostnader</Text>
            </View>
            <View style={styles.kpi}>
              <Text style={styles.kpiLabel}>Alternativ hotellovernatting</Text>
              <Text style={styles.kpiValue}>{eur(calc.hotel_alternative_annual_eur)}</Text>
              <Text style={styles.kpiNote}>{number(calc.participant_nights)} personnetter per år</Text>
            </View>
            <View style={styles.kpi}>
              <Text style={styles.kpiLabel}>Scenarioverdi etter {calc.holding_years} år</Text>
              <Text style={styles.kpiValue}>{eur(calc.estimated_future_value_eur)}</Text>
              <Text style={styles.kpiNote}>Ved {calc.value_pct} % årlig verdiendring · scenario, ikke prognose</Text>
            </View>
          </View>
        </View>
      ) : (
        <View style={styles.noteBox} wrap={false}>
          <Text style={styles.noteTitle}>Tallgrunnlaget må kompletteres</Text>
          <Text>
            Kalkulatorverdiene fulgte ikke med denne forespørselen. Vi anbefaler en kort gjennomgang før notatet brukes som økonomisk beslutningsgrunnlag.
          </Text>
        </View>
      )}
      <Footer report={report} />
    </Page>
  );
}

function StrategicValuePage({ report, logoSource }: { report: CorporateDecisionNoteReport; logoSource?: string }) {
  const calc = report.calculator;
  return (
    <Page size="A4" style={styles.page}>
      <Header report={report} logoSource={logoSource} />
      <PageHeading
        kicker="Strategisk virksomhetsverdi"
        title="Mer enn en feriebolig"
        intro={report.strategic_value_intro}
      />

      <View style={styles.section}>
        {report.strategic_benefits.map((benefit, index) => (
          <View style={styles.benefitCard} key={index} wrap={false}>
            <Text style={styles.benefitNumber}>Mulig verdi {index + 1}</Text>
            <Text style={styles.benefitText}>{benefit}</Text>
          </View>
        ))}
      </View>

      {calc ? (
        <View style={styles.section} wrap={false}>
          <Text style={styles.sectionTitle}>Hva investeringen kan representere i bruk</Text>
          <View style={styles.capacityGrid}>
            <View style={styles.capacityCard}>
              <Text style={styles.capacityValue}>{number(calc.users)}</Text>
              <Text style={styles.capacityLabel}>ansatte / medlemmer med mulig tilgang</Text>
            </View>
            <View style={styles.capacityCard}>
              <Text style={styles.capacityValue}>{number(calc.employee_weeks_per_year)}</Text>
              <Text style={styles.capacityLabel}>ferie-/medlemsuker i modellen per år</Text>
            </View>
            <View style={styles.capacityCard}>
              <Text style={styles.capacityValue}>{number(calc.business_stay_count)}</Text>
              <Text style={styles.capacityLabel}>planlagte bedriftsopphold per år</Text>
            </View>
            <View style={styles.capacityCard}>
              <Text style={styles.capacityValue}>{number(calc.participant_nights)}</Text>
              <Text style={styles.capacityLabel}>personnetter i de planlagte bedriftsoppholdene</Text>
            </View>
          </View>
        </View>
      ) : null}

      <View style={styles.noteBox} wrap={false}>
        <Text style={styles.noteTitle}>Verdien må kobles til faktisk bruk.</Text>
        <Text>
          En firmabolig blir først et godt bedriftsverktøy når bruksregler, kapasitet, rettferdig fordeling og lokal drift er tydelig definert. Rapporten viser derfor muligheter – ikke en automatisk gevinst.
        </Text>
      </View>
      <Footer report={report} />
    </Page>
  );
}

function EconomicsPage({ report, logoSource }: { report: CorporateDecisionNoteReport; logoSource?: string }) {
  const calc = report.calculator;
  if (!calc) return null;

  return (
    <Page size="A4" style={styles.page}>
      <Header report={report} logoSource={logoSource} />
      <PageHeading
        kicker="Økonomi og bruk"
        title="Forutsetningene bak regnestykket"
        intro="Tallene nedenfor er beregnet fra opplysningene som er sendt inn. De skal gjøre modellen sammenlignbar og etterprøvbar før virksomheten går videre til konkrete boliger."
      />

      <View style={styles.section} wrap={false}>
        <Text style={styles.sectionTitle}>Hvordan årskostnaden er bygget opp</Text>
        <View style={styles.row}><Text style={styles.rowLabel}>Årlig drift</Text><Text style={styles.rowValue}>{eur(calc.annual_operating_eur)}</Text></View>
        <View style={styles.row}><Text style={styles.rowLabel}>Kjøpskostnader ({calc.acquisition_pct} %)</Text><Text style={styles.rowValue}>{eur(calc.acquisition_cost_eur)}</Text></View>
        <View style={styles.row}><Text style={styles.rowLabel}>Kjøpskostnader fordelt over {calc.holding_years} år</Text><Text style={styles.rowValue}>{eur(calc.annualized_acquisition_cost_eur)} / år</Text></View>
        <View style={styles.row}><Text style={styles.rowLabel}>Kapitalkostnad ({calc.capital_pct} % av kjøpesum + kjøpskostnader)</Text><Text style={styles.rowValue}>{eur(calc.annual_capital_cost_eur)} / år</Text></View>
        <View style={styles.row}><Text style={styles.rowLabel}>Samlet årskostnad før verdiendring</Text><Text style={styles.rowValue}>{eur(calc.annual_cost_before_value_eur)}</Text></View>
      </View>

      <View style={styles.section} wrap={false}>
        <Text style={styles.sectionTitle}>Bruk og kapasitet</Text>
        <View style={styles.row}><Text style={styles.rowLabel}>Ansatte / medlemmer med tilgang</Text><Text style={styles.rowValue}>{number(calc.users)}</Text></View>
        <View style={styles.row}><Text style={styles.rowLabel}>Ferie-/medlemsuker per år</Text><Text style={styles.rowValue}>{number(calc.employee_weeks_per_year)} uker</Text></View>
        <View style={styles.row}><Text style={styles.rowLabel}>Årskostnad mot ferie-/medlemsukene alene</Text><Text style={styles.rowValue}>{eur(calc.cost_per_employee_week_eur)} / uke</Text></View>
        <View style={styles.row}><Text style={styles.rowLabel}>Bedriftsopphold / personnetter</Text><Text style={styles.rowValue}>{number(calc.business_stay_count)} / {number(calc.participant_nights)}</Text></View>
      </View>

      {calc.stays.length > 0 && (
        <View style={styles.section} wrap={false}>
          <Text style={styles.sectionTitle}>Bedriftsopphold og hotellalternativ</Text>
          <View style={styles.stayHeader}>
            <Text style={styles.stayName}>Type</Text><Text style={styles.staySmall}>Antall</Text><Text style={styles.staySmall}>Pers.</Text><Text style={styles.staySmall}>Netter</Text><Text style={styles.stayCost}>Årskostnad</Text>
          </View>
          {calc.stays.map((stay, index) => (
            <View style={styles.stayRow} key={index}>
              <Text style={styles.stayName}>{stay.name}</Text><Text style={styles.staySmall}>{number(stay.events_per_year)}</Text><Text style={styles.staySmall}>{number(stay.people)}</Text><Text style={styles.staySmall}>{number(stay.nights)}</Text><Text style={styles.stayCost}>{eur(stay.annual_hotel_cost_eur)}</Text>
            </View>
          ))}
          <View style={styles.noteBox}>
            <Text style={styles.noteTitle}>Hotellbeløpet er ikke automatisk en besparelse.</Text>
            <Text>Det viser alternativ overnattingskostnad for de konkrete bedriftsoppholdene som er lagt inn. Ferie-/medlemsuker holdes utenfor hotellregnestykket.</Text>
          </View>
        </View>
      )}

      <View style={styles.section} wrap={false}>
        <Text style={styles.sectionTitle}>Verdiscenario</Text>
        <View style={styles.row}><Text style={styles.rowLabel}>Valgt årlig verdiendring</Text><Text style={styles.rowValue}>{calc.value_pct} %</Text></View>
        <View style={styles.row}><Text style={styles.rowLabel}>Scenarioverdi etter {calc.holding_years} år</Text><Text style={styles.rowValue}>{eur(calc.estimated_future_value_eur)}</Text></View>
        <View style={styles.noteBox}><Text style={styles.noteTitle}>Verdiutvikling holdes utenfor hovedkostnaden.</Text><Text>Verdiendringen er et scenario og behandles ikke som kontantinntekt, sikker avkastning eller garantert besparelse.</Text></View>
      </View>
      <Footer report={report} />
    </Page>
  );
}

function MarketPage({ report, logoSource }: { report: CorporateDecisionNoteReport; logoSource?: string }) {
  const points = report.market_history;
  const first = points[0]?.price_per_m2_eur || 0;
  const last = points[points.length - 1]?.price_per_m2_eur || 0;
  const changePct = first > 0 ? ((last / first) - 1) * 100 : 0;

  return (
    <Page size="A4" style={styles.page}>
      <Header report={report} logoSource={logoSource} />
      <PageHeading
        kicker="Markedskontekst"
        title={report.market_title}
        intro={report.market_summary}
      />

      <View style={styles.marketHero} wrap={false}>
        <View>
          <Text style={styles.marketHeroLabel}>Endring i annonsert €/m² fra første til siste datapunkt</Text>
          <Text style={styles.marketHeroValue}>+{Math.round(changePct)} %</Text>
        </View>
        <View>
          <Text style={styles.marketHeroLabel}>Siste datapunkt</Text>
          <Text style={styles.kpiValue}>{number(last)} €/m²</Text>
        </View>
      </View>

      <MarketChart points={points} />

      <View style={styles.noteBox} wrap={false}>
        <Text style={styles.noteTitle}>Hva dette betyr – og ikke betyr</Text>
        <Text>{report.market_methodology_note}</Text>
      </View>

      <View style={styles.section} wrap={false}>
        <Text style={styles.sectionTitle}>Det nasjonale markedet er fortsatt i vekst</Text>
        <Text style={styles.pageIntro}>{report.official_market_note}</Text>
      </View>

      <View style={styles.sourceBox} wrap={false}>
        <Text style={styles.sourceLabel}>Kilde: {report.market_source_label}</Text>
        <Link style={styles.sourceLink} src={report.market_source_url}>Åpne markedsserien</Link>
      </View>

      <View style={styles.sourceBox} wrap={false}>
        <Text style={styles.sourceLabel}>Kilde: {report.official_market_source_label}</Text>
        <Link style={styles.sourceLink} src={report.official_market_source_url}>Åpne offisiell prisstatistikk</Link>
      </View>

      <View style={styles.noteBox} wrap={false}>
        <Text style={styles.noteTitle}>Riktig bruk i en styresak</Text>
        <Text>
          Historisk prisvekst er relevant fordi virksomheten vurderer en langsiktig eiendel. Den bør likevel behandles som kontekst, ikke som hovedargument for kjøpet. Bruksverdi, totaløkonomi, styring og faktisk egnet bolig må stå på egne ben.
        </Text>
      </View>
      <Footer report={report} />
    </Page>
  );
}

function DecisionPage({ report, logoSource }: { report: CorporateDecisionNoteReport; logoSource?: string }) {
  return (
    <Page size="A4" style={styles.page}>
      <Header report={report} logoSource={logoSource} />
      <PageHeading
        kicker="Ledelse og neste beslutning"
        title="Hva bør ledelsen ta stilling til nå?"
      />

      <View style={styles.decisionBox} wrap={false}>
        <Text style={styles.decisionTitle}>{report.leadership_decision_title}</Text>
        <Text style={styles.decisionText}>{report.leadership_decision_text}</Text>
      </View>

      {report.needs && (
        <View style={styles.section} wrap={false}>
          <Text style={styles.sectionTitle}>Hva dere ønsker å få til</Text>
          <View style={styles.needBox}><Text>{report.needs}</Text></View>
        </View>
      )}

      <View style={styles.section} wrap={false}>
        <Text style={styles.sectionTitle}>Spørsmål styret bør avklare</Text>
        <BulletList items={report.board_questions} />
      </View>

      <View style={styles.section} wrap={false}>
        <Text style={styles.sectionTitle}>Anbefalt vei videre</Text>
        <BulletList items={report.recommended_next_steps} />
        <View style={styles.nextBox}>
          <Text style={styles.nextTitle}>Neste praktiske steg</Text>
          <Text>{report.next_practical_step || DEFAULT_CORPORATE_DECISION_NOTE_TEMPLATE.next_practical_step}</Text>
        </View>
      </View>

      <View style={styles.section} wrap={false}>
        <Text style={styles.sectionTitle}>Forbehold</Text>
        <Text style={styles.disclaimer}>{report.disclaimer}</Text>
      </View>
      <Footer report={report} />
    </Page>
  );
}

function PdfDocument({ report, logoSource }: { report: CorporateDecisionNoteReport; logoSource?: string }) {
  return (
    <Document
      title={`${report.report_title || "Beslutningsgrunnlag"} – ${report.company_name}`}
      author="Zen Eco Homes"
      subject="Første beslutningsgrunnlag for firmabolig / bedriftshytte i Spania"
    >
      <IntroPage report={report} logoSource={logoSource} />
      <StrategicValuePage report={report} logoSource={logoSource} />
      <EconomicsPage report={report} logoSource={logoSource} />
      <MarketPage report={report} logoSource={logoSource} />
      <DecisionPage report={report} logoSource={logoSource} />
    </Document>
  );
}

async function resolveLogoSource(value: string | undefined | null) {
  const source = String(value || "").trim();
  if (!source) return undefined;
  if (!isSvgLogoSource(source)) return source;
  if (source.startsWith("data:image/svg+xml")) return source;

  try {
    const response = await fetch(source, { cache: "no-store" });
    if (!response.ok) return undefined;
    const svg = await response.text();
    if (!/<svg[\s>]/i.test(svg)) return undefined;
    return svgToReactPdfDataUri(svg);
  } catch (error) {
    console.warn("[corporate-decision-note] logo fetch failed", error);
    return undefined;
  }
}

export async function renderCorporateDecisionNotePdf(report: CorporateDecisionNoteReport) {
  const logoSource = await resolveLogoSource(stringField(report, "logo_url"));
  return Buffer.from(await renderToBuffer(<PdfDocument report={report} logoSource={logoSource} />));
}
