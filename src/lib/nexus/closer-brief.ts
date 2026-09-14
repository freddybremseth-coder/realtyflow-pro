import { buildClosingPackDeal, type ClosingPackDeal } from "@/lib/revenue/closing-pack";

export type CloserBriefStage = "NEGOTIATION" | "RESERVED";
export type CloserBriefRisk = "HIGH" | "MEDIUM" | "LOW";

export interface CloserBriefContact {
  id: string;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  pipeline_status?: string | null;
  pipeline_value?: number | string | null;
  sale_price?: number | string | null;
  commission_amount?: number | string | null;
  commission_percent?: number | string | null;
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

export interface CloserBriefCommission {
  confirmed: boolean;
  amountEur: number | null;
  percent: number | null;
  basisValueEur: number | null;
  basisSource: "commission_amount" | "sale_price" | "pipeline_value" | null;
  stageProbabilityModel: number;
  weightedCommissionEur: number | null;
  issue: string | null;
}

export interface CloserBrief {
  version: 1;
  contactId: string;
  customerName: string;
  brandId: string;
  stage: CloserBriefStage;
  propertyInterest: string | null;
  propertyValueEur: number | null;
  commission: CloserBriefCommission;
  risk: CloserBriefRisk;
  score: number;
  closingPack: {
    completionPercent: number;
    requiredCount: number;
    completeCount: number;
    missingCount: number;
    overdueCount: number;
    criticalBlockers: string[];
    nextDeadlines: Array<{
      documentId: string;
      label: string;
      dueDate: string;
      responsibleRole: string;
      overdue: boolean;
    }>;
  };
  latestObjections: string[];
  nextFollowupAt: string | null;
  nextAction: string;
  href: string;
  safety: {
    readOnly: true;
    customerSend: false;
    pipelineMutation: false;
    priceCommitment: false;
    offerCommitment: false;
    contractCommitment: false;
  };
}

function numberValue(value: unknown) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value !== "string") return 0;
  const normalized = value.replace(/\s/g, "").replace(/,/g, ".").replace(/[^0-9.-]/g, "");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function text(value: unknown) {
  return String(value ?? "").trim();
}

function normalizeStage(value: unknown): CloserBriefStage | null {
  const token = text(value).toUpperCase();
  if (["NEGOTIATION", "FORHANDLING", "OFFER"].includes(token)) return "NEGOTIATION";
  if (["RESERVED", "RESERVATION", "RESERVASJON", "UNDER_CONTRACT"].includes(token)) return "RESERVED";
  return null;
}

function commissionFor(contact: CloserBriefContact, stage: CloserBriefStage): CloserBriefCommission {
  const explicitAmount = Math.max(0, numberValue(contact.commission_amount));
  const percentValue = numberValue(contact.commission_percent);
  const validPercent = percentValue > 0 && percentValue <= 100;
  const salePrice = Math.max(0, numberValue(contact.sale_price));
  const pipelineValue = Math.max(0, numberValue(contact.pipeline_value));
  const basisValue = salePrice || pipelineValue;
  const probability = stage === "RESERVED" ? 0.9 : 0.8;

  if (explicitAmount > 0) {
    return {
      confirmed: true,
      amountEur: explicitAmount,
      percent: validPercent ? percentValue : null,
      basisValueEur: basisValue > 0 ? basisValue : null,
      basisSource: "commission_amount",
      stageProbabilityModel: probability,
      weightedCommissionEur: explicitAmount * probability,
      issue: null,
    };
  }

  if (validPercent && basisValue > 0) {
    const amount = basisValue * (percentValue / 100);
    return {
      confirmed: true,
      amountEur: amount,
      percent: percentValue,
      basisValueEur: basisValue,
      basisSource: salePrice > 0 ? "sale_price" : "pipeline_value",
      stageProbabilityModel: probability,
      weightedCommissionEur: amount * probability,
      issue: null,
    };
  }

  return {
    confirmed: false,
    amountEur: null,
    percent: validPercent ? percentValue : null,
    basisValueEur: basisValue > 0 ? basisValue : null,
    basisSource: basisValue > 0 ? (salePrice > 0 ? "sale_price" : "pipeline_value") : null,
    stageProbabilityModel: probability,
    weightedCommissionEur: null,
    issue: validPercent && basisValue <= 0
      ? "Avtalt provisjonssats finnes, men salgs-/boligverdi mangler."
      : "Avtalt provisjonsbeløp eller sats mangler. Ingen fallback-provisjon brukes i Closer Brief.",
  };
}

function interactionTime(value: Record<string, any>) {
  const raw = value.date || value.created_at || value.updated_at || value.timestamp;
  const parsed = raw ? new Date(raw).getTime() : 0;
  return Number.isFinite(parsed) ? parsed : 0;
}

function latestObjections(contact: CloserBriefContact) {
  const patterns = [
    /for dyr|too expensive|pris|price/i,
    /usikker|unsure|bekymret|concern|objection|innvending/i,
    /finansiering|mortgage|bank|valuta|currency/i,
    /advokat|lawyer|legal|due diligence|nie|notar/i,
    /reservasjon|reservation|depositum|deposit|tilbud|offer/i,
    /må tenke|need to think|partner|ektefelle|wife|husband/i,
  ];
  const rows = [...(contact.interactions || [])]
    .sort((a, b) => interactionTime(b) - interactionTime(a));
  const found: string[] = [];
  for (const row of rows) {
    const content = text(row.content || row.body || row.message || row.note);
    if (!content || !patterns.some((pattern) => pattern.test(content))) continue;
    const compact = content.replace(/\s+/g, " ").slice(0, 260);
    if (!found.includes(compact)) found.push(compact);
    if (found.length >= 4) break;
  }
  return found;
}

function deadlines(pack: ClosingPackDeal) {
  return pack.documents
    .filter((document) => document.required && !document.complete && document.dueDate)
    .sort((a, b) => String(a.dueDate).localeCompare(String(b.dueDate)))
    .slice(0, 5)
    .map((document) => ({
      documentId: document.id,
      label: document.label,
      dueDate: document.dueDate!,
      responsibleRole: document.responsibleRole,
      overdue: document.overdue,
    }));
}

export function buildCloserBrief(contact: CloserBriefContact, now = new Date()): CloserBrief | null {
  const stage = normalizeStage(contact.pipeline_status);
  if (!stage) return null;

  const pack = buildClosingPackDeal({
    ...contact,
    pipeline_status: stage === "RESERVED" ? "RESERVED" : "NEGOTIATION",
  }, now);
  if (!pack) return null;

  const commission = commissionFor(contact, stage);
  const objections = latestObjections(contact);
  const propertyValue = Math.max(0, numberValue(contact.sale_price) || numberValue(contact.pipeline_value));
  const criticalBlockers = [...pack.criticalBlockers];
  if (!commission.confirmed) criticalBlockers.push("Provisjonsgrunnlag mangler");

  let score = stage === "RESERVED" ? 88 : 76;
  score += Math.round(pack.completionPercent * 0.08);
  score -= Math.min(18, pack.overdueCount * 6);
  score -= Math.min(18, criticalBlockers.length * 3);
  if (commission.confirmed) score += 4;
  score = Math.max(0, Math.min(100, score));

  const risk: CloserBriefRisk = pack.risk === "HIGH" || pack.overdueCount > 0
    ? "HIGH"
    : criticalBlockers.length > 0 || pack.risk === "MEDIUM"
      ? "MEDIUM"
      : "LOW";

  const nextAction = pack.overdueCount > 0
    ? "Gjennomgå forfalte closing-punkter og avklar ansvar/frister. Ingen kundehandling utføres automatisk."
    : pack.criticalBlockers[0]
      ? `Avklar closing-blokkering: ${pack.criticalBlockers[0]}.`
      : !commission.confirmed
        ? "Registrer faktisk avtalt provisjonsbeløp eller sats før Closer Brief brukes til inntektsprioritering."
        : stage === "RESERVED"
          ? "Gjennomgå reservasjon, dokumentstatus, betalingsplan og neste menneskelige closing-beslutning."
          : "Gjennomgå forhandlingsstatus, siste innvendinger og ett konkret menneskelig neste steg mot reservasjon."

  return {
    version: 1,
    contactId: contact.id,
    customerName: text(contact.name || contact.email) || "Ukjent kunde",
    brandId: text(contact.brand_id || contact.brand) || "zeneco",
    stage,
    propertyInterest: text(contact.property_interest) || null,
    propertyValueEur: propertyValue > 0 ? propertyValue : null,
    commission,
    risk,
    score,
    closingPack: {
      completionPercent: pack.completionPercent,
      requiredCount: pack.requiredCount,
      completeCount: pack.completeCount,
      missingCount: pack.missingCount,
      overdueCount: pack.overdueCount,
      criticalBlockers,
      nextDeadlines: deadlines(pack),
    },
    latestObjections: objections,
    nextFollowupAt: pack.nextFollowupAt,
    nextAction,
    href: `/customers/${encodeURIComponent(contact.id)}`,
    safety: {
      readOnly: true,
      customerSend: false,
      pipelineMutation: false,
      priceCommitment: false,
      offerCommitment: false,
      contractCommitment: false,
    },
  };
}

export function sortCloserBriefs(items: CloserBrief[]) {
  const riskWeight: Record<CloserBriefRisk, number> = { HIGH: 3, MEDIUM: 2, LOW: 1 };
  return [...items].sort((a, b) =>
    riskWeight[b.risk] - riskWeight[a.risk]
    || b.score - a.score
    || (b.commission.weightedCommissionEur || 0) - (a.commission.weightedCommissionEur || 0)
    || a.customerName.localeCompare(b.customerName, "nb"),
  );
}
