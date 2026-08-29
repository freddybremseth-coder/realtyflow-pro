export interface CustomerListContact {
  email?: string | null;
  phone?: string | null;
  pipeline_status?: string | null;
  pipeline_value?: number | null;
  next_followup?: string | null;
  last_contact?: string | null;
  updated_at?: string | null;
  created_at?: string | null;
  interactions?: Array<Record<string, unknown>> | null;
  property_interest?: string | null;
  preferred_location?: string | null;
  nurture_status?: string | null;
  nurture_sequence?: string | null;
}

export type CustomerListActionPriority = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";

export type CanonicalRealEstateStage =
  | "NEW"
  | "CONTACT"
  | "QUALIFIED"
  | "MATCHING"
  | "VIEWING"
  | "NEGOTIATION"
  | "RESERVED"
  | "ON_HOLD"
  | "WON"
  | "LOST";

export const REAL_ESTATE_STAGE_ORDER: readonly CanonicalRealEstateStage[] = [
  "NEW",
  "CONTACT",
  "QUALIFIED",
  "MATCHING",
  "VIEWING",
  "NEGOTIATION",
  "RESERVED",
  "ON_HOLD",
  "WON",
  "LOST",
] as const;

export const REAL_ESTATE_STAGE_LABELS: Record<CanonicalRealEstateStage, string> = {
  NEW: "Ny",
  CONTACT: "Kontaktet",
  QUALIFIED: "Kvalifisert",
  MATCHING: "Boligmatching",
  VIEWING: "Visning",
  NEGOTIATION: "Forhandling",
  RESERVED: "Reservert",
  ON_HOLD: "På vent",
  WON: "Gjennomført",
  LOST: "Tapt",
};

export interface CustomerListAction {
  priority: CustomerListActionPriority;
  score: number;
  label: string;
  reason: string;
  needsAction: boolean;
}

export function normalizeRealEstateStage(value: unknown): string {
  const status = String(value || "NEW")
    .trim()
    .toUpperCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

  if (["CUSTOMER", "KUNDE", "VUNNET", "SOLGT", "SOLD", "CLOSED_WON", "COMPLETED"].includes(status)) return "WON";
  if (["TAPT", "CLOSED_LOST"].includes(status)) return "LOST";
  if (["PROPERTY_MATCHING", "SHORTLIST", "MATCH", "MATCHING"].includes(status)) return "MATCHING";
  if (["RESERVATION", "RESERVERT", "RESERVED", "DEPOSIT_PAID"].includes(status)) return "RESERVED";
  if (["WAITING", "PAUSED", "ON_HOLD", "HOLD"].includes(status)) return "ON_HOLD";
  return status || "NEW";
}

function validDate(value: unknown) {
  const date = new Date(String(value || ""));
  return Number.isNaN(date.getTime()) ? null : date;
}

function latestInteractionDate(interactions: CustomerListContact["interactions"]) {
  if (!Array.isArray(interactions)) return null;
  let latest: Date | null = null;
  for (const interaction of interactions) {
    if (!interaction || typeof interaction !== "object") continue;
    const candidate = validDate(interaction.date || interaction.created_at || interaction.timestamp);
    if (candidate && (!latest || candidate.getTime() > latest.getTime())) latest = candidate;
  }
  return latest;
}

export function customerLastActivityAt(contact: CustomerListContact) {
  const candidates = [
    validDate(contact.last_contact),
    latestInteractionDate(contact.interactions),
    validDate(contact.updated_at),
    validDate(contact.created_at),
  ].filter((value): value is Date => Boolean(value));
  if (!candidates.length) return null;
  return candidates.sort((a, b) => b.getTime() - a.getTime())[0];
}

function daysBetween(earlier: Date | null, later: Date) {
  if (!earlier) return null;
  return Math.max(0, (later.getTime() - earlier.getTime()) / (24 * 60 * 60 * 1000));
}

export function buildCustomerListAction(contact: CustomerListContact, now = new Date()): CustomerListAction {
  const status = normalizeRealEstateStage(contact.pipeline_status);
  if (["WON", "LOST"].includes(status)) {
    return { priority: "LOW", score: 5, label: "Ingen aktiv salgsoppfølging", reason: "kunden er avsluttet i pipeline", needsAction: false };
  }

  if (!contact.email && !contact.phone) {
    return { priority: "CRITICAL", score: 100, label: "Finn kontaktkanal", reason: "mangler både e-post og telefon", needsAction: true };
  }

  const followup = validDate(contact.next_followup);
  if (followup && followup.getTime() < now.getTime()) {
    return { priority: "CRITICAL", score: 96, label: "Følg opp nå", reason: "oppfølging er forfalt", needsAction: true };
  }

  if (status === "NEGOTIATION") {
    return { priority: "CRITICAL", score: 94, label: "Fremdrift i forhandling", reason: "kunden er i forhandling", needsAction: true };
  }

  if (status === "RESERVED") {
    return { priority: "HIGH", score: 92, label: "Sikre closing-fremdrift", reason: "kunden har reservert og må følges gjennom closing", needsAction: true };
  }

  if (status === "VIEWING") {
    return { priority: "HIGH", score: 88, label: "Følg opp visningen", reason: "kunden er i visningsfasen", needsAction: true };
  }

  if (status === "MATCHING") {
    return { priority: "HIGH", score: 86, label: "Finn og kvalitetssikre boliger", reason: "kunden er klar for boligmatching", needsAction: true };
  }

  if (status === "ON_HOLD") {
    if (followup && followup.getTime() >= now.getTime()) {
      return { priority: "LOW", score: 20, label: "På vent til avtalt dato", reason: "kunden har en fremtidig gjenopptakelsesdato", needsAction: false };
    }
    return { priority: "HIGH", score: 82, label: "Sett dato for gjenopptakelse", reason: "kunden står på vent uten ny oppfølgingsdato", needsAction: true };
  }

  if (followup && followup.getTime() >= now.getTime()) {
    return { priority: "LOW", score: 25, label: "Oppfølging er planlagt", reason: "kunden har en fremtidig oppfølgingsdato", needsAction: false };
  }

  const staleDays = daysBetween(customerLastActivityAt(contact), now);
  if (staleDays !== null && staleDays >= 30 && ["NEW", "CONTACT", "QUALIFIED"].includes(status)) {
    return {
      priority: "HIGH",
      score: staleDays >= 90 ? 90 : 87,
      label: "Reaktiver eller avklar status",
      reason: `ingen registrert aktivitet på ${Math.floor(staleDays)} dager`,
      needsAction: true,
    };
  }

  if (!followup && ["NEW", "CONTACT", "QUALIFIED"].includes(status)) {
    return { priority: "HIGH", score: 84, label: "Sett neste oppfølging", reason: "aktiv kunde mangler neste dato", needsAction: true };
  }

  if (status === "NEW") {
    return { priority: "HIGH", score: 80, label: "Kvalifiser leadet", reason: "nytt lead bør få første tydelige neste steg", needsAction: true };
  }

  if (status === "QUALIFIED") {
    return {
      priority: "MEDIUM",
      score: 68,
      label: contact.property_interest || contact.preferred_location ? "Flytt til boligmatching" : "Avklar boligbehov",
      reason: contact.property_interest || contact.preferred_location ? "kvalifisert kunde med registrert boliginteresse" : "kvalifisert kunde mangler tydelig boligretning",
      needsAction: true,
    };
  }

  return { priority: "MEDIUM", score: 55, label: "Hold neste steg tydelig", reason: "aktiv kunde i pipeline", needsAction: true };
}
