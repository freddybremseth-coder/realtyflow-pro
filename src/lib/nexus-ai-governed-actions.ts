import { sha256 } from "@/lib/agentic/ids";

export const NEXUS_GOVERNED_ACTION_TYPES = [
  "prepare_customer_email",
  "schedule_customer_followup",
  "add_customer_note",
  "create_customer_task",
  "update_customer_email",
  "update_customer_phone",
] as const;
export type NexusGovernedActionType = (typeof NEXUS_GOVERNED_ACTION_TYPES)[number];

export interface NexusActionContact {
  id: string;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  brand_id?: string | null;
  brand?: string | null;
  email_suppressed?: boolean | null;
  do_not_contact?: boolean | null;
  pipeline_status?: string | null;
}

export interface NexusActionProposal {
  id: string;
  type: NexusGovernedActionType;
  label: string;
  description: string;
  endpoint: "/api/nexus/actions" | "/api/nexus/contact-field-action";
  method: "POST";
  contactId: string;
  contactName: string;
  requestText: string;
  requiresApproval: boolean;
  scheduledFor?: string;
  field?: "email" | "phone";
  fieldValue?: string;
}

const normalize = (value: unknown) => String(value ?? "")
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLowerCase()
  .replace(/æ/g, "ae")
  .replace(/ø/g, "o")
  .replace(/å/g, "a")
  .replace(/[^a-z0-9]+/g, " ")
  .replace(/\s+/g, " ")
  .trim();

function eligibleInternalContact(contact: NexusActionContact | null | undefined): contact is NexusActionContact {
  return Boolean(contact?.id);
}

function eligibleBaseContact(contact: NexusActionContact | null | undefined): contact is NexusActionContact {
  return Boolean(
    eligibleInternalContact(contact)
    && !contact.email_suppressed
    && !contact.do_not_contact,
  );
}

function eligibleEmailContact(contact: NexusActionContact | null | undefined): contact is NexusActionContact {
  return Boolean(eligibleBaseContact(contact) && contact.email);
}

function isAdviceQuestion(text: string) {
  return !text || /^(hvordan|hvor|hva er|forklar)\b/.test(text);
}

function hasContactFieldUpdateVerb(text: string) {
  return /\b(endre|oppdater|bytt|sett|legg inn|legg til|registrer|korriger|replace|update)\b/.test(text);
}

export function extractCustomerEmailUpdate(message: string): string | null {
  const text = normalize(message);
  if (isAdviceQuestion(text) || !hasContactFieldUpdateVerb(text)) return null;
  if (!/\b(e post|epost|email|mailadresse|epostadresse|e postadresse)\b/.test(text)) return null;
  const matches = String(message || "").match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || [];
  const unique = [...new Set(matches.map((value) => value.trim().toLowerCase()))];
  return unique.length === 1 ? unique[0] : null;
}

export function normalizeCustomerPhone(value: unknown): string | null {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const hasPlus = raw.startsWith("+");
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 7 || digits.length > 15) return null;
  return `${hasPlus ? "+" : ""}${digits}`;
}

export function extractCustomerPhoneUpdate(message: string): string | null {
  const text = normalize(message);
  if (isAdviceQuestion(text) || !hasContactFieldUpdateVerb(text)) return null;
  if (!/\b(telefon|telefonnummer|mobil|mobilnummer|phone)\b/.test(text)) return null;
  const candidates = String(message || "").match(/(?:\+\d[\d\s().-]{5,}\d|\b\d[\d\s().-]{5,}\d\b)/g) || [];
  const normalized = [...new Set(candidates.map(normalizeCustomerPhone).filter((value): value is string => Boolean(value)))];
  return normalized.length === 1 ? normalized[0] : null;
}

export function messageRequestsCustomerEmail(message: string): boolean {
  const text = normalize(message);
  if (isAdviceQuestion(text)) return false;

  const directVerb = /\b(lag|skriv|forbered|klargjor|utarbeid|send|svar|folg opp|kontakte|kontakt)\b/.test(text);
  const communicationTarget = /\b(e post|epost|email|mail|melding|oppfolging|svar|kunden|kunde)\b/.test(text);
  return directVerb && communicationTarget;
}

export function messageRequestsFollowupSchedule(message: string): boolean {
  const text = normalize(message);
  if (isAdviceQuestion(text)) return false;
  const scheduleVerb = /\b(planlegg|sett|legg inn|minn meg|schedule|plan)\b/.test(text);
  const target = /\b(oppfolging|follow up|kontakt|ringe|ring|kunde|kunden)\b/.test(text);
  return scheduleVerb && target;
}

export function messageRequestsCustomerNote(message: string): boolean {
  const text = normalize(message);
  if (isAdviceQuestion(text)) return false;
  const directVerb = /\b(legg inn|registrer|noter|skriv|lag|opprett|add)\b/.test(text);
  const target = /\b(notat|note|merknad|crm notat)\b/.test(text);
  return directVerb && target;
}

export function messageRequestsCustomerTask(message: string): boolean {
  const text = normalize(message);
  if (isAdviceQuestion(text)) return false;
  const directVerb = /\b(lag|opprett|legg inn|registrer|sett opp|add)\b/.test(text);
  const target = /\b(oppgave|task|todo|to do)\b/.test(text);
  return directVerb && target;
}

const MONTHS: Record<string, number> = {
  januar: 0,
  februar: 1,
  mars: 2,
  april: 3,
  mai: 4,
  juni: 5,
  juli: 6,
  august: 7,
  september: 8,
  oktober: 9,
  november: 10,
  desember: 11,
};

const WEEKDAYS: Record<string, number> = {
  sondag: 0,
  mandag: 1,
  tirsdag: 2,
  onsdag: 3,
  torsdag: 4,
  fredag: 5,
  lordag: 6,
};

function atFollowupHour(year: number, month: number, day: number) {
  const date = new Date(Date.UTC(year, month, day, 9, 0, 0, 0));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month || date.getUTCDate() !== day) return null;
  return date;
}

function addUtcDays(date: Date, days: number) {
  const candidate = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 9, 0, 0, 0));
  candidate.setUTCDate(candidate.getUTCDate() + days);
  return Number.isFinite(candidate.getTime()) ? candidate : null;
}

/**
 * Deterministic, deliberately narrow parser for CRM due dates. 09:00 UTC is a
 * normalized due-time, not an appointment time. Ambiguous text returns null.
 */
export function parseFollowupDate(message: string, now = new Date()): string | null {
  const raw = String(message || "").trim().toLowerCase();
  const text = normalize(message);
  if (!raw || !Number.isFinite(now.getTime())) return null;

  let candidate: Date | null = null;

  const iso = raw.match(/\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/);
  if (iso) candidate = atFollowupHour(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));

  if (!candidate) {
    const numeric = raw.match(/\b(\d{1,2})[.\/](\d{1,2})[.\/](20\d{2})\b/);
    if (numeric) candidate = atFollowupHour(Number(numeric[3]), Number(numeric[2]) - 1, Number(numeric[1]));
  }

  if (!candidate) {
    const monthNames = Object.keys(MONTHS).join("|");
    const named = normalize(raw).match(new RegExp(`\\b(\\d{1,2})\\s+(${monthNames})(?:\\s+(20\\d{2}))?\\b`));
    if (named) {
      let year = named[3] ? Number(named[3]) : now.getUTCFullYear();
      candidate = atFollowupHour(year, MONTHS[named[2]], Number(named[1]));
      if (candidate && !named[3] && candidate.getTime() <= now.getTime()) {
        year += 1;
        candidate = atFollowupHour(year, MONTHS[named[2]], Number(named[1]));
      }
    }
  }

  if (!candidate && /\b(i morgen|imorgen|tomorrow)\b/.test(text)) candidate = addUtcDays(now, 1);

  if (!candidate) {
    const days = text.match(/\bom\s+(\d{1,3})\s+dager?\b/);
    if (days) candidate = addUtcDays(now, Number(days[1]));
  }

  if (!candidate && /\bom\s+en\s+dag\b/.test(text)) candidate = addUtcDays(now, 1);

  if (!candidate) {
    const weeks = text.match(/\bom\s+(\d{1,2})\s+uker?\b/);
    if (weeks) candidate = addUtcDays(now, Number(weeks[1]) * 7);
  }

  if (!candidate && /\b(neste uke|om en uke)\b/.test(text)) candidate = addUtcDays(now, 7);

  if (!candidate) {
    const weekdayNames = Object.keys(WEEKDAYS).join("|");
    const weekday = text.match(new RegExp(`\\bneste\\s+(${weekdayNames})\\b`));
    if (weekday) {
      const target = WEEKDAYS[weekday[1]];
      const current = now.getUTCDay();
      let delta = (target - current + 7) % 7;
      if (delta === 0) delta = 7;
      candidate = addUtcDays(now, delta);
    }
  }

  if (!candidate || !Number.isFinite(candidate.getTime())) return null;
  const horizon = candidate.getTime() - now.getTime();
  if (horizon <= 0 || horizon > 370 * 24 * 60 * 60 * 1000) return null;
  return candidate.toISOString();
}

function contactMatchScore(message: string, contact: NexusActionContact): number {
  const name = normalize(contact.name);
  if (!name) return 0;
  if (message.includes(name)) return 100 + name.length;

  const tokens = name.split(" ").filter((token) => token.length >= 4);
  return tokens.reduce((score, token) => score + (message.includes(` ${token} `) || message.startsWith(`${token} `) || message.endsWith(` ${token}`) ? 10 : 0), 0);
}

export function resolveNexusActionContact(args: {
  message: string;
  currentContact?: NexusActionContact | null;
  contacts: NexusActionContact[];
  requireEmail?: boolean;
  requireContactable?: boolean;
}): NexusActionContact | null {
  const normalized = normalize(args.message);
  const text = ` ${normalized} `;
  const eligible = args.requireContactable === false
    ? eligibleInternalContact
    : args.requireEmail === false
      ? eligibleBaseContact
      : eligibleEmailContact;
  const scored = args.contacts
    .filter(eligible)
    .map((contact) => ({ contact, score: contactMatchScore(text, contact) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);

  if (scored.length > 0) {
    if (scored.length > 1 && scored[0].score === scored[1].score) return null;
    return scored[0].contact;
  }

  // An explicit named target must resolve above. Never silently substitute the
  // customer whose page happens to be open when "til/med/for/på Knut" is unknown.
  const explicitUnresolvedTarget = /\b(?:til|med|for|pa)\s+(?!denne\b|kunden\b|kunde\b)([a-z0-9]{3,})\b/.test(normalized);
  if (explicitUnresolvedTarget) return null;

  if (eligible(args.currentContact)) return args.currentContact;
  return null;
}

export function buildNexusActionProposals(args: {
  message: string;
  currentContact?: NexusActionContact | null;
  contacts: NexusActionContact[];
  now?: Date;
}): NexusActionProposal[] {
  const requestText = args.message.trim();

  const emailUpdate = extractCustomerEmailUpdate(requestText);
  if (emailUpdate) {
    const contact = resolveNexusActionContact({ ...args, requireEmail: false, requireContactable: false });
    if (!contact) return [];
    const contactName = String(contact.name || contact.email || "kunden");
    const id = `nexus_action_${sha256(`update_customer_email:${contact.id}:${emailUpdate}:${normalize(requestText)}`).slice(0, 24)}`;
    return [{
      id,
      type: "update_customer_email",
      label: `${contact.email ? "Endre" : "Legg til"} e-post for ${contactName}`,
      description: `Oppdaterer kun kundens e-postadresse til ${emailUpdate}. Ingen melding sendes, og pipeline endres ikke.`,
      endpoint: "/api/nexus/contact-field-action",
      method: "POST",
      contactId: contact.id,
      contactName,
      requestText,
      requiresApproval: false,
      field: "email",
      fieldValue: emailUpdate,
    }];
  }

  const phoneUpdate = extractCustomerPhoneUpdate(requestText);
  if (phoneUpdate) {
    const contact = resolveNexusActionContact({ ...args, requireEmail: false, requireContactable: false });
    if (!contact) return [];
    const contactName = String(contact.name || contact.email || "kunden");
    const id = `nexus_action_${sha256(`update_customer_phone:${contact.id}:${phoneUpdate}:${normalize(requestText)}`).slice(0, 24)}`;
    return [{
      id,
      type: "update_customer_phone",
      label: `${contact.phone ? "Endre" : "Legg til"} telefon for ${contactName}`,
      description: `Oppdaterer kun kundens telefonnummer til ${phoneUpdate}. Ingen melding sendes, og pipeline endres ikke.`,
      endpoint: "/api/nexus/contact-field-action",
      method: "POST",
      contactId: contact.id,
      contactName,
      requestText,
      requiresApproval: false,
      field: "phone",
      fieldValue: phoneUpdate,
    }];
  }

  if (messageRequestsFollowupSchedule(requestText)) {
    const scheduledFor = parseFollowupDate(requestText, args.now);
    if (!scheduledFor) return [];
    const contact = resolveNexusActionContact({ ...args, requireEmail: false });
    if (!contact) return [];
    if (["WON", "LOST"].includes(String(contact.pipeline_status || "").toUpperCase())) return [];

    const contactName = String(contact.name || contact.email || "kunden");
    const id = `nexus_action_${sha256(`schedule_customer_followup:${contact.id}:${scheduledFor}:${normalize(requestText)}`).slice(0, 24)}`;
    const dateLabel = scheduledFor.slice(0, 10).split("-").reverse().join(".");
    return [{
      id,
      type: "schedule_customer_followup",
      label: `Planlegg oppfølging med ${contactName} – ${dateLabel}`,
      description: "Legger inn en intern CRM-oppfølging og et tidslinjenotat. Ingen melding sendes til kunden.",
      endpoint: "/api/nexus/actions",
      method: "POST",
      contactId: contact.id,
      contactName,
      requestText,
      requiresApproval: false,
      scheduledFor,
    }];
  }

  if (messageRequestsCustomerNote(requestText)) {
    const contact = resolveNexusActionContact({ ...args, requireEmail: false, requireContactable: false });
    if (!contact) return [];
    const contactName = String(contact.name || contact.email || "kunden");
    const id = `nexus_action_${sha256(`add_customer_note:${contact.id}:${normalize(requestText)}`).slice(0, 24)}`;
    return [{
      id,
      type: "add_customer_note",
      label: `Legg inn CRM-notat på ${contactName}`,
      description: "Lagrer brukerens instruksjon som et internt CRM-notat. Ingen melding sendes til kunden.",
      endpoint: "/api/nexus/actions",
      method: "POST",
      contactId: contact.id,
      contactName,
      requestText,
      requiresApproval: false,
    }];
  }

  if (messageRequestsCustomerTask(requestText)) {
    const contact = resolveNexusActionContact({ ...args, requireEmail: false });
    if (!contact) return [];
    if (["WON", "LOST"].includes(String(contact.pipeline_status || "").toUpperCase())) return [];
    const contactName = String(contact.name || contact.email || "kunden");
    const scheduledFor = parseFollowupDate(requestText, args.now) || undefined;
    const id = `nexus_action_${sha256(`create_customer_task:${contact.id}:${scheduledFor || "undated"}:${normalize(requestText)}`).slice(0, 24)}`;
    return [{
      id,
      type: "create_customer_task",
      label: `Opprett intern oppgave for ${contactName}`,
      description: scheduledFor
        ? `Oppretter en intern kundeoppgave med forfall ${scheduledFor.slice(0, 10)}. Ingen melding sendes til kunden.`
        : "Oppretter en intern kundeoppgave uten å kontakte kunden.",
      endpoint: "/api/nexus/actions",
      method: "POST",
      contactId: contact.id,
      contactName,
      requestText,
      requiresApproval: false,
      ...(scheduledFor ? { scheduledFor } : {}),
    }];
  }

  if (!messageRequestsCustomerEmail(requestText)) return [];
  const contact = resolveNexusActionContact({ ...args, requireEmail: true });
  if (!contact) return [];

  const contactName = String(contact.name || contact.email || "kunden");
  const id = `nexus_action_${sha256(`prepare_customer_email:${contact.id}:${normalize(requestText)}`).slice(0, 24)}`;

  return [{
    id,
    type: "prepare_customer_email",
    label: `Forbered oppfølging til ${contactName}`,
    description: "Lager et e-postutkast og legger sendingen i Approval Center. Ingenting sendes ved dette klikket.",
    endpoint: "/api/nexus/actions",
    method: "POST",
    contactId: contact.id,
    contactName,
    requestText,
    requiresApproval: true,
  }];
}

export function isAllowedNexusActionType(value: unknown): value is NexusGovernedActionType {
  return NEXUS_GOVERNED_ACTION_TYPES.includes(value as NexusGovernedActionType);
}
