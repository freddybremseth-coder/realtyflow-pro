import { buildLeadCustomerPresentationPreview } from "@/services/lead-intelligence/presentation-preview";

export const COMMUNICATION_BRANDS = ["zeneco", "soleada", "pinosoecolife"] as const;
export type CommunicationBrand = (typeof COMMUNICATION_BRANDS)[number];
export type CommunicationDraftStatus = "DRAFT" | "APPROVED" | "CANCELLED";
export type CommunicationPriority = "HIGH" | "MEDIUM" | "LOW";
export type ManualCommunicationChannel = "EMAIL" | "WHATSAPP";

export const COMMUNICATION_BRAND_LABELS: Record<CommunicationBrand, string> = {
  zeneco: "Zen Eco Homes",
  soleada: "Soleada.no",
  pinosoecolife: "Pinoso EcoLife",
};

export interface CommunicationWorkspaceInput {
  contacts: any[];
  profiles: any[];
  shortlists: any[];
  presentations: any[];
  drafts: any[];
  warnings?: string[];
  now?: Date;
}

export interface CommunicationDependencyState {
  profileApproved: boolean;
  shortlistApproved: boolean;
  presentationApproved: boolean;
  sameBrand: boolean;
  contactLinked: boolean;
}

export interface ManualSendState {
  emailLoggedAt: string | null;
  whatsappLoggedAt: string | null;
}

export interface CommunicationItem {
  id: string;
  brandId: CommunicationBrand;
  brandLabel: string;
  buyerProfileId: string;
  shortlistId: string;
  presentationId: string;
  contactId: string | null;
  customerName: string;
  recipientEmail: string | null;
  recipientPhone: string | null;
  whatsappNumber: string | null;
  status: CommunicationDraftStatus;
  subject: string;
  bodyText: string;
  bodyHtml: string | null;
  language: string | null;
  createdAt: string;
  updatedAt: string;
  approvedAt: string | null;
  approvedBy: string | null;
  cancelledAt: string | null;
  ageDays: number;
  priority: CommunicationPriority;
  dependencies: CommunicationDependencyState;
  approvalReady: boolean;
  approvalBlockers: string[];
  preflightWarnings: string[];
  propertyLinks: Array<{ title: string; url: string }>;
  whatsappCopy: string;
  manualEmailReady: boolean;
  manualWhatsAppReady: boolean;
  manualSend: ManualSendState;
  recommendedAction: string;
  customerHref: string | null;
  reviewHref: string;
}

export interface CommunicationWorkspace {
  generatedAt: string;
  summary: {
    total: number;
    drafts: number;
    readyForApproval: number;
    blockedDrafts: number;
    approved: number;
    cancelled: number;
    manualEmailReady: number;
    manualWhatsAppReady: number;
    manuallyLogged: number;
  };
  items: CommunicationItem[];
  warnings: string[];
  safety: {
    providerSendAvailable: false;
    automaticSending: false;
    whatsappIsDerivedCopy: true;
    explicitApprovalRequired: true;
  };
}

function clean(value: unknown) {
  return String(value || "").trim();
}

function token(value: unknown) {
  return clean(value)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

function brandId(value: unknown): CommunicationBrand | null {
  const normalized = token(value);
  if (normalized === "zeneco" || normalized === "zenecohomes") return "zeneco";
  if (normalized === "soleada" || normalized === "soleadano") return "soleada";
  if (normalized === "pinosoecolife" || normalized === "pinosoeco") return "pinosoecolife";
  return null;
}

function status(value: unknown): CommunicationDraftStatus {
  const normalized = clean(value).toUpperCase();
  if (normalized === "APPROVED") return "APPROVED";
  if (normalized === "CANCELLED" || normalized === "CANCELED") return "CANCELLED";
  return "DRAFT";
}

function isApproved(value: unknown) {
  return clean(value).toLowerCase() === "approved";
}

function iso(value: unknown, fallback = new Date(0).toISOString()) {
  const date = new Date(String(value || ""));
  return Number.isNaN(date.getTime()) ? fallback : date.toISOString();
}

function nullableIso(value: unknown) {
  if (!value) return null;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function validEmail(value: unknown) {
  const email = clean(value).toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

export function normalizeWhatsAppNumber(value: unknown) {
  const raw = clean(value);
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 8 || digits.length > 15) return null;
  return digits;
}

function contactName(contact: any, profile: any) {
  return clean(contact?.name || contact?.email || profile?.summary) || "Ukjent kunde";
}

function dependencyBrand(row: any) {
  return brandId(row?.brand_id || row?.brand);
}

function interactionRows(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is Record<string, any> => Boolean(item && typeof item === "object"))
    : [];
}

function manualSendState(interactions: unknown, draftId: string): ManualSendState {
  let emailLoggedAt: string | null = null;
  let whatsappLoggedAt: string | null = null;
  for (const row of interactionRows(interactions)) {
    const metadata = row.metadata && typeof row.metadata === "object" ? row.metadata as Record<string, unknown> : {};
    const action = clean(row.action || metadata.action).toLowerCase();
    if (action !== "communication_manual_send_logged") continue;
    if (clean(metadata.draft_id || row.draft_id) !== draftId) continue;
    const channel = clean(metadata.channel || row.channel).toUpperCase();
    const occurredAt = nullableIso(row.date || row.created_at || metadata.sent_at);
    if (!occurredAt) continue;
    if (channel === "EMAIL" && (!emailLoggedAt || occurredAt > emailLoggedAt)) emailLoggedAt = occurredAt;
    if (channel === "WHATSAPP" && (!whatsappLoggedAt || occurredAt > whatsappLoggedAt)) whatsappLoggedAt = occurredAt;
  }
  return { emailLoggedAt, whatsappLoggedAt };
}

function uniqueTexts(values: Array<string | null | undefined>) {
  return [...new Set(values.map((value) => clean(value)).filter(Boolean))];
}

export function buildWhatsAppCopy(bodyText: string, presentationJson: unknown, maxLength = 4000) {
  const preview = buildLeadCustomerPresentationPreview(presentationJson);
  let text = clean(bodyText)
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n");

  const links = preview.properties
    .map((property) => property.publicUrl)
    .filter((value): value is string => Boolean(value));
  const missingLinks = links.filter((url) => !text.includes(url));
  if (missingLinks.length > 0) {
    text = `${text}\n\n${missingLinks.join("\n")}`.trim();
  }

  if (text.length <= maxLength) return text;
  const suffix = "\n\n[WhatsApp-kopien er forkortet. Kontroller resten i e-postutkastet.]";
  return `${text.slice(0, Math.max(1, maxLength - suffix.length)).trimEnd()}${suffix}`;
}

function priorityFor(item: Pick<CommunicationItem, "status" | "approvalReady" | "manualSend" | "manualEmailReady" | "manualWhatsAppReady">): CommunicationPriority {
  if (item.status === "APPROVED" && (item.manualEmailReady || item.manualWhatsAppReady) && (!item.manualSend.emailLoggedAt || !item.manualSend.whatsappLoggedAt)) return "HIGH";
  if (item.status === "DRAFT" && item.approvalReady) return "HIGH";
  if (item.status === "DRAFT") return "MEDIUM";
  return "LOW";
}

function recommendation(item: Pick<CommunicationItem, "status" | "approvalReady" | "approvalBlockers" | "manualEmailReady" | "manualWhatsAppReady" | "manualSend">) {
  if (item.status === "CANCELLED") return "Utkastet er avsluttet. Opprett en ny versjon i Lead Intelligence dersom kommunikasjonen skal tas opp igjen.";
  if (item.status === "DRAFT" && !item.approvalReady) return `Løs blokkeringene før godkjenning: ${item.approvalBlockers.join(" ")}`;
  if (item.status === "DRAFT") return "Les hele teksten, kontroller mottaker og boliglenker, rediger ved behov og godkjenn eksplisitt.";
  if (item.manualEmailReady && !item.manualSend.emailLoggedAt) return "Åpne e-postklienten manuelt. Etter faktisk utsending kan handlingen registreres i kundetidslinjen.";
  if (item.manualWhatsAppReady && !item.manualSend.whatsappLoggedAt) return "Kontroller den avledede WhatsApp-kopien, åpne WhatsApp manuelt og registrer handlingen etter faktisk utsending.";
  return "Den manuelle kommunikasjonen er registrert. Behold utkastet som revisjonsspor.";
}

export function buildCommunicationWorkspace(input: CommunicationWorkspaceInput): CommunicationWorkspace {
  const now = input.now || new Date();
  const contacts = new Map(input.contacts.map((row) => [clean(row.id), row]));
  const profiles = new Map(input.profiles.map((row) => [clean(row.id), row]));
  const shortlists = new Map(input.shortlists.map((row) => [clean(row.id), row]));
  const presentations = new Map(input.presentations.map((row) => [clean(row.id), row]));
  const items: CommunicationItem[] = [];

  for (const draft of input.drafts) {
    const draftBrand = brandId(draft.brand);
    if (!draftBrand) continue;
    const profile = profiles.get(clean(draft.buyer_profile_id));
    const shortlist = shortlists.get(clean(draft.shortlist_id));
    const presentation = presentations.get(clean(draft.presentation_id));
    const contact = profile?.contact_id ? contacts.get(clean(profile.contact_id)) : null;
    const contactBrand = contact ? dependencyBrand(contact) : null;
    const profileBrand = dependencyBrand(profile);
    const shortlistBrand = dependencyBrand(shortlist);
    const presentationBrand = dependencyBrand(presentation);
    const sameBrand = [profileBrand, shortlistBrand, presentationBrand, contactBrand]
      .filter(Boolean)
      .every((value) => value === draftBrand);

    const recipientEmail = validEmail(contact?.email);
    const recipientPhone = clean(contact?.phone) || null;
    const whatsappNumber = normalizeWhatsAppNumber(recipientPhone);
    const preview = buildLeadCustomerPresentationPreview(presentation?.presentation_json);
    const propertyLinks = preview.properties
      .filter((property) => Boolean(property.publicUrl))
      .map((property) => ({ title: property.title, url: property.publicUrl as string }));
    const propertiesWithoutLinks = preview.properties.filter((property) => !property.publicUrl);
    const dependencies: CommunicationDependencyState = {
      profileApproved: isApproved(profile?.status),
      shortlistApproved: isApproved(shortlist?.status),
      presentationApproved: isApproved(presentation?.status),
      sameBrand,
      contactLinked: Boolean(contact?.id),
    };

    const approvalBlockers = uniqueTexts([
      dependencies.contactLinked ? null : "Kjøperprofilen mangler koblet CRM-kontakt.",
      dependencies.sameBrand ? null : "Kontakt eller underlag tilhører et annet brand.",
      dependencies.profileApproved ? null : "Kjøperprofilen må være godkjent.",
      dependencies.shortlistApproved ? null : "Shortlisten må være godkjent.",
      dependencies.presentationApproved ? null : "Presentasjonen må være godkjent.",
      recipientEmail ? null : "En gyldig e-postadresse mangler.",
      clean(draft.subject) ? null : "Emnefeltet mangler.",
      clean(draft.body_text) ? null : "Meldingsteksten mangler.",
      preview.properties.length > 0 ? null : "Presentasjonen inneholder ingen boliger.",
      propertiesWithoutLinks.length === 0 ? null : `${propertiesWithoutLinks.length} bolig(er) mangler verifisert offentlig lenke.`,
    ]);

    const preflightWarnings = uniqueTexts([
      ...preview.verification,
      ...preview.properties.flatMap((property) => property.questionsToVerify),
      ...preview.properties.flatMap((property) => property.concerns),
      whatsappNumber ? null : "WhatsApp kan ikke åpnes før et gyldig internasjonalt telefonnummer er registrert.",
      draft.body_html ? null : "HTML-versjon mangler; manuell e-post bruker ren tekst.",
      "Direkte leverandørsending er deaktivert. Utsending skjer bare via brukerens egen e-post- eller WhatsApp-klient.",
    ]);

    const createdAt = iso(draft.created_at || draft.updated_at);
    const updatedAt = iso(draft.updated_at || draft.created_at, createdAt);
    const draftStatus = status(draft.status);
    const manualSend = manualSendState(contact?.interactions, clean(draft.id));
    const approvalReady = draftStatus === "DRAFT" && approvalBlockers.length === 0;
    const whatsappCopy = buildWhatsAppCopy(clean(draft.body_text), presentation?.presentation_json);
    const manualEmailReady = draftStatus === "APPROVED" && Boolean(recipientEmail) && approvalBlockers.length === 0;
    const manualWhatsAppReady = draftStatus === "APPROVED" && Boolean(whatsappNumber) && clean(whatsappCopy).length > 0 && dependencies.sameBrand;

    const base = {
      id: clean(draft.id),
      brandId: draftBrand,
      brandLabel: COMMUNICATION_BRAND_LABELS[draftBrand],
      buyerProfileId: clean(draft.buyer_profile_id),
      shortlistId: clean(draft.shortlist_id),
      presentationId: clean(draft.presentation_id),
      contactId: contact?.id ? clean(contact.id) : null,
      customerName: contactName(contact, profile),
      recipientEmail,
      recipientPhone,
      whatsappNumber,
      status: draftStatus,
      subject: clean(draft.subject),
      bodyText: clean(draft.body_text),
      bodyHtml: clean(draft.body_html) || null,
      language: clean(draft.language) || null,
      createdAt,
      updatedAt,
      approvedAt: nullableIso(draft.approved_at),
      approvedBy: clean(draft.approved_by) || null,
      cancelledAt: nullableIso(draft.cancelled_at),
      ageDays: Math.max(0, Math.floor((now.getTime() - new Date(createdAt).getTime()) / 86_400_000)),
      dependencies,
      approvalReady,
      approvalBlockers,
      preflightWarnings,
      propertyLinks,
      whatsappCopy,
      manualEmailReady,
      manualWhatsAppReady,
      manualSend,
      customerHref: contact?.id ? `/customers/${encodeURIComponent(contact.id)}` : null,
      reviewHref: `/lead-intelligence?buyerProfileId=${encodeURIComponent(draft.buyer_profile_id)}`,
    };
    const priority = priorityFor(base);
    items.push({ ...base, priority, recommendedAction: recommendation(base) });
  }

  const rank: Record<CommunicationPriority, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };
  items.sort((a, b) => rank[a.priority] - rank[b.priority] || b.ageDays - a.ageDays || b.updatedAt.localeCompare(a.updatedAt));

  return {
    generatedAt: now.toISOString(),
    summary: {
      total: items.length,
      drafts: items.filter((item) => item.status === "DRAFT").length,
      readyForApproval: items.filter((item) => item.approvalReady).length,
      blockedDrafts: items.filter((item) => item.status === "DRAFT" && !item.approvalReady).length,
      approved: items.filter((item) => item.status === "APPROVED").length,
      cancelled: items.filter((item) => item.status === "CANCELLED").length,
      manualEmailReady: items.filter((item) => item.manualEmailReady && !item.manualSend.emailLoggedAt).length,
      manualWhatsAppReady: items.filter((item) => item.manualWhatsAppReady && !item.manualSend.whatsappLoggedAt).length,
      manuallyLogged: items.filter((item) => Boolean(item.manualSend.emailLoggedAt || item.manualSend.whatsappLoggedAt)).length,
    },
    items,
    warnings: input.warnings || [],
    safety: {
      providerSendAvailable: false,
      automaticSending: false,
      whatsappIsDerivedCopy: true,
      explicitApprovalRequired: true,
    },
  };
}
