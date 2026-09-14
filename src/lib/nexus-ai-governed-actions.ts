import { sha256 } from "@/lib/agentic/ids";

export const NEXUS_GOVERNED_ACTION_TYPES = ["prepare_customer_email"] as const;
export type NexusGovernedActionType = (typeof NEXUS_GOVERNED_ACTION_TYPES)[number];

export interface NexusActionContact {
  id: string;
  name?: string | null;
  email?: string | null;
  brand_id?: string | null;
  brand?: string | null;
  email_suppressed?: boolean | null;
  do_not_contact?: boolean | null;
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
  requiresApproval: true;
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

function eligibleContact(contact: NexusActionContact | null | undefined): contact is NexusActionContact {
  return Boolean(
    contact?.id
    && contact.email
    && !contact.email_suppressed
    && !contact.do_not_contact,
  );
}

export function messageRequestsCustomerEmail(message: string): boolean {
  const text = normalize(message);
  if (!text || /^(hvordan|hvor|hva er|forklar)\b/.test(text)) return false;

  const directVerb = /\b(lag|skriv|forbered|klargjor|utarbeid|send|svar|folg opp|kontakte|kontakt)\b/.test(text);
  const communicationTarget = /\b(e post|epost|email|mail|melding|oppfolging|svar|kunden|kunde)\b/.test(text);
  return directVerb && communicationTarget;
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
}): NexusActionContact | null {
  const normalized = normalize(args.message);
  const text = ` ${normalized} `;
  const scored = args.contacts
    .filter(eligibleContact)
    .map((contact) => ({ contact, score: contactMatchScore(text, contact) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);

  if (scored.length > 0) {
    if (scored.length > 1 && scored[0].score === scored[1].score) return null;
    return scored[0].contact;
  }

  // "til Knut" is an explicit target. If Knut could not be resolved above,
  // never silently substitute the customer whose page happens to be open.
  const explicitUnresolvedTarget = /\btil\s+(?!denne\b|kunden\b|kunde\b)([a-z0-9]{3,})\b/.test(normalized);
  if (explicitUnresolvedTarget) return null;

  if (eligibleContact(args.currentContact)) return args.currentContact;
  return null;
}

export function buildNexusActionProposals(args: {
  message: string;
  currentContact?: NexusActionContact | null;
  contacts: NexusActionContact[];
}): NexusActionProposal[] {
  if (!messageRequestsCustomerEmail(args.message)) return [];
  const contact = resolveNexusActionContact(args);
  if (!contact) return [];

  const contactName = String(contact.name || contact.email || "kunden");
  const requestText = args.message.trim();
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
