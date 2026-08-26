export interface CustomerListContact {
  email?: string | null;
  phone?: string | null;
  pipeline_status?: string | null;
  pipeline_value?: number | null;
  next_followup?: string | null;
  property_interest?: string | null;
  preferred_location?: string | null;
}

export type CustomerListActionPriority = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";

export interface CustomerListAction {
  priority: CustomerListActionPriority;
  score: number;
  label: string;
  reason: string;
  needsAction: boolean;
}

function normalizeStatus(value: unknown) {
  const status = String(value || "NEW").trim().toUpperCase();
  if (["CUSTOMER", "KUNDE", "VUNNET", "SOLGT", "SOLD", "CLOSED_WON"].includes(status)) return "WON";
  if (["TAPT", "CLOSED_LOST"].includes(status)) return "LOST";
  return status;
}

function validDate(value: unknown) {
  const date = new Date(String(value || ""));
  return Number.isNaN(date.getTime()) ? null : date;
}

export function buildCustomerListAction(contact: CustomerListContact, now = new Date()): CustomerListAction {
  const status = normalizeStatus(contact.pipeline_status);
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

  if (status === "VIEWING") {
    return { priority: "HIGH", score: 88, label: "Følg opp visningen", reason: "kunden er i visningsfasen", needsAction: true };
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
      label: contact.property_interest || contact.preferred_location ? "Finn neste boligsteg" : "Avklar boligbehov",
      reason: contact.property_interest || contact.preferred_location ? "kvalifisert kunde med registrert boliginteresse" : "kvalifisert kunde mangler tydelig boligretning",
      needsAction: true,
    };
  }

  return { priority: "MEDIUM", score: 55, label: "Hold neste steg tydelig", reason: "aktiv kunde i pipeline", needsAction: true };
}
