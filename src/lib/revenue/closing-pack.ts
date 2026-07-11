export type ClosingPackStage = "NEGOTIATION" | "WON";
export type ClosingDocumentStatus = "MISSING" | "REQUESTED" | "RECEIVED" | "REVIEWED" | "NOT_APPLICABLE";
export type ClosingResponsibleRole = "BUYER" | "SELLER" | "LAWYER" | "ADVISOR" | "BANK" | "NOTARY" | "OTHER";
export type ClosingDocumentPhase = "RESERVATION" | "IDENTITY" | "LEGAL" | "FINANCE" | "SIGNING" | "HANDOVER";

export interface ClosingPackContact {
  id: string;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  pipeline_status?: string | null;
  pipeline_value?: number | null;
  property_interest?: string | null;
  brand_id?: string | null;
  brand?: string | null;
  notes?: string | null;
  interactions?: Array<Record<string, any>> | null;
  next_followup?: string | null;
  next_follow_up?: string | null;
  follow_up_date?: string | null;
  updated_at?: string | null;
}

export interface ClosingDocumentDefinition {
  id: string;
  label: string;
  description: string;
  phase: ClosingDocumentPhase;
  requiredFrom: ClosingPackStage;
  critical: boolean;
  defaultResponsible: ClosingResponsibleRole;
}

export interface ClosingDocumentState extends ClosingDocumentDefinition {
  status: ClosingDocumentStatus;
  responsibleRole: ClosingResponsibleRole;
  dueDate: string | null;
  documentUrl: string | null;
  note: string | null;
  updatedAt: string | null;
  updatedBy: string | null;
  required: boolean;
  complete: boolean;
  overdue: boolean;
}

export interface ClosingPackDeal {
  id: string;
  name: string;
  brandId: string;
  stage: ClosingPackStage;
  value: number;
  propertyInterest: string | null;
  email: string | null;
  phone: string | null;
  nextFollowupAt: string | null;
  documents: ClosingDocumentState[];
  completionPercent: number;
  requiredCount: number;
  completeCount: number;
  missingCount: number;
  overdueCount: number;
  criticalBlockers: string[];
  risk: "HIGH" | "MEDIUM" | "LOW";
  lastPackReviewAt: string | null;
  href: string;
}

export const CLOSING_DOCUMENT_STATUSES: ClosingDocumentStatus[] = [
  "MISSING",
  "REQUESTED",
  "RECEIVED",
  "REVIEWED",
  "NOT_APPLICABLE",
];

export const CLOSING_RESPONSIBLE_ROLES: ClosingResponsibleRole[] = [
  "BUYER",
  "SELLER",
  "LAWYER",
  "ADVISOR",
  "BANK",
  "NOTARY",
  "OTHER",
];

export const CLOSING_DOCUMENTS: ClosingDocumentDefinition[] = [
  {
    id: "reservation_contract",
    label: "Reservasjonsavtale",
    description: "Signert reservasjon eller dokumentert tilbud med vilkår og beløp.",
    phase: "RESERVATION",
    requiredFrom: "NEGOTIATION",
    critical: true,
    defaultResponsible: "ADVISOR",
  },
  {
    id: "buyer_identity",
    label: "Pass / ID for kjøper",
    description: "Gyldig identifikasjon for alle registrerte kjøpere.",
    phase: "IDENTITY",
    requiredFrom: "NEGOTIATION",
    critical: true,
    defaultResponsible: "BUYER",
  },
  {
    id: "buyer_nie",
    label: "NIE-dokumentasjon",
    description: "NIE for alle kjøpere, eller dokumentert plan/fullmakt for søknad.",
    phase: "IDENTITY",
    requiredFrom: "NEGOTIATION",
    critical: true,
    defaultResponsible: "LAWYER",
  },
  {
    id: "lawyer_poa",
    label: "Advokat og fullmakt",
    description: "Advokatkontakt og eventuell signert fullmakt når dette er relevant.",
    phase: "LEGAL",
    requiredFrom: "NEGOTIATION",
    critical: false,
    defaultResponsible: "LAWYER",
  },
  {
    id: "due_diligence",
    label: "Juridisk due diligence",
    description: "Dokumentert status fra kjøpers advokat. RealtyFlow vurderer ikke det juridiske innholdet.",
    phase: "LEGAL",
    requiredFrom: "NEGOTIATION",
    critical: true,
    defaultResponsible: "LAWYER",
  },
  {
    id: "source_of_funds",
    label: "Finansiering / midlenes opprinnelse",
    description: "Dokumentert betalingsmåte, finansiering og nødvendige bank-/AML-avklaringer.",
    phase: "FINANCE",
    requiredFrom: "NEGOTIATION",
    critical: true,
    defaultResponsible: "BUYER",
  },
  {
    id: "payment_plan",
    label: "Betalingsplan",
    description: "Beløp, datoer, valuta, mottakerkonto og ansvar for betalingstrinn.",
    phase: "FINANCE",
    requiredFrom: "NEGOTIATION",
    critical: true,
    defaultResponsible: "ADVISOR",
  },
  {
    id: "inventory_list",
    label: "Inventarliste",
    description: "Signert eller avklart inventarliste når møbler og løsøre inngår.",
    phase: "LEGAL",
    requiredFrom: "NEGOTIATION",
    critical: false,
    defaultResponsible: "SELLER",
  },
  {
    id: "commission_basis",
    label: "Provisjonsgrunnlag",
    description: "Dokumentert provisjonssats/-beløp og betalingsansvar.",
    phase: "FINANCE",
    requiredFrom: "NEGOTIATION",
    critical: true,
    defaultResponsible: "ADVISOR",
  },
  {
    id: "signing_appointment",
    label: "Notarius og signeringsdetaljer",
    description: "Dato, sted, parter, representasjon og siste betalingsinstruks.",
    phase: "SIGNING",
    requiredFrom: "WON",
    critical: true,
    defaultResponsible: "NOTARY",
  },
  {
    id: "handover_protocol",
    label: "Overtakelsesprotokoll og nøkler",
    description: "Dokumentert overtakelse, nøkkelantall, målerstander og åpne punkter.",
    phase: "HANDOVER",
    requiredFrom: "WON",
    critical: true,
    defaultResponsible: "ADVISOR",
  },
  {
    id: "utilities_transfer",
    label: "Strøm, vann og praktisk overføring",
    description: "Status for abonnementer, community, forsikring og andre praktiske overføringer.",
    phase: "HANDOVER",
    requiredFrom: "WON",
    critical: false,
    defaultResponsible: "ADVISOR",
  },
];

function normalizeText(value: unknown) {
  return String(value || "").trim();
}

export function normalizeClosingPackStage(value: unknown): ClosingPackStage | null {
  const status = normalizeText(value).toUpperCase();
  if (["NEGOTIATION", "RESERVATION", "OFFER", "UNDER_CONTRACT"].includes(status)) return "NEGOTIATION";
  if (["WON", "VUNNET", "SOLGT", "SOLD", "CLOSED_WON", "CLOSED", "COMPLETED", "CUSTOMER", "KUNDE", "VIP"].includes(status)) return "WON";
  return null;
}

function interactionDate(item: Record<string, any>) {
  const value = item.date || item.created_at || item.updated_at || item.timestamp;
  const time = value ? new Date(value).getTime() : 0;
  return Number.isFinite(time) ? time : 0;
}

function isRequired(definition: ClosingDocumentDefinition, stage: ClosingPackStage) {
  return definition.requiredFrom === "NEGOTIATION" || stage === "WON";
}

function latestDocumentEvents(interactions: Array<Record<string, any>>) {
  const byDocument = new Map<string, Record<string, any>>();
  for (const item of interactions) {
    const action = normalizeText(item.action || item.metadata?.action).toLowerCase();
    if (action !== "closing_document_updated") continue;
    const documentId = normalizeText(item.metadata?.document_id || item.document_id);
    if (!documentId) continue;
    const current = byDocument.get(documentId);
    if (!current || interactionDate(item) >= interactionDate(current)) byDocument.set(documentId, item);
  }
  return byDocument;
}

function latestPackReview(interactions: Array<Record<string, any>>) {
  return interactions
    .filter((item) => normalizeText(item.action || item.metadata?.action).toLowerCase() === "closing_pack_reviewed")
    .sort((a, b) => interactionDate(b) - interactionDate(a))[0] || null;
}

function validStatus(value: unknown): ClosingDocumentStatus {
  const status = normalizeText(value).toUpperCase() as ClosingDocumentStatus;
  return CLOSING_DOCUMENT_STATUSES.includes(status) ? status : "MISSING";
}

function validRole(value: unknown, fallback: ClosingResponsibleRole): ClosingResponsibleRole {
  const role = normalizeText(value).toUpperCase() as ClosingResponsibleRole;
  return CLOSING_RESPONSIBLE_ROLES.includes(role) ? role : fallback;
}

function dateOnly(value: unknown) {
  const text = normalizeText(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
}

function safeHttpsUrl(value: unknown) {
  const text = normalizeText(value);
  if (!text) return null;
  try {
    const url = new URL(text);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export function buildClosingPackDeal(contact: ClosingPackContact, now = new Date()): ClosingPackDeal | null {
  const stage = normalizeClosingPackStage(contact.pipeline_status);
  if (!stage) return null;

  const interactions = Array.isArray(contact.interactions) ? contact.interactions : [];
  const latest = latestDocumentEvents(interactions);
  const documents = CLOSING_DOCUMENTS.map((definition): ClosingDocumentState => {
    const event = latest.get(definition.id);
    const metadata = event?.metadata && typeof event.metadata === "object" ? event.metadata : {};
    const status = validStatus(metadata.status);
    const required = isRequired(definition, stage);
    const dueDate = dateOnly(metadata.due_date);
    const complete = status === "REVIEWED" || status === "NOT_APPLICABLE";
    const overdue = Boolean(required && !complete && dueDate && new Date(`${dueDate}T23:59:59Z`).getTime() < now.getTime());
    return {
      ...definition,
      status,
      responsibleRole: validRole(metadata.responsible_role, definition.defaultResponsible),
      dueDate,
      documentUrl: safeHttpsUrl(metadata.document_url),
      note: normalizeText(metadata.note) || null,
      updatedAt: event ? new Date(interactionDate(event)).toISOString() : null,
      updatedBy: normalizeText(metadata.updated_by || event?.created_by) || null,
      required,
      complete,
      overdue,
    };
  });

  const requiredDocuments = documents.filter((document) => document.required);
  const completeDocuments = requiredDocuments.filter((document) => document.complete);
  const missing = requiredDocuments.filter((document) => !document.complete);
  const criticalBlockers = missing
    .filter((document) => document.critical)
    .map((document) => `${document.label}${document.overdue ? " (forfalt)" : ""}`);
  const overdueCount = requiredDocuments.filter((document) => document.overdue).length;
  const completionPercent = requiredDocuments.length > 0
    ? Math.round((completeDocuments.length / requiredDocuments.length) * 100)
    : 100;
  const risk: ClosingPackDeal["risk"] = overdueCount > 0 || criticalBlockers.length >= 3
    ? "HIGH"
    : criticalBlockers.length > 0 || completionPercent < 80
      ? "MEDIUM"
      : "LOW";
  const review = latestPackReview(interactions);

  return {
    id: contact.id,
    name: contact.name || contact.email || "Ukjent kunde",
    brandId: contact.brand_id || contact.brand || "zeneco",
    stage,
    value: Number(contact.pipeline_value || 0),
    propertyInterest: contact.property_interest || null,
    email: contact.email || null,
    phone: contact.phone || null,
    nextFollowupAt: contact.next_followup || contact.next_follow_up || contact.follow_up_date || null,
    documents,
    completionPercent,
    requiredCount: requiredDocuments.length,
    completeCount: completeDocuments.length,
    missingCount: missing.length,
    overdueCount,
    criticalBlockers,
    risk,
    lastPackReviewAt: review ? new Date(interactionDate(review)).toISOString() : null,
    href: `/customers/${encodeURIComponent(contact.id)}`,
  };
}

export function sortClosingPackDeals(deals: ClosingPackDeal[]) {
  const riskRank = { HIGH: 0, MEDIUM: 1, LOW: 2 };
  const stageRank = { NEGOTIATION: 0, WON: 1 };
  return [...deals].sort((a, b) =>
    riskRank[a.risk] - riskRank[b.risk]
    || b.overdueCount - a.overdueCount
    || stageRank[a.stage] - stageRank[b.stage]
    || b.value - a.value
    || a.name.localeCompare(b.name),
  );
}

export function summarizeClosingPacks(deals: ClosingPackDeal[]) {
  return {
    totalDeals: deals.length,
    highRisk: deals.filter((deal) => deal.risk === "HIGH").length,
    overdueDocuments: deals.reduce((sum, deal) => sum + deal.overdueCount, 0),
    missingDocuments: deals.reduce((sum, deal) => sum + deal.missingCount, 0),
    fullyReviewed: deals.filter((deal) => deal.completionPercent === 100).length,
    pipelineValue: deals.reduce((sum, deal) => sum + deal.value, 0),
  };
}
