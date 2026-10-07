type JsonRecord = Record<string, unknown>;

export const CORPORATE_DECISION_NOTE_SEQUENCE_ID = "zeneco-corporate-decision-note-v1";
export const CORPORATE_DECISION_NOTE_BOOKING_URL = "https://appointment.chatgenius.pro/zeneco";
export const CORPORATE_DECISION_NOTE_TEMPLATE_KEY = "_zeneco_corporate_decision_note_template_v1";

export type CorporateDecisionNoteTemplate = {
  version: 1;
  report_title: string;
  report_subtitle: string;
  board_questions: string[];
  recommended_next_steps: string[];
  next_practical_step: string;
  disclaimer: string;
  updated_at?: string | null;
};

export const DEFAULT_CORPORATE_DECISION_NOTE_TEMPLATE: CorporateDecisionNoteTemplate = {
  version: 1,
  report_title: "Beslutningsgrunnlag",
  report_subtitle: "Firmabolig / bedriftshytte i Spania",
  board_questions: [
    "Hva er hovedformålet: ansattgode, medlemsfordel, ledersamlinger, retreat eller en kombinasjon?",
    "Hvem kan bruke boligen, hvor mange uker skal fordeles og hvilke bookingregler skal gjelde?",
    "Hva er investeringsrammen, og hvordan skal kjøp, finansiering, drift og løpende kostnader håndteres?",
    "Hvem eier beslutningen internt, og hvem må godkjenne økonomi, skatt, juridisk struktur og regnskapsføring?",
    "Hvordan skal lokal drift, nøkkelhold, renhold, vedlikehold, forsikring og årlig kontroll organiseres?",
  ],
  recommended_next_steps: [
    "Kort behovsavklaring med Zen Eco Homes for å kontrollere forutsetningene og justere tallene.",
    "Fastsett krav til område, boligtype, kapasitet, standard, bruk og maksimal totalramme.",
    "Lag en kortliste med 3–5 boliger som faktisk passer den vedtatte modellen.",
    "Kvalitetssikre skatt, juridisk struktur og regnskapsmessig behandling med kvalifiserte norske/spanske rådgivere.",
    "Oppdater beslutningsgrunnlaget med boligspesifikke kostnader før styre-/lederbeslutning og eventuell visning.",
  ],
  next_practical_step:
    "En kort behovsavklaring gjør at vi kan kontrollere tallene, fastsette boligkriterier og lage en kortliste med relevante alternativer i stedet for en generell boligliste.",
  disclaimer:
    "Dette er et planleggings- og beslutningsgrunnlag, ikke investerings-, skatte-, juridisk eller regnskapsråd. Kjøpskostnader, drift, kapitalkostnad, hotellalternativ og verdiutvikling bygger på valgte forutsetninger og må kvalitetssikres før en beslutning.",
  updated_at: null,
};

export type CorporateDecisionStay = {
  name: string;
  events_per_year: number;
  people: number;
  nights: number;
  price_per_person_night_eur: number;
  participant_nights: number;
  annual_hotel_cost_eur: number;
};

export type CorporateDecisionCalculator = {
  property_price_eur: number;
  users: number;
  employee_weeks_per_year: number;
  annual_operating_eur: number;
  acquisition_pct: number;
  capital_pct: number;
  value_pct: number;
  holding_years: number;
  acquisition_cost_eur: number;
  capital_base_eur: number;
  annual_capital_cost_eur: number;
  annualized_acquisition_cost_eur: number;
  annual_cost_before_value_eur: number;
  cost_per_employee_week_eur: number;
  business_stay_count: number;
  business_stay_nights: number;
  participant_nights: number;
  hotel_alternative_annual_eur: number;
  estimated_future_value_eur: number;
  scenario_value_change_year_one_eur: number;
  stays: CorporateDecisionStay[];
};

export type CorporateDecisionNoteReport = {
  version: 1;
  generated_at: string;
  company_name: string;
  contact_name: string;
  contact_role: string | null;
  organization_type: string | null;
  model: string | null;
  budget_label: string | null;
  timeline: string | null;
  needs: string | null;
  calculator: CorporateDecisionCalculator | null;
  report_title: string;
  report_subtitle: string;
  executive_summary: string;
  board_questions: string[];
  recommended_next_steps: string[];
  next_practical_step: string;
  disclaimer: string;
};

export type CorporateDecisionNoteState = {
  version: 1;
  request_id: string;
  requested_at: string;
  report: CorporateDecisionNoteReport;
  delivery: {
    status: "pending" | "sent" | "failed";
    sent_at?: string | null;
    message_id?: string | null;
    last_attempt_at?: string | null;
    error?: string | null;
  };
  followup: {
    day_2_sent_at?: string | null;
    day_5_sent_at?: string | null;
    day_10_sent_at?: string | null;
    completed_at?: string | null;
    stopped_at?: string | null;
    stop_reason?: string | null;
  };
};

function record(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as JsonRecord
    : {};
}

function text(value: unknown, max = 500) {
  return String(value ?? "").trim().slice(0, max);
}


function textList(value: unknown, fallback: string[], maxItems = 10, maxLength = 500) {
  if (!Array.isArray(value)) return [...fallback];
  const cleaned = value
    .map((item) => text(item, maxLength))
    .filter(Boolean)
    .slice(0, maxItems);
  return cleaned.length ? cleaned : [...fallback];
}

export function normalizeCorporateDecisionNoteTemplate(value: unknown): CorporateDecisionNoteTemplate {
  const input = record(value);
  return {
    version: 1,
    report_title: text(input.report_title, 120) || DEFAULT_CORPORATE_DECISION_NOTE_TEMPLATE.report_title,
    report_subtitle: text(input.report_subtitle, 220) || DEFAULT_CORPORATE_DECISION_NOTE_TEMPLATE.report_subtitle,
    board_questions: textList(
      input.board_questions,
      DEFAULT_CORPORATE_DECISION_NOTE_TEMPLATE.board_questions,
      10,
      600,
    ),
    recommended_next_steps: textList(
      input.recommended_next_steps,
      DEFAULT_CORPORATE_DECISION_NOTE_TEMPLATE.recommended_next_steps,
      10,
      600,
    ),
    next_practical_step:
      text(input.next_practical_step, 1200) || DEFAULT_CORPORATE_DECISION_NOTE_TEMPLATE.next_practical_step,
    disclaimer: text(input.disclaimer, 2000) || DEFAULT_CORPORATE_DECISION_NOTE_TEMPLATE.disclaimer,
    updated_at: text(input.updated_at, 80) || null,
  };
}

function numberInRange(value: unknown, min: number, max: number, fallback: number) {
  const parsed = typeof value === "string"
    ? Number(value.replace(/\s/g, "").replace(",", "."))
    : Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function money(value: number) {
  return new Intl.NumberFormat("nb-NO", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(Math.round(value));
}

function integer(value: number) {
  return new Intl.NumberFormat("nb-NO", { maximumFractionDigits: 0 }).format(Math.round(value));
}

export function buildCorporateDecisionCalculator(value: unknown): CorporateDecisionCalculator | null {
  const input = record(value);
  const propertyPrice = numberInRange(input.propertyPrice, 100_000, 20_000_000, 0);
  if (!propertyPrice) return null;

  const users = Math.round(numberInRange(input.users, 1, 100_000, 1));
  const employeeWeeks = numberInRange(input.employeeWeeks, 0, 52, 0);
  const annualOperating = numberInRange(input.annualOperating, 0, 2_000_000, 12_000);
  const acquisitionPct = numberInRange(input.acquisitionPct, 0, 30, 12);
  const capitalPct = numberInRange(input.capitalPct, 0, 25, 4);
  const valuePct = numberInRange(input.valuePct, 0, 25, 3);
  const holdingYears = Math.max(1, Math.round(numberInRange(input.holdingYears, 1, 30, 10)));

  const acquisitionCost = propertyPrice * (acquisitionPct / 100);
  const capitalBase = propertyPrice + acquisitionCost;
  const annualCapitalCost = capitalBase * (capitalPct / 100);
  const annualizedAcquisitionCost = acquisitionCost / holdingYears;
  const annualCostBeforeValue = annualOperating + annualCapitalCost + annualizedAcquisitionCost;

  const rawStays = Array.isArray(input.stays) ? input.stays.slice(0, 12) : [];
  const stays: CorporateDecisionStay[] = rawStays.map((item, index) => {
    const stay = record(item);
    const name = text(stay.name, 100) || `Bedriftsopphold ${index + 1}`;
    const events = numberInRange(stay.eventsPerYear, 0, 100, 0);
    const people = numberInRange(stay.people, 0, 10_000, 0);
    const nights = numberInRange(stay.nights, 0, 365, 0);
    const price = numberInRange(stay.pricePerPersonNight, 0, 5_000, 0);
    return {
      name,
      events_per_year: events,
      people,
      nights,
      price_per_person_night_eur: price,
      participant_nights: events * people * nights,
      annual_hotel_cost_eur: events * people * nights * price,
    };
  });

  const businessStayCount = stays.reduce((sum, stay) => sum + stay.events_per_year, 0);
  const businessStayNights = stays.reduce((sum, stay) => sum + stay.events_per_year * stay.nights, 0);
  const participantNights = stays.reduce((sum, stay) => sum + stay.participant_nights, 0);
  const hotelAlternativeAnnual = stays.reduce((sum, stay) => sum + stay.annual_hotel_cost_eur, 0);
  const costPerEmployeeWeek = employeeWeeks > 0
    ? annualCostBeforeValue / employeeWeeks
    : annualCostBeforeValue;
  const estimatedFutureValue = propertyPrice * Math.pow(1 + valuePct / 100, holdingYears);
  const scenarioValueChangeYearOne = propertyPrice * (valuePct / 100);

  return {
    property_price_eur: propertyPrice,
    users,
    employee_weeks_per_year: employeeWeeks,
    annual_operating_eur: annualOperating,
    acquisition_pct: acquisitionPct,
    capital_pct: capitalPct,
    value_pct: valuePct,
    holding_years: holdingYears,
    acquisition_cost_eur: acquisitionCost,
    capital_base_eur: capitalBase,
    annual_capital_cost_eur: annualCapitalCost,
    annualized_acquisition_cost_eur: annualizedAcquisitionCost,
    annual_cost_before_value_eur: annualCostBeforeValue,
    cost_per_employee_week_eur: costPerEmployeeWeek,
    business_stay_count: businessStayCount,
    business_stay_nights: businessStayNights,
    participant_nights: participantNights,
    hotel_alternative_annual_eur: hotelAlternativeAnnual,
    estimated_future_value_eur: estimatedFutureValue,
    scenario_value_change_year_one_eur: scenarioValueChangeYearOne,
    stays,
  };
}

export function buildCorporateDecisionNoteReport(input: {
  companyName: string;
  contactName: string;
  contactRole?: string | null;
  organizationType?: string | null;
  model?: string | null;
  budgetLabel?: string | null;
  timeline?: string | null;
  needs?: string | null;
  calculatorContext?: unknown;
  template?: CorporateDecisionNoteTemplate | null;
  now?: Date;
}): CorporateDecisionNoteReport {
  const companyName = text(input.companyName, 240) || "Virksomheten";
  const contactName = text(input.contactName, 160);
  const calculator = buildCorporateDecisionCalculator(input.calculatorContext);
  const template = normalizeCorporateDecisionNoteTemplate(input.template || DEFAULT_CORPORATE_DECISION_NOTE_TEMPLATE);

  const executiveSummary = calculator
    ? `Med de valgte forutsetningene er kjøpesummen ${money(calculator.property_price_eur)} og beregnet årlig kostnad før verdiendring ${money(calculator.annual_cost_before_value_eur)}. De konkrete bedriftsoppholdene som er lagt inn tilsvarer ${money(calculator.hotel_alternative_annual_eur)} i alternativ hotellovernatting per år. Hotellbeløpet er ikke behandlet som en automatisk besparelse, og verdiutviklingen er et scenario – ikke en prognose.`
    : "Forespørselen inneholder ikke et komplett kalkulatorgrunnlag. Notatet kan derfor brukes som en første beslutningsramme, mens kjøpesum, drift, bruk og hotellalternativ bør tallfestes før styret tar stilling.";

  const model = text(input.model, 180) || null;
  const needs = text(input.needs, 3000) || null;

  return {
    version: 1,
    generated_at: (input.now || new Date()).toISOString(),
    company_name: companyName,
    contact_name: contactName,
    contact_role: text(input.contactRole, 160) || null,
    organization_type: text(input.organizationType, 120) || null,
    model,
    budget_label: text(input.budgetLabel, 120) || null,
    timeline: text(input.timeline, 120) || null,
    needs,
    calculator,
    report_title: template.report_title,
    report_subtitle: template.report_subtitle,
    executive_summary: executiveSummary,
    board_questions: template.board_questions,
    recommended_next_steps: template.recommended_next_steps,
    next_practical_step: template.next_practical_step,
    disclaimer: template.disclaimer,
  };
}

export function decisionNoteSummaryLines(report: CorporateDecisionNoteReport) {
  const calc = report.calculator;
  if (!calc) {
    return [
      report.model ? `Modell: ${report.model}` : "",
      report.budget_label ? `Budsjett: ${report.budget_label}` : "",
      report.timeline ? `Tidslinje: ${report.timeline}` : "",
      "Tallgrunnlag: ikke komplett – anbefalt å justere i en kort behovsavklaring.",
    ].filter(Boolean);
  }
  return [
    `Kjøpesum: ${money(calc.property_price_eur)}`,
    `Årlig kostnad før verdiendring: ${money(calc.annual_cost_before_value_eur)}`,
    `Alternativ hotellovernatting: ${money(calc.hotel_alternative_annual_eur)} per år`,
    `Bruk: ${integer(calc.employee_weeks_per_year)} ferie-/medlemsuker + ${integer(calc.business_stay_count)} bedriftsopphold per år`,
    `Verdiscenario: ${calc.value_pct} % per år i ${calc.holding_years} år → ${money(calc.estimated_future_value_eur)}`,
  ];
}

export type CorporateDecisionFollowupStep = {
  id: "day_2" | "day_5" | "day_10";
  dueDays: number;
  subject: (params: { firstName: string; companyName: string }) => string;
  body: (params: { firstName: string; companyName: string; report: CorporateDecisionNoteReport }) => string;
};

export const CORPORATE_DECISION_FOLLOWUP_STEPS: CorporateDecisionFollowupStep[] = [
  {
    id: "day_2",
    dueDays: 2,
    subject: ({ firstName }) => `${firstName}, har dere fått sett på beslutningsgrunnlaget?`,
    body: ({ firstName, companyName, report }) => {
      const calc = report.calculator;
      const anchor = calc
        ? `Utgangspunktet vi har brukt er ${money(calc.property_price_eur)} i kjøpesum og ${integer(calc.employee_weeks_per_year)} ferie-/medlemsuker per år.`
        : "Tallgrunnlaget er foreløpig ikke komplett, så det er enkelt å justere modellen før dere bruker den internt.";
      return `Hei ${firstName},

Jeg ville bare sjekke at beslutningsgrunnlaget for ${companyName} kom frem.

${anchor}

Det viktigste spørsmålet nå er egentlig enkelt: Er kjøpesummen, bruken og modellen omtrent slik dere ser for dere?

Svar gjerne direkte på denne e-posten med det dere vil endre. Da kan vi gjøre neste versjon mer presis.

Hvis det er enklere, kan dere også booke en kort samtale her:
${CORPORATE_DECISION_NOTE_BOOKING_URL}

Vennlig hilsen
Freddy Bremseth
Zen Eco Homes`;
    },
  },
  {
    id: "day_5",
    dueDays: 5,
    subject: ({ companyName }) => `Skal vi gjøre grunnlaget for ${companyName} styreklart?`,
    body: ({ firstName, companyName }) => `Hei ${firstName},

Hvis dette fortsatt er aktuelt for ${companyName}, er neste steg å gjøre beslutningsgrunnlaget konkret nok til at ledelsen eller styret faktisk kan ta stilling.

I en kort gjennomgang kan vi avklare:
– hva boligen skal brukes til og hvem som skal ha tilgang
– realistisk totalramme og hvilke kostnader som bør inn i modellen
– hvilke områder og boligtyper som passer, slik at vi kan lage en kortliste på 3–5 relevante alternativer

Dere kan booke en kort samtale her:
${CORPORATE_DECISION_NOTE_BOOKING_URL}

Eller bare svar på denne e-posten med hva styret trenger for å kunne gå videre.

Vennlig hilsen
Freddy Bremseth
Zen Eco Homes`,
  },
  {
    id: "day_10",
    dueDays: 10,
    subject: ({ firstName }) => `${firstName}, jeg stopper den automatiske oppfølgingen her`,
    body: ({ firstName, companyName }) => `Hei ${firstName},

Jeg vil ikke fylle innboksen deres med unødvendige påminnelser, så dette blir siste automatiske oppfølging på beslutningsgrunnlaget for ${companyName}.

Hvis prosjektet fortsatt er aktuelt, svar på denne e-posten når det passer. Jeg kan da oppdatere tallene, avklare modellen og lage et mer konkret grunnlag med aktuelle områder og boliger.

Dere kan også booke en kort samtale direkte:
${CORPORATE_DECISION_NOTE_BOOKING_URL}

Vennlig hilsen
Freddy Bremseth
Zen Eco Homes`,
  },
];

export function firstName(value: string) {
  return text(value, 160).split(/\s+/)[0] || "der";
}

export function daysBetween(fromIso: string, now = new Date()) {
  const from = new Date(fromIso).getTime();
  if (!Number.isFinite(from)) return 0;
  return Math.max(0, (now.getTime() - from) / 86_400_000);
}

export function meetingAfter(interactions: unknown, afterIso: string) {
  if (!Array.isArray(interactions)) return false;
  const after = new Date(afterIso).getTime();
  return interactions.some((item) => {
    const row = record(item);
    if (String(row.type || "").toLowerCase() !== "meeting") return false;
    const at = new Date(String(row.date || "")).getTime();
    return Number.isFinite(at) && at > after;
  });
}

export function corporateDecisionStopReason(input: {
  reportSentAt: string;
  lastInboundReplyAt?: string | null;
  interactions?: unknown;
  pipelineStatus?: string | null;
  doNotContact?: boolean | null;
  emailSuppressed?: boolean | null;
  unsubscribeAt?: string | null;
}) {
  if (input.doNotContact || input.emailSuppressed || input.unsubscribeAt) return "email_suppressed";

  const sentAt = new Date(input.reportSentAt).getTime();
  const replyAt = input.lastInboundReplyAt ? new Date(input.lastInboundReplyAt).getTime() : NaN;
  if (Number.isFinite(replyAt) && Number.isFinite(sentAt) && replyAt > sentAt) return "customer_replied";
  if (meetingAfter(input.interactions, input.reportSentAt)) return "meeting_booked";

  const status = String(input.pipelineStatus || "").toUpperCase();
  if (["QUALIFIED", "MATCHING", "VIEWING", "NEGOTIATION", "RESERVED", "MEETING", "OPPORTUNITY", "WON", "LOST", "ON_HOLD"].includes(status)) {
    return `pipeline_${status.toLowerCase()}`;
  }
  return null;
}
