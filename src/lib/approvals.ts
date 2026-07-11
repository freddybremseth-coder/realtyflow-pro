export type ApprovalItemType = "buyer_profile" | "shortlist" | "presentation" | "message_draft";

export interface ApprovalQueueInput {
  profiles: any[];
  shortlists: any[];
  presentations: any[];
  messageDrafts: any[];
  contacts: any[];
}

export interface ApprovalItem {
  id: string;
  type: ApprovalItemType;
  brandId: string;
  title: string;
  summary: string | null;
  createdAt: string;
  ageDays: number;
  ready: boolean;
  blocker: string | null;
  buyerProfileId: string | null;
  contactId: string | null;
  customerName: string;
  reviewHref: string;
  customerHref: string | null;
}

const TYPE_WEIGHT: Record<ApprovalItemType, number> = {
  buyer_profile: 4,
  shortlist: 3,
  presentation: 2,
  message_draft: 1,
};

function text(value: unknown, fallback = "") {
  const normalized = String(value || "").trim();
  return normalized || fallback;
}

function validDate(value: unknown) {
  const date = new Date(String(value || ""));
  return Number.isNaN(date.getTime()) ? new Date(0) : date;
}

function ageDays(value: unknown, now: Date) {
  const created = validDate(value);
  return Math.max(0, Math.floor((now.getTime() - created.getTime()) / 86_400_000));
}

export function buildApprovalQueue(input: ApprovalQueueInput, now = new Date()): ApprovalItem[] {
  const contacts = new Map(input.contacts.map((row) => [String(row.id), row]));
  const profiles = new Map(input.profiles.map((row) => [String(row.id), row]));
  const shortlists = new Map(input.shortlists.map((row) => [String(row.id), row]));
  const presentations = new Map(input.presentations.map((row) => [String(row.id), row]));
  const items: ApprovalItem[] = [];

  function identity(profile: any) {
    const contact = profile?.contact_id ? contacts.get(String(profile.contact_id)) : null;
    return {
      contactId: contact?.id ? String(contact.id) : profile?.contact_id ? String(profile.contact_id) : null,
      customerName: text(contact?.name || contact?.email || profile?.summary, "Ukjent kunde"),
    };
  }

  for (const profile of input.profiles.filter((row) => row.status === "draft")) {
    const person = identity(profile);
    const createdAt = validDate(profile.created_at || profile.updated_at).toISOString();
    items.push({
      id: String(profile.id),
      type: "buyer_profile",
      brandId: text(profile.brand, "zeneco"),
      title: "Kjøperprofil venter på gjennomgang",
      summary: text(profile.summary) || null,
      createdAt,
      ageDays: ageDays(createdAt, now),
      ready: true,
      blocker: null,
      buyerProfileId: String(profile.id),
      contactId: person.contactId,
      customerName: person.customerName,
      reviewHref: `/lead-intelligence?buyerProfileId=${encodeURIComponent(profile.id)}`,
      customerHref: person.contactId ? `/customers/${encodeURIComponent(person.contactId)}` : null,
    });
  }

  for (const shortlist of input.shortlists.filter((row) => row.status === "draft")) {
    const profile = profiles.get(String(shortlist.buyer_profile_id));
    const person = identity(profile);
    const ready = profile?.status === "approved";
    const createdAt = validDate(shortlist.created_at || shortlist.updated_at).toISOString();
    items.push({
      id: String(shortlist.id),
      type: "shortlist",
      brandId: text(shortlist.brand || profile?.brand, "zeneco"),
      title: text(shortlist.title, "Shortlist venter på godkjenning"),
      summary: "Kontroller eiendommer, rangering, bekymringer og spørsmål før presentasjon.",
      createdAt,
      ageDays: ageDays(createdAt, now),
      ready,
      blocker: ready ? null : "Kjøperprofilen må godkjennes først.",
      buyerProfileId: profile?.id ? String(profile.id) : null,
      contactId: person.contactId,
      customerName: person.customerName,
      reviewHref: `/lead-intelligence?buyerProfileId=${encodeURIComponent(profile?.id || shortlist.buyer_profile_id)}`,
      customerHref: person.contactId ? `/customers/${encodeURIComponent(person.contactId)}` : null,
    });
  }

  for (const presentation of input.presentations.filter((row) => row.status === "draft")) {
    const profile = profiles.get(String(presentation.buyer_profile_id));
    const shortlist = shortlists.get(String(presentation.shortlist_id));
    const person = identity(profile);
    const ready = profile?.status === "approved" && shortlist?.status === "approved";
    const createdAt = validDate(presentation.created_at || presentation.updated_at).toISOString();
    items.push({
      id: String(presentation.id),
      type: "presentation",
      brandId: text(presentation.brand || profile?.brand, "zeneco"),
      title: text(presentation.title, "Kundepresentasjon venter på godkjenning"),
      summary: "Kontroller kundetekst, valgte eiendommer og interne kvalitetsnotater.",
      createdAt,
      ageDays: ageDays(createdAt, now),
      ready,
      blocker: ready ? null : shortlist?.status !== "approved" ? "Shortlisten må godkjennes først." : "Kjøperprofilen må godkjennes først.",
      buyerProfileId: profile?.id ? String(profile.id) : null,
      contactId: person.contactId,
      customerName: person.customerName,
      reviewHref: `/lead-intelligence?buyerProfileId=${encodeURIComponent(profile?.id || presentation.buyer_profile_id)}`,
      customerHref: person.contactId ? `/customers/${encodeURIComponent(person.contactId)}` : null,
    });
  }

  for (const draft of input.messageDrafts.filter((row) => row.status === "draft")) {
    const profile = profiles.get(String(draft.buyer_profile_id));
    const presentation = presentations.get(String(draft.presentation_id));
    const shortlist = shortlists.get(String(draft.shortlist_id));
    const person = identity(profile);
    const ready = profile?.status === "approved" && shortlist?.status === "approved" && presentation?.status === "approved";
    const createdAt = validDate(draft.created_at || draft.updated_at).toISOString();
    items.push({
      id: String(draft.id),
      type: "message_draft",
      brandId: text(draft.brand || profile?.brand, "zeneco"),
      title: text(draft.subject, "E-postutkast venter på godkjenning"),
      summary: "Kontroller mottaker, emne, tekst og boliglenker i Controlled Communications. Ingenting sendes ved godkjenning.",
      createdAt,
      ageDays: ageDays(createdAt, now),
      ready,
      blocker: ready ? null : presentation?.status !== "approved" ? "Presentasjonen må godkjennes først." : shortlist?.status !== "approved" ? "Shortlisten må godkjennes først." : "Kjøperprofilen må godkjennes først.",
      buyerProfileId: profile?.id ? String(profile.id) : null,
      contactId: person.contactId,
      customerName: person.customerName,
      reviewHref: "/communications",
      customerHref: person.contactId ? `/customers/${encodeURIComponent(person.contactId)}` : null,
    });
  }

  return items.sort((a, b) => Number(b.ready) - Number(a.ready) || TYPE_WEIGHT[b.type] - TYPE_WEIGHT[a.type] || b.ageDays - a.ageDays || a.createdAt.localeCompare(b.createdAt));
}

export function approvalSummary(items: ApprovalItem[]) {
  return {
    pending: items.length,
    ready: items.filter((item) => item.ready).length,
    blocked: items.filter((item) => !item.ready).length,
    profiles: items.filter((item) => item.type === "buyer_profile").length,
    shortlists: items.filter((item) => item.type === "shortlist").length,
    presentations: items.filter((item) => item.type === "presentation").length,
    messageDrafts: items.filter((item) => item.type === "message_draft").length,
  };
}
