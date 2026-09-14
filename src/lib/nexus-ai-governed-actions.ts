import { sha256 } from "@/lib/agentic/ids";

export const NEXUS_GOVERNED_ACTION_TYPES = ["prepare_customer_email", "schedule_customer_followup"] as const;
export type NexusGovernedActionType = (typeof NEXUS_GOVERNED_ACTION_TYPES)[number];

export interface NexusActionContact {
  id: string;
  name?: string | null;
  email?: string | null;
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
  endpoint: "/api/nexus/actions";
  method: "POST";
  contactId: string;
  contactName: string;
  requestText: string;
  requiresApproval: boolean;
  scheduledFor?: string;
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

function eligibleBaseContact(contact: NexusActionContact | null | undefined): contact is NexusActionContact {
  return Boolean(
    contact?.id
    && !contact.email_suppressed
    && !contact.do_not_contact,
  );
}

function eligibleEmailContact(contact: NexusActionContact | null | undefined): contact is NexusActionContact {
  return Boolean(eligibleBaseContact(contact) && contact.email);
}

export function messageRequestsCustomerEmail(message: string): boolean {
  const text = normalize(message);
  if (!text || /^(hvordan|hvor|hva er|forklar)\b/.test(text)) return false;

  const directVerb = /\b(lag|skriv|forbered|klargjor|utarbeid|send|svar|folg opp|kontakte|kontakt)\b/.test(text);
  const communicationTarget = /\b(e post|epost|email|mail|melding|oppfolging|svar|kunden|kunde)\b/.test(text);
  return directVerb && communicationTarget;
}

export function messageRequestsFollowupSchedule(message: string): boolean {
  const text = normalize(message);
  if (!text || /^(hvordan|hvor|hva er|forklar)\b/.test(text)) return false;
  const scheduleVerb = /\b(planlegg|sett|legg inn|minn meg|schedule|plan)\b/.test(text);
  const target = /\b(oppfolging|follow up|kontakt|ringe|ring|kunde|kunden)\b/.test(text);
  return scheduleVerb && target;
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
}): NexusActionContact | null {
  const normalized = normalize(args.message);
  const text = ` ${normalized} `;
  const eligible = args.requireEmail === false ? eligibleBaseContact : eligibleEmailContact;
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
  // customer whose page happens to be open when "til/med/for Knut" is unknown.
  const explicitUnresolvedTarget = /\b(?:til|med|for)\s+(?!denne\b|kunden\b|kunde\b)([a-z0-9]{3,})\b/.test(normalized);
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
