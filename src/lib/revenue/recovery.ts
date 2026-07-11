export type RecoveryStage = "LOST" | "ON_HOLD";
export type RecoveryPriority = "HIGH" | "MEDIUM" | "LOW";
export type RecoveryDisposition = "RECOVER_NOW" | "NURTURE" | "DO_NOT_PURSUE";
export type LossReason =
  | "PRICE_BUDGET"
  | "FINANCING"
  | "TIMING"
  | "PROPERTY_MISMATCH"
  | "LOCATION"
  | "LEGAL_TECHNICAL"
  | "NO_RESPONSE"
  | "BOUGHT_ELSEWHERE"
  | "INVALID_DUPLICATE"
  | "PERSONAL"
  | "UNKNOWN";

export interface RecoveryContactInput {
  id: string;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  pipeline_status?: string | null;
  status?: string | null;
  stage?: string | null;
  pipeline_value?: number | string | null;
  sale_price?: number | string | null;
  brand_id?: string | null;
  brand?: string | null;
  source?: string | null;
  property?: string | null;
  property_interest?: string | null;
  notes?: string | null;
  interactions?: unknown[] | null;
  created_at?: string | null;
  updated_at?: string | null;
  last_contact?: string | null;
  next_followup?: string | null;
  lost_at?: string | null;
  closed_at?: string | null;
}

export interface RecoveryLead {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  brandId: string;
  stage: RecoveryStage;
  reason: LossReason;
  reasonLabel: string;
  reasonSource: "EXPLICIT" | "INFERRED" | "UNKNOWN";
  disposition: RecoveryDisposition;
  priority: RecoveryPriority;
  recoveryScore: number;
  dealValue: number;
  daysDormant: number;
  dormantSince: string;
  lastContactAt: string | null;
  nextFollowupAt: string | null;
  overdue: boolean;
  dueNow: boolean;
  missingReason: boolean;
  missingContactChannel: boolean;
  doNotPursue: boolean;
  priorStageSignal: string | null;
  issues: string[];
  recommendedAction: string;
  href: string;
}

export interface RecoveryWorkspace {
  generatedAt: string;
  summary: {
    dormantLeads: number;
    lostLeads: number;
    onHoldLeads: number;
    recoverNow: number;
    nurture: number;
    doNotPursue: number;
    dueNow: number;
    missingReason: number;
    highPotentialValue: number;
    totalDormantValue: number;
  };
  reasons: Array<{ reason: LossReason; label: string; count: number; value: number }>;
  leads: RecoveryLead[];
}

export const LOSS_REASON_LABELS: Record<LossReason, string> = {
  PRICE_BUDGET: "Pris eller budsjett",
  FINANCING: "Finansiering",
  TIMING: "Timing / ikke klar ennå",
  PROPERTY_MISMATCH: "Fant ikke riktig bolig",
  LOCATION: "Område eller beliggenhet",
  LEGAL_TECHNICAL: "Juridisk eller teknisk forhold",
  NO_RESPONSE: "Ingen respons",
  BOUGHT_ELSEWHERE: "Kjøpte et annet sted",
  INVALID_DUPLICATE: "Ugyldig eller duplikat",
  PERSONAL: "Personlig situasjon",
  UNKNOWN: "Årsak ikke registrert",
};

const REASON_PATTERNS: Array<{ reason: LossReason; pattern: RegExp }> = [
  { reason: "BOUGHT_ELSEWHERE", pattern: /kj[oø]pt(e)?\s+(andet|annet|andre|elsewhere)|valgte\s+annen|bought\s+elsewhere|other\s+agent|annen\s+megler/i },
  { reason: "INVALID_DUPLICATE", pattern: /duplikat|duplicate|fake|spam|ugyldig|invalid|feil\s+(nummer|epost|e-post)/i },
  { reason: "FINANCING", pattern: /finans|l[aå]n|mortgage|bank|egenkapital|financing/i },
  { reason: "PRICE_BUDGET", pattern: /for\s+dyr|pris|budget|budsjett|price|kostnad/i },
  { reason: "TIMING", pattern: /ikke\s+klar|senere|utsett|timing|neste\s+[aå]r|vente|pause|not\s+ready/i },
  { reason: "PROPERTY_MISMATCH", pattern: /fant\s+ikke|ingen\s+bolig|ikke\s+riktig|property\s+mismatch|manglet\s+(soverom|bad)|feil\s+bolig/i },
  { reason: "LOCATION", pattern: /omr[aå]de|beliggenhet|location|for\s+langt|ikke\s+i\s+(albir|altea|benidorm|pinoso)/i },
  { reason: "LEGAL_TECHNICAL", pattern: /juridisk|legal|ulovlig|lovlighet|teknisk|septic|septik|kloakk|byggetillat/i },
  { reason: "NO_RESPONSE", pattern: /ingen\s+svar|svarer\s+ikke|no\s+response|ghost|ubesvart|ikke\s+kontakt/i },
  { reason: "PERSONAL", pattern: /helse|syk|skilsmisse|familie|d[oø]dsfall|personlig|health|family/i },
];

const DORMANT_STAGES = new Set<RecoveryStage>(["LOST", "ON_HOLD"]);

function normalizeToken(value: unknown) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/Æ/g, "AE")
    .replace(/Ø/g, "O")
    .replace(/Å/g, "A")
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function normalizeRecoveryStage(value: unknown): RecoveryStage | null {
  const token = normalizeToken(value);
  if (["LOST", "TAPT", "CLOSED_LOST", "CLOSEDLOST"].includes(token)) return "LOST";
  if (["ON_HOLD", "HOLD", "PA_VENT", "PAA_VENT", "VENTER", "PAUSE", "PAUSED"].includes(token)) return "ON_HOLD";
  return null;
}

function normalizeReason(value: unknown): LossReason | null {
  const token = normalizeToken(value);
  const aliases: Record<string, LossReason> = {
    PRICE: "PRICE_BUDGET",
    BUDGET: "PRICE_BUDGET",
    PRICE_BUDGET: "PRICE_BUDGET",
    FINANCING: "FINANCING",
    FINANSIERING: "FINANCING",
    TIMING: "TIMING",
    NOT_READY: "TIMING",
    PROPERTY_MISMATCH: "PROPERTY_MISMATCH",
    WRONG_PROPERTY: "PROPERTY_MISMATCH",
    LOCATION: "LOCATION",
    AREA: "LOCATION",
    LEGAL: "LEGAL_TECHNICAL",
    TECHNICAL: "LEGAL_TECHNICAL",
    LEGAL_TECHNICAL: "LEGAL_TECHNICAL",
    NO_RESPONSE: "NO_RESPONSE",
    BOUGHT_ELSEWHERE: "BOUGHT_ELSEWHERE",
    INVALID: "INVALID_DUPLICATE",
    DUPLICATE: "INVALID_DUPLICATE",
    INVALID_DUPLICATE: "INVALID_DUPLICATE",
    PERSONAL: "PERSONAL",
    UNKNOWN: "UNKNOWN",
  };
  return aliases[token] || null;
}

function numberValue(value: unknown) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value !== "string") return 0;
  const normalized = value.replace(/\s/g, "").replace(/,/g, ".").replace(/[^0-9.-]/g, "");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function safeDate(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function daysBetween(earlier: Date, later: Date) {
  return Math.max(0, Math.floor((later.getTime() - earlier.getTime()) / 86_400_000));
}

function interactionRows(value: unknown[] | null | undefined) {
  return Array.isArray(value) ? value.filter((item): item is Record<string, any> => Boolean(item && typeof item === "object")) : [];
}

function interactionDate(item: Record<string, any>) {
  return safeDate(String(item.date || item.created_at || item.createdAt || ""));
}

function latestInteraction(rows: Record<string, any>[], actions: string[]) {
  const allowed = new Set(actions);
  return [...rows]
    .filter((item) => allowed.has(String(item.action || item.metadata?.action || "")))
    .sort((a, b) => (interactionDate(b)?.getTime() || 0) - (interactionDate(a)?.getTime() || 0))[0] || null;
}

function explicitReason(rows: Record<string, any>[]) {
  const item = latestInteraction(rows, ["recovery_reason_set"]);
  const reason = normalizeReason(item?.metadata?.reason || item?.reason);
  return reason && reason !== "UNKNOWN" ? reason : null;
}

function textFor(contact: RecoveryContactInput, rows: Record<string, any>[]) {
  return [
    contact.notes,
    contact.property,
    contact.property_interest,
    contact.source,
    ...rows.map((item) => [item.content, item.action, item.metadata?.reason, item.metadata?.note].filter(Boolean).join(" ")),
  ].filter(Boolean).join(" ");
}

export function inferLossReason(contact: RecoveryContactInput): { reason: LossReason; source: "EXPLICIT" | "INFERRED" | "UNKNOWN" } {
  const rows = interactionRows(contact.interactions);
  const explicit = explicitReason(rows);
  if (explicit) return { reason: explicit, source: "EXPLICIT" };
  const haystack = textFor(contact, rows);
  const inferred = REASON_PATTERNS.find((item) => item.pattern.test(haystack));
  if (inferred) return { reason: inferred.reason, source: "INFERRED" };
  return { reason: "UNKNOWN", source: "UNKNOWN" };
}

function previousStageSignal(haystack: string) {
  if (/reservasjon|reservation|forhandling|negotiation|bud\b|offer\b/i.test(haystack)) return "Forhandling eller reservasjon";
  if (/visning|viewing|besiktig/i.test(haystack)) return "Visning";
  if (/kvalifisert|qualified|budsjett\s+bekreftet|finansiering\s+bekreftet/i.test(haystack)) return "Kvalifisert";
  return null;
}

function reasonScore(reason: LossReason) {
  const scores: Record<LossReason, number> = {
    PRICE_BUDGET: 14,
    FINANCING: 10,
    TIMING: 22,
    PROPERTY_MISMATCH: 18,
    LOCATION: 14,
    LEGAL_TECHNICAL: 0,
    NO_RESPONSE: 8,
    BOUGHT_ELSEWHERE: -35,
    INVALID_DUPLICATE: -60,
    PERSONAL: 10,
    UNKNOWN: -5,
  };
  return scores[reason];
}

function dormantDate(contact: RecoveryContactInput, stage: RecoveryStage) {
  const primary = stage === "LOST"
    ? contact.lost_at || contact.closed_at || contact.updated_at || contact.created_at
    : contact.updated_at || contact.created_at;
  return safeDate(primary) || new Date();
}

function brandIdFor(contact: RecoveryContactInput) {
  return String(contact.brand_id || contact.brand || "zeneco").trim().toLowerCase() || "zeneco";
}

export function buildRecoveryLead(contact: RecoveryContactInput, now = new Date()): RecoveryLead | null {
  const stage = normalizeRecoveryStage(contact.pipeline_status || contact.status || contact.stage);
  if (!stage || !DORMANT_STAGES.has(stage)) return null;

  const rows = interactionRows(contact.interactions);
  const reasonResult = inferLossReason(contact);
  const haystack = textFor(contact, rows);
  const doNotPursueEvent = latestInteraction(rows, ["recovery_do_not_pursue"]);
  const reactivationPlan = latestInteraction(rows, ["recovery_plan_logged", "recovery_reviewed"]);
  const doNotPursue = Boolean(doNotPursueEvent)
    || reasonResult.reason === "BOUGHT_ELSEWHERE"
    || reasonResult.reason === "INVALID_DUPLICATE";

  const dealValue = Math.max(0, numberValue(contact.pipeline_value) || numberValue(contact.sale_price));
  const dormantSinceDate = dormantDate(contact, stage);
  const daysDormant = daysBetween(dormantSinceDate, now);
  const lastContact = safeDate(contact.last_contact || contact.updated_at || contact.created_at);
  const nextFollowup = safeDate(contact.next_followup);
  const overdue = Boolean(nextFollowup && nextFollowup.getTime() < now.getTime());
  const dueNow = !doNotPursue && (overdue || (!nextFollowup && daysDormant >= (stage === "ON_HOLD" ? 30 : 60)));
  const missingContactChannel = !String(contact.email || "").trim() && !String(contact.phone || "").trim();
  const priorStage = previousStageSignal(haystack);

  let score = 20;
  if (stage === "ON_HOLD") score += 25;
  if (dealValue > 0) score += 10;
  if (dealValue >= 500_000) score += 5;
  if (!missingContactChannel) score += 10;
  if (priorStage) score += priorStage.includes("Forhandling") ? 20 : 12;
  score += reasonScore(reasonResult.reason);
  if (daysDormant >= 30 && daysDormant <= 180) score += 15;
  else if (daysDormant <= 365) score += 8;
  else if (daysDormant > 730) score -= 10;
  else if (daysDormant < 14) score -= 10;
  if (overdue) score += 10;
  if (reactivationPlan) score -= 5;
  if (missingContactChannel) score -= 20;
  if (doNotPursue) score = 0;
  score = Math.max(0, Math.min(100, score));

  const disposition: RecoveryDisposition = doNotPursue
    ? "DO_NOT_PURSUE"
    : score >= 70
      ? "RECOVER_NOW"
      : "NURTURE";
  const priority: RecoveryPriority = disposition === "RECOVER_NOW" || (overdue && score >= 50)
    ? "HIGH"
    : score >= 45
      ? "MEDIUM"
      : "LOW";

  const issues: string[] = [];
  if (reasonResult.reason === "UNKNOWN") issues.push("Taps- eller pauseårsak mangler");
  if (missingContactChannel) issues.push("Gyldig kontaktkanal mangler");
  if (overdue) issues.push("Planlagt oppfølging er forsinket");
  if (!nextFollowup && !doNotPursue) issues.push("Ny vurderingsdato er ikke satt");
  if (doNotPursue) issues.push("Saken er markert eller klassifisert som ikke aktuell");

  let recommendedAction = "Sett en konkret ny vurderingsdato og behold saken i modning.";
  if (doNotPursue) recommendedAction = "Behold saken lukket og unngå ny kontakt uten et nytt innkommende signal.";
  else if (missingContactChannel) recommendedAction = "Kontroller kontaktdata før en eventuell gjenopptakelse.";
  else if (reasonResult.reason === "UNKNOWN") recommendedAction = "Registrer hvorfor saken stoppet før du vurderer ny kontakt.";
  else if (disposition === "RECOVER_NOW" && overdue) recommendedAction = "Gå gjennom saken nå, kontakt kunden manuelt og registrer resultatet.";
  else if (disposition === "RECOVER_NOW") recommendedAction = "Planlegg en personlig gjenopptakelse med et relevant nytt tilbud eller alternativ.";
  else if (reasonResult.reason === "TIMING" || reasonResult.reason === "PERSONAL") recommendedAction = "Avklar om tidspunktet har endret seg og sett en ny kjøpshorisont.";
  else if (reasonResult.reason === "PRICE_BUDGET" || reasonResult.reason === "FINANCING") recommendedAction = "Vurder alternativer innen nytt budsjett og avklar finansieringen på nytt.";
  else if (reasonResult.reason === "PROPERTY_MISMATCH" || reasonResult.reason === "LOCATION") recommendedAction = "Se etter nye boliger eller områder som løser den registrerte innvendingen.";
  else if (reasonResult.reason === "NO_RESPONSE") recommendedAction = "Gjør ett kontrollert manuelt kontaktforsøk og lukk videre oppfølging ved fortsatt stillhet.";

  return {
    id: contact.id,
    name: String(contact.name || contact.email || "Ukjent kontakt"),
    email: String(contact.email || "").trim() || null,
    phone: String(contact.phone || "").trim() || null,
    brandId: brandIdFor(contact),
    stage,
    reason: reasonResult.reason,
    reasonLabel: LOSS_REASON_LABELS[reasonResult.reason],
    reasonSource: reasonResult.source,
    disposition,
    priority,
    recoveryScore: score,
    dealValue,
    daysDormant,
    dormantSince: dormantSinceDate.toISOString(),
    lastContactAt: lastContact?.toISOString() || null,
    nextFollowupAt: nextFollowup?.toISOString() || null,
    overdue,
    dueNow,
    missingReason: reasonResult.reason === "UNKNOWN",
    missingContactChannel,
    doNotPursue,
    priorStageSignal: priorStage,
    issues,
    recommendedAction,
    href: `/customers/${encodeURIComponent(contact.id)}`,
  };
}

export function sortRecoveryLeads(leads: RecoveryLead[]) {
  const dispositionWeight: Record<RecoveryDisposition, number> = {
    RECOVER_NOW: 3,
    NURTURE: 2,
    DO_NOT_PURSUE: 1,
  };
  const priorityWeight: Record<RecoveryPriority, number> = { HIGH: 3, MEDIUM: 2, LOW: 1 };
  return [...leads].sort((a, b) => {
    const dispositionDelta = dispositionWeight[b.disposition] - dispositionWeight[a.disposition];
    if (dispositionDelta) return dispositionDelta;
    const priorityDelta = priorityWeight[b.priority] - priorityWeight[a.priority];
    if (priorityDelta) return priorityDelta;
    if (a.dueNow !== b.dueNow) return a.dueNow ? -1 : 1;
    if (b.recoveryScore !== a.recoveryScore) return b.recoveryScore - a.recoveryScore;
    if (b.dealValue !== a.dealValue) return b.dealValue - a.dealValue;
    return b.daysDormant - a.daysDormant;
  });
}

export function buildRecoveryWorkspace(contacts: RecoveryContactInput[], now = new Date()): RecoveryWorkspace {
  const leads = sortRecoveryLeads(
    contacts
      .map((contact) => buildRecoveryLead(contact, now))
      .filter(Boolean) as RecoveryLead[],
  );
  const reasons = (Object.keys(LOSS_REASON_LABELS) as LossReason[])
    .map((reason) => {
      const rows = leads.filter((lead) => lead.reason === reason);
      return {
        reason,
        label: LOSS_REASON_LABELS[reason],
        count: rows.length,
        value: rows.reduce((sum, row) => sum + row.dealValue, 0),
      };
    })
    .filter((row) => row.count > 0)
    .sort((a, b) => b.count - a.count || b.value - a.value);

  return {
    generatedAt: now.toISOString(),
    summary: {
      dormantLeads: leads.length,
      lostLeads: leads.filter((lead) => lead.stage === "LOST").length,
      onHoldLeads: leads.filter((lead) => lead.stage === "ON_HOLD").length,
      recoverNow: leads.filter((lead) => lead.disposition === "RECOVER_NOW").length,
      nurture: leads.filter((lead) => lead.disposition === "NURTURE").length,
      doNotPursue: leads.filter((lead) => lead.disposition === "DO_NOT_PURSUE").length,
      dueNow: leads.filter((lead) => lead.dueNow).length,
      missingReason: leads.filter((lead) => lead.missingReason).length,
      highPotentialValue: leads.filter((lead) => lead.disposition === "RECOVER_NOW").reduce((sum, lead) => sum + lead.dealValue, 0),
      totalDormantValue: leads.reduce((sum, lead) => sum + lead.dealValue, 0),
    },
    reasons,
    leads,
  };
}
