export interface EmailLinkContact {
  id: string;
  name?: string | null;
  email?: string | null;
  brand_id?: string | null;
  brand?: string | null;
}

export interface EmailLinkMessage {
  id: string;
  brand_id?: string | null;
  direction?: string | null;
  from_address?: string | null;
  to_addresses?: string[] | null;
  subject?: string | null;
  ai_intent?: string | null;
  received_at?: string | null;
  created_at?: string | null;
  matched_lead_id?: string | null;
  matched_customer_id?: string | null;
}

export type EmailLinkState = "linked" | "exact_candidate" | "ambiguous" | "unlinked";

export interface EmailLinkAssessment {
  message: EmailLinkMessage;
  state: EmailLinkState;
  confidence: "HIGH" | "NONE";
  contactIds: string[];
  reason: string;
}

export interface EmailLinkApprovalValidation {
  ok: boolean;
  idempotent: boolean;
  contactId: string | null;
  reason: string;
  assessment: EmailLinkAssessment;
}

function email(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

function contactBrand(contact: EmailLinkContact) {
  return String(contact.brand_id || contact.brand || "").trim().toLowerCase();
}

function messageBrand(message: EmailLinkMessage) {
  return String(message.brand_id || "").trim().toLowerCase();
}

function unique(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

export function assessEmailLink(message: EmailLinkMessage, contacts: EmailLinkContact[]): EmailLinkAssessment {
  const byId = new Map(contacts.map((contact) => [String(contact.id), contact]));
  const explicitIds = unique([String(message.matched_lead_id || ""), String(message.matched_customer_id || "")]);
  const directIds = explicitIds.filter((id) => byId.has(id));
  const unresolvedExplicitIds = explicitIds.filter((id) => !byId.has(id));

  if (unresolvedExplicitIds.length > 0) {
    return {
      message,
      state: "ambiguous",
      confidence: "NONE",
      contactIds: directIds,
      reason: "Meldingen har en eksisterende CRM-ID som ikke kan valideres mot dagens kontaktbase.",
    };
  }
  if (directIds.length === 1) {
    return { message, state: "linked", confidence: "HIGH", contactIds: directIds, reason: "Eksisterende eksplisitt CRM-kobling." };
  }
  if (directIds.length > 1) {
    return { message, state: "ambiguous", confidence: "NONE", contactIds: directIds, reason: "Meldingen peker på flere CRM-kontakter og må gjennomgås." };
  }

  const direction = String(message.direction || "").trim().toLowerCase();
  const participantEmails = direction === "inbound"
    ? [email(message.from_address)].filter(Boolean)
    : (Array.isArray(message.to_addresses) ? message.to_addresses.map(email).filter(Boolean) : []);

  const rawMatches = contacts.filter((contact) => participantEmails.includes(email(contact.email)));
  const brand = messageBrand(message);
  const sameBrandMatches = brand ? rawMatches.filter((contact) => contactBrand(contact) === brand) : rawMatches;
  const candidates = sameBrandMatches.length > 0 ? sameBrandMatches : rawMatches;
  const ids = unique(candidates.map((contact) => String(contact.id)));

  if (ids.length === 1) {
    return {
      message,
      state: "exact_candidate",
      confidence: "HIGH",
      contactIds: ids,
      reason: sameBrandMatches.length === 1 ? "Eksakt e-post + samme brand." : "Eksakt e-postadresse.",
    };
  }
  if (ids.length > 1) {
    return { message, state: "ambiguous", confidence: "NONE", contactIds: ids, reason: "Eksakt e-post matcher flere CRM-kontakter." };
  }

  return { message, state: "unlinked", confidence: "NONE", contactIds: [], reason: "Ingen sikker ID- eller eksakt e-postmatch." };
}

export function validateEmailLinkApproval(
  message: EmailLinkMessage,
  contacts: EmailLinkContact[],
  requestedContactId: string,
): EmailLinkApprovalValidation {
  const contactId = String(requestedContactId || "").trim();
  const assessment = assessEmailLink(message, contacts);

  if (!contactId) {
    return { ok: false, idempotent: false, contactId: null, reason: "contactId mangler.", assessment };
  }

  if (assessment.state === "linked") {
    const sameContact = assessment.contactIds.length === 1 && assessment.contactIds[0] === contactId;
    return {
      ok: sameContact,
      idempotent: sameContact,
      contactId: sameContact ? contactId : null,
      reason: sameContact ? "Meldingen er allerede koblet til denne kontakten." : "Meldingen er allerede koblet til en annen kontakt.",
      assessment,
    };
  }

  const exactCandidate = assessment.state === "exact_candidate"
    && assessment.confidence === "HIGH"
    && assessment.contactIds.length === 1
    && assessment.contactIds[0] === contactId;

  if (!exactCandidate) {
    return {
      ok: false,
      idempotent: false,
      contactId: null,
      reason: "Godkjenning avvist: meldingen er ikke en entydig, eksakt kandidat for valgt kontakt.",
      assessment,
    };
  }

  return {
    ok: true,
    idempotent: false,
    contactId,
    reason: assessment.reason,
    assessment,
  };
}

export function buildEmailLinkHealth(messages: EmailLinkMessage[], contacts: EmailLinkContact[]) {
  const items = (messages || []).map((message) => assessEmailLink(message, contacts));
  const count = (state: EmailLinkState) => items.filter((item) => item.state === state).length;
  return {
    summary: {
      messages: items.length,
      linked: count("linked"),
      exactCandidates: count("exact_candidate"),
      ambiguous: count("ambiguous"),
      unlinked: count("unlinked"),
      safeCoveragePercent: items.length ? Math.round(((count("linked") + count("exact_candidate")) / items.length) * 100) : 100,
    },
    items,
  };
}
