export const CLOSING_STAGES = [
  "QUALIFIED",
  "CONSULTATION_BOOKED",
  "REQUIREMENTS_CONFIRMED",
  "SHORTLIST_APPROVED",
  "VIEWING_PLANNED",
  "VIEWING_COMPLETED",
  "PREFERRED_PROPERTY",
  "OFFER_RESERVATION",
  "LEGAL_DUE_DILIGENCE",
  "CONTRACT_SIGNED",
  "COMPLETED",
] as const;

export type ClosingStage = (typeof CLOSING_STAGES)[number];
export type ClosingStatus = "ACTIVE" | "ON_HOLD" | "WON" | "LOST";
export type ClosingRiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export const CLOSING_STAGE_LABELS: Record<ClosingStage, string> = {
  QUALIFIED: "Kvalifisert",
  CONSULTATION_BOOKED: "Rådgivningsmøte booket",
  REQUIREMENTS_CONFIRMED: "Behov bekreftet",
  SHORTLIST_APPROVED: "Shortlist godkjent",
  VIEWING_PLANNED: "Visning planlagt",
  VIEWING_COMPLETED: "Visning gjennomført",
  PREFERRED_PROPERTY: "Foretrukket bolig",
  OFFER_RESERVATION: "Bud / reservasjon",
  LEGAL_DUE_DILIGENCE: "Juridisk kontroll",
  CONTRACT_SIGNED: "Kontrakt signert",
  COMPLETED: "Gjennomført",
};

const STAGE_PROBABILITY: Record<ClosingStage, number> = {
  QUALIFIED: 20,
  CONSULTATION_BOOKED: 25,
  REQUIREMENTS_CONFIRMED: 35,
  SHORTLIST_APPROVED: 45,
  VIEWING_PLANNED: 55,
  VIEWING_COMPLETED: 65,
  PREFERRED_PROPERTY: 75,
  OFFER_RESERVATION: 85,
  LEGAL_DUE_DILIGENCE: 90,
  CONTRACT_SIGNED: 97,
  COMPLETED: 100,
};

export interface ClosingDealLike {
  id?: string;
  contact_id?: string;
  brand_id?: string | null;
  title?: string | null;
  stage?: string | null;
  status?: string | null;
  property_refs?: unknown;
  preferred_property_ref?: string | null;
  decision_makers?: unknown;
  objections?: unknown;
  next_customer_decision?: string | null;
  next_action?: string | null;
  next_action_due_at?: string | null;
  expected_closing_date?: string | null;
  probability?: number | null;
  risk_level?: string | null;
  risk_reason?: string | null;
  financing_status?: string | null;
  legal_status?: string | null;
  reservation_status?: string | null;
  estimated_purchase_price?: number | null;
  expected_commission?: number | null;
  notes?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface ClosingRiskAssessment {
  level: ClosingRiskLevel;
  score: number;
  reasons: string[];
  overdue: boolean;
  missingNextAction: boolean;
}

function normalizeToken(value: unknown) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function normalizeClosingStage(value: unknown): ClosingStage {
  const token = normalizeToken(value);
  return CLOSING_STAGES.includes(token as ClosingStage) ? (token as ClosingStage) : "QUALIFIED";
}

export function normalizeClosingStatus(value: unknown): ClosingStatus {
  const token = normalizeToken(value);
  return ["ACTIVE", "ON_HOLD", "WON", "LOST"].includes(token) ? (token as ClosingStatus) : "ACTIVE";
}

export function defaultProbabilityForStage(stage: unknown) {
  return STAGE_PROBABILITY[normalizeClosingStage(stage)];
}

export function pipelineStatusForClosingStage(stage: unknown) {
  const normalized = normalizeClosingStage(stage);
  if (["VIEWING_PLANNED", "VIEWING_COMPLETED", "PREFERRED_PROPERTY"].includes(normalized)) return "VIEWING";
  if (["OFFER_RESERVATION", "LEGAL_DUE_DILIGENCE", "CONTRACT_SIGNED"].includes(normalized)) return "NEGOTIATION";
  if (normalized === "COMPLETED") return "WON";
  return "QUALIFIED";
}

function parseDate(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value.length === 10 ? `${value}T12:00:00.000Z` : value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isOverdue(value: string | null | undefined, now: Date) {
  const date = parseDate(value);
  return Boolean(date && date.getTime() < now.getTime());
}

function listLength(value: unknown) {
  if (Array.isArray(value)) return value.length;
  if (typeof value === "string") return value.trim() ? value.split(/[\n,;]/).filter((item) => item.trim()).length : 0;
  return 0;
}

function unresolvedObjectionCount(value: unknown) {
  if (!Array.isArray(value)) return listLength(value);
  return value.filter((item) => {
    if (typeof item === "string") return Boolean(item.trim());
    if (!item || typeof item !== "object") return false;
    const record = item as Record<string, unknown>;
    return record.resolved !== true && record.status !== "RESOLVED";
  }).length;
}

function stageAtLeast(stage: ClosingStage, threshold: ClosingStage) {
  return CLOSING_STAGES.indexOf(stage) >= CLOSING_STAGES.indexOf(threshold);
}

export function assessClosingRisk(deal: ClosingDealLike, now = new Date()): ClosingRiskAssessment {
  const stage = normalizeClosingStage(deal.stage);
  const status = normalizeClosingStatus(deal.status);
  const reasons: string[] = [];
  let score = 0;

  const overdue = isOverdue(deal.next_action_due_at, now);
  const missingNextAction = !String(deal.next_action || "").trim() || !deal.next_action_due_at;
  const objectionCount = unresolvedObjectionCount(deal.objections);
  const decisionMakerCount = listLength(deal.decision_makers);

  if (status === "ON_HOLD") {
    score += 20;
    reasons.push("Saken står på vent");
  }

  if (overdue) {
    score += 35;
    reasons.push("Neste handling er forsinket");
  } else if (missingNextAction) {
    score += 22;
    reasons.push("Mangler tydelig neste handling eller dato");
  }

  if (decisionMakerCount === 0 && stageAtLeast(stage, "REQUIREMENTS_CONFIRMED")) {
    score += 12;
    reasons.push("Beslutningstakere er ikke registrert");
  }

  if (objectionCount > 0) {
    score += Math.min(24, objectionCount * 8);
    reasons.push(`${objectionCount} uløste innsigelser`);
  }

  if (stageAtLeast(stage, "PREFERRED_PROPERTY") && !String(deal.preferred_property_ref || "").trim()) {
    score += 14;
    reasons.push("Foretrukket bolig er ikke registrert");
  }

  const financing = normalizeToken(deal.financing_status);
  if (stageAtLeast(stage, "OFFER_RESERVATION") && ["", "UNKNOWN", "NOT_STARTED", "PENDING"].includes(financing)) {
    score += 12;
    reasons.push("Finansiering er ikke avklart");
  }

  const legal = normalizeToken(deal.legal_status);
  if (["BLOCKED", "ISSUE", "REJECTED"].includes(legal)) {
    score += 22;
    reasons.push("Juridisk kontroll har en blokkering");
  }

  const expectedClose = parseDate(deal.expected_closing_date);
  if (expectedClose && expectedClose.getTime() < now.getTime() && !["WON", "LOST"].includes(status)) {
    score += 24;
    reasons.push("Forventet closingdato er passert");
  }

  if (!deal.expected_closing_date && stageAtLeast(stage, "VIEWING_COMPLETED")) {
    score += 8;
    reasons.push("Forventet closingdato mangler");
  }

  score = Math.min(100, score);
  const level: ClosingRiskLevel = score >= 60 ? "CRITICAL" : score >= 38 ? "HIGH" : score >= 18 ? "MEDIUM" : "LOW";

  return {
    level,
    score,
    reasons: reasons.length > 0 ? reasons : ["Ingen kritiske closing-risikoer registrert"],
    overdue,
    missingNextAction,
  };
}

export function recommendClosingAction(deal: ClosingDealLike, now = new Date()) {
  const stage = normalizeClosingStage(deal.stage);
  const risk = assessClosingRisk(deal, now);

  if (risk.overdue) return "Kontakt kunden i dag og avklar om neste beslutning fortsatt er aktuell.";
  if (!String(deal.next_action || "").trim()) return "Bestem én konkret neste handling, ansvarlig og dato.";
  if (listLength(deal.decision_makers) === 0 && stageAtLeast(stage, "REQUIREMENTS_CONFIRMED")) {
    return "Avklar hvem som deltar i kjøpsbeslutningen og registrer alle beslutningstakere.";
  }
  if (unresolvedObjectionCount(deal.objections) > 0) return "Velg den viktigste innsigelsen og avklar den med kunden før neste steg.";

  switch (stage) {
    case "QUALIFIED":
      return "Book et kort rådgivningsmøte og avklar budsjett, område og tidslinje.";
    case "CONSULTATION_BOOKED":
      return "Forbered spørsmålene og bekreft møtet med alle beslutningstakere.";
    case "REQUIREMENTS_CONFIRMED":
      return "Lag en kort kvalitetssikret shortlist med 3–5 relevante boliger.";
    case "SHORTLIST_APPROVED":
      return "Avklar hvilke boliger kunden vil se og foreslå konkrete visningsdatoer.";
    case "VIEWING_PLANNED":
      return "Bekreft visningsrute, tilgjengelighet og kundens viktigste vurderingskriterier.";
    case "VIEWING_COMPLETED":
      return "Registrer favorittbolig, innsigelser og kundens neste beslutning mens inntrykkene er ferske.";
    case "PREFERRED_PROPERTY":
      return "Avklar pris, vilkår og hva kunden trenger for å kunne reservere.";
    case "OFFER_RESERVATION":
      return "Følg opp tilbud eller reservasjon, betalingsfrist og kontakt med advokat.";
    case "LEGAL_DUE_DILIGENCE":
      return "Samle åpne juridiske punkter og avklar hvem som må levere hva innen hvilken dato.";
    case "CONTRACT_SIGNED":
      return "Bekreft betalingsmilepæler, overtakelse og praktiske tjenester etter kjøpet.";
    case "COMPLETED":
      return "Start ettermarked, be om anbefaling og registrer relevante tilleggstjenester.";
  }
}

export function decorateClosingDeal<T extends ClosingDealLike>(deal: T, now = new Date()) {
  const risk = assessClosingRisk(deal, now);
  const stage = normalizeClosingStage(deal.stage);
  return {
    ...deal,
    stage,
    status: normalizeClosingStatus(deal.status),
    probability: Number.isFinite(Number(deal.probability)) ? Math.max(0, Math.min(100, Number(deal.probability))) : defaultProbabilityForStage(stage),
    calculated_risk_level: risk.level,
    calculated_risk_score: risk.score,
    calculated_risk_reasons: risk.reasons,
    is_overdue: risk.overdue,
    is_missing_next_action: risk.missingNextAction,
    recommended_action: recommendClosingAction(deal, now),
  };
}
