import React from "react";
import {
  Document,
  Page,
  StyleSheet,
  Text,
  View,
  renderToBuffer,
} from "@react-pdf/renderer";
import type { CorporateDecisionNoteReport } from "@/lib/corporate-decision-note";

const styles = StyleSheet.create({
  page: {
    paddingTop: 42,
    paddingBottom: 44,
    paddingHorizontal: 44,
    fontFamily: "Helvetica",
    fontSize: 9,
    color: "#17242a",
    backgroundColor: "#fbfaf7",
    lineHeight: 1.45,
  },
  eyebrow: {
    fontSize: 8,
    color: "#8b6a31",
    textTransform: "uppercase",
    letterSpacing: 1.4,
    marginBottom: 8,
  },
  title: {
    fontSize: 25,
    fontFamily: "Helvetica-Bold",
    lineHeight: 1.12,
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 10,
    color: "#5c6970",
    marginBottom: 20,
  },
  section: {
    marginTop: 16,
  },
  sectionTitle: {
    fontSize: 12,
    fontFamily: "Helvetica-Bold",
    marginBottom: 7,
    color: "#21383c",
  },
  summaryBox: {
    backgroundColor: "#edf3f0",
    borderRadius: 7,
    padding: 14,
    marginTop: 4,
  },
  summary: {
    fontSize: 10,
    lineHeight: 1.55,
  },
  metaGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: 14,
    gap: 8,
  },
  metaCard: {
    width: "48%",
    border: "1 solid #d8dfdc",
    borderRadius: 6,
    padding: 9,
    backgroundColor: "#ffffff",
  },
  metaLabel: {
    fontSize: 7,
    color: "#6d787d",
    textTransform: "uppercase",
    marginBottom: 3,
  },
  metaValue: {
    fontSize: 9.5,
    fontFamily: "Helvetica-Bold",
  },
  kpiGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 5,
  },
  kpi: {
    width: "48%",
    padding: 11,
    borderRadius: 6,
    backgroundColor: "#ffffff",
    border: "1 solid #d8dfdc",
  },
  kpiLabel: {
    fontSize: 7.5,
    color: "#68747a",
    marginBottom: 4,
  },
  kpiValue: {
    fontSize: 14,
    fontFamily: "Helvetica-Bold",
    color: "#183338",
  },
  kpiNote: {
    fontSize: 7.5,
    color: "#738086",
    marginTop: 3,
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
    maxWidth: "65%",
  },
  rowValue: {
    fontFamily: "Helvetica-Bold",
    textAlign: "right",
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
  },
  stayHeader: {
    flexDirection: "row",
    borderBottom: "1 solid #bdc8c4",
    paddingBottom: 5,
    marginTop: 4,
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
    marginTop: 12,
    padding: 10,
    borderRadius: 6,
    backgroundColor: "#f5efe3",
  },
  noteTitle: {
    fontFamily: "Helvetica-Bold",
    marginBottom: 3,
    color: "#765821",
  },
  footer: {
    position: "absolute",
    left: 44,
    right: 44,
    bottom: 22,
    fontSize: 7,
    color: "#7a8589",
    flexDirection: "row",
    justifyContent: "space-between",
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

function PdfDocument({ report }: { report: CorporateDecisionNoteReport }) {
  const calc = report.calculator;

  return (
    <Document
      title={`Beslutningsgrunnlag – ${report.company_name}`}
      author="Zen Eco Homes"
      subject="Første beslutningsgrunnlag for firmabolig / bedriftshytte i Spania"
    >
      <Page size="A4" style={styles.page}>
        <Text style={styles.eyebrow}>Zen Eco Homes · Corporate Homes</Text>
        <Text style={styles.title}>{report.report_title || "Beslutningsgrunnlag"}</Text>
        <Text style={styles.subtitle}>
          {report.company_name} · {report.report_subtitle || "Firmabolig / bedriftshytte i Spania"} · {date(report.generated_at)}
        </Text>

        <View style={styles.summaryBox}>
          <Text style={styles.summary}>{report.executive_summary}</Text>
        </View>

        <View style={styles.metaGrid}>
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
          <>
            <View style={styles.section}>
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
                  <Text style={styles.kpiNote}>Drift + kapitalkostnad + periodiserte kjøpskostnader</Text>
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

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Hvordan årskostnaden er bygget opp</Text>
              <View style={styles.row}>
                <Text style={styles.rowLabel}>Årlig drift</Text>
                <Text style={styles.rowValue}>{eur(calc.annual_operating_eur)}</Text>
              </View>
              <View style={styles.row}>
                <Text style={styles.rowLabel}>Kjøpskostnader ({calc.acquisition_pct} %)</Text>
                <Text style={styles.rowValue}>{eur(calc.acquisition_cost_eur)}</Text>
              </View>
              <View style={styles.row}>
                <Text style={styles.rowLabel}>Kjøpskostnader fordelt over {calc.holding_years} år</Text>
                <Text style={styles.rowValue}>{eur(calc.annualized_acquisition_cost_eur)} / år</Text>
              </View>
              <View style={styles.row}>
                <Text style={styles.rowLabel}>Kapitalkostnad ({calc.capital_pct} % av kjøpesum + kjøpskostnader)</Text>
                <Text style={styles.rowValue}>{eur(calc.annual_capital_cost_eur)} / år</Text>
              </View>
              <View style={styles.row}>
                <Text style={styles.rowLabel}>Samlet årskostnad før verdiendring</Text>
                <Text style={styles.rowValue}>{eur(calc.annual_cost_before_value_eur)}</Text>
              </View>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Bruk og kapasitet</Text>
              <View style={styles.row}>
                <Text style={styles.rowLabel}>Ansatte / medlemmer med tilgang</Text>
                <Text style={styles.rowValue}>{number(calc.users)}</Text>
              </View>
              <View style={styles.row}>
                <Text style={styles.rowLabel}>Ferie-/medlemsuker per år</Text>
                <Text style={styles.rowValue}>{number(calc.employee_weeks_per_year)} uker</Text>
              </View>
              <View style={styles.row}>
                <Text style={styles.rowLabel}>Årskostnad sett mot ferie-/medlemsukene alene</Text>
                <Text style={styles.rowValue}>{eur(calc.cost_per_employee_week_eur)} / uke</Text>
              </View>
              <View style={styles.row}>
                <Text style={styles.rowLabel}>Bedriftsopphold / personnetter</Text>
                <Text style={styles.rowValue}>{number(calc.business_stay_count)} / {number(calc.participant_nights)}</Text>
              </View>
            </View>

            {calc.stays.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Bedriftsopphold og hotellalternativ</Text>
                <View style={styles.stayHeader}>
                  <Text style={styles.stayName}>Type</Text>
                  <Text style={styles.staySmall}>Antall</Text>
                  <Text style={styles.staySmall}>Pers.</Text>
                  <Text style={styles.staySmall}>Netter</Text>
                  <Text style={styles.stayCost}>Årskostnad</Text>
                </View>
                {calc.stays.map((stay, index) => (
                  <View style={styles.stayRow} key={index} wrap={false}>
                    <Text style={styles.stayName}>{stay.name}</Text>
                    <Text style={styles.staySmall}>{number(stay.events_per_year)}</Text>
                    <Text style={styles.staySmall}>{number(stay.people)}</Text>
                    <Text style={styles.staySmall}>{number(stay.nights)}</Text>
                    <Text style={styles.stayCost}>{eur(stay.annual_hotel_cost_eur)}</Text>
                  </View>
                ))}
                <View style={styles.noteBox}>
                  <Text style={styles.noteTitle}>Hotellbeløpet er ikke automatisk en besparelse.</Text>
                  <Text>
                    Det viser alternativ overnattingskostnad for de konkrete bedriftsoppholdene som er lagt inn.
                    Ferie-/medlemsuker holdes utenfor hotellregnestykket.
                  </Text>
                </View>
              </View>
            )}

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Verdiscenario</Text>
              <View style={styles.row}>
                <Text style={styles.rowLabel}>Valgt årlig verdiendring</Text>
                <Text style={styles.rowValue}>{calc.value_pct} %</Text>
              </View>
              <View style={styles.row}>
                <Text style={styles.rowLabel}>Beregnet verdiendring første år</Text>
                <Text style={styles.rowValue}>{eur(calc.scenario_value_change_year_one_eur)}</Text>
              </View>
              <View style={styles.row}>
                <Text style={styles.rowLabel}>Scenarioverdi etter {calc.holding_years} år</Text>
                <Text style={styles.rowValue}>{eur(calc.estimated_future_value_eur)}</Text>
              </View>
              <View style={styles.noteBox}>
                <Text style={styles.noteTitle}>Verdiutvikling holdes utenfor hovedkostnaden.</Text>
                <Text>
                  Verdiendringen er et scenario og behandles ikke som kontantinntekt, sikker avkastning eller garantert besparelse.
                </Text>
              </View>
            </View>
          </>
        ) : (
          <View style={styles.noteBox}>
            <Text style={styles.noteTitle}>Tallgrunnlaget må kompletteres</Text>
            <Text>
              Kalkulatorverdiene fulgte ikke med denne forespørselen. Vi anbefaler en kort gjennomgang før notatet brukes som økonomisk beslutningsgrunnlag.
            </Text>
          </View>
        )}

        {report.needs && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Hva dere ønsker å få til</Text>
            <Text>{report.needs}</Text>
          </View>
        )}

        <View style={styles.section} break>
          <Text style={styles.sectionTitle}>Spørsmål styret bør avklare</Text>
          <BulletList items={report.board_questions} />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Anbefalt vei videre</Text>
          <BulletList items={report.recommended_next_steps} />
          <View style={styles.noteBox}>
            <Text style={styles.noteTitle}>Neste praktiske steg</Text>
            <Text>
              {report.next_practical_step || "En kort behovsavklaring gjør at vi kan kontrollere tallene, fastsette boligkriterier og lage en kortliste med relevante alternativer i stedet for en generell boligliste."}
            </Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Forbehold</Text>
          <Text>{report.disclaimer}</Text>
        </View>

        <View style={styles.footer} fixed>
          <Text>Zen Eco Homes · Corporate Homes · zenecohomes.com</Text>
          <Text render={({ pageNumber, totalPages }) => `Side ${pageNumber} av ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}

export async function renderCorporateDecisionNotePdf(report: CorporateDecisionNoteReport) {
  return Buffer.from(await renderToBuffer(<PdfDocument report={report} />));
}
