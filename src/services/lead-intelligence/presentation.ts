import { createHash } from "node:crypto";
import { z } from "zod";
import { BoundedJsonSchema, LEAD_INTELLIGENCE_LIMITS, LanguageCodeSchema } from "./contracts";
import { LeadIntelligenceError } from "./extraction";
import { LeadIntelligenceRealEstateBrandSchema } from "./brand-allowlist";
import {
  type CreateLeadCustomerPresentationDraftInput,
  type LeadCustomerPresentationShortlistSnapshot,
} from "./persistence";
import { buildLeadCustomerPresentationPreview, type LeadCustomerPresentationPreview } from "./presentation-preview";
import { LeadIntelligenceReviewError } from "./review";
import { stableReviewJson } from "./review-shared";

const UUIDSchema = z.string().uuid();
const CorrelationIdSchema = z.string().trim().min(1).max(LEAD_INTELLIGENCE_LIMITS.id);
const IdempotencySeedSchema = z.string().trim().min(1).max(LEAD_INTELLIGENCE_LIMITS.id).optional();

export const LeadCustomerPresentationDraftRequestSchema = z
  .object({
    brand: LeadIntelligenceRealEstateBrandSchema,
    buyerProfileId: UUIDSchema,
    shortlistId: UUIDSchema,
    title: z.string().trim().min(1).max(LEAD_INTELLIGENCE_LIMITS.mediumText).optional().nullable(),
    language: LanguageCodeSchema.optional().nullable(),
    idempotencySeed: IdempotencySeedSchema,
  })
  .strict();

export type LeadCustomerPresentationDraftRequest = z.infer<typeof LeadCustomerPresentationDraftRequestSchema>;

export const LeadCustomerPresentationDraftLookupQuerySchema = z
  .object({
    brand: LeadIntelligenceRealEstateBrandSchema,
    presentationId: UUIDSchema,
  })
  .strict();

export const LeadCustomerPresentationDraftHistoryQuerySchema = z
  .object({
    brand: LeadIntelligenceRealEstateBrandSchema,
    buyerProfileId: UUIDSchema,
    limit: z.coerce.number().int().min(1).max(10).default(5),
  })
  .strict();

export interface LeadCustomerPresentationRepository {
  loadShortlistSnapshotForPresentation(input: {
    brand: string;
    buyerProfileId: string;
    shortlistId: string;
  }): Promise<LeadCustomerPresentationShortlistSnapshot | null>;
  getCustomerPresentationDraft(input: {
    brand: string;
    presentationId: string;
  }): Promise<LeadCustomerPresentationDraftResult | null>;
  listCustomerPresentationDraftHistory(input: {
    brand: string;
    buyerProfileId: string;
    limit: number;
  }): Promise<LeadCustomerPresentationDraftHistoryItem[]>;
  createCustomerPresentationDraft(input: CreateLeadCustomerPresentationDraftInput): Promise<{
    presentationId: string;
    messageDraftId: string | null;
    duplicate: boolean;
    payloadHashMatches: boolean;
  }>;
}

export interface LeadCustomerPresentationDraftHistoryItem {
  presentationId: string;
  shortlistId: string;
  messageDraftId: string;
  status: "draft" | "approved" | "archived";
  messageStatus: "draft" | "approved" | "cancelled";
  title: string;
  subject: string;
  itemCount: number;
  createdAt: string;
  messageDraftCreatedAt: string;
}

export interface LeadCustomerPresentationDraftResult {
  presentationId: string;
  buyerProfileId: string;
  shortlistId: string;
  messageDraftId: string;
  duplicate: boolean;
  conflict: boolean;
  loadedFromHistory?: boolean;
  status: "draft" | "approved" | "archived";
  messageStatus: "draft" | "approved" | "cancelled";
  itemCount: number;
  title: string;
  subject: string;
  presentationPreview: LeadCustomerPresentationPreview;
  messageDraft: {
    subject: string;
    bodyText: string;
    bodyHtml: string | null;
  };
  sideEffects: {
    emailSent: false;
    leadsCreated: false;
    contactsCreated: false;
    propertyMatchingStarted: false;
    presentationPublished: false;
  };
}

function stableHash(value: unknown) {
  return `sha256:v1:${createHash("sha256").update(stableReviewJson(value)).digest("hex")}`;
}

function stableIdempotencyKey(prefix: string, value: unknown) {
  const hash = createHash("sha256").update(stableReviewJson(value)).digest("hex");
  return `${prefix}:v1:${hash}`;
}

function formatCurrency(value: number | null, currency: string | null) {
  if (value === null) return "må avklares";
  return new Intl.NumberFormat("nb-NO", {
    style: "currency",
    currency: currency || "EUR",
    maximumFractionDigits: 0,
  }).format(value);
}

function propertyName(item: LeadCustomerPresentationShortlistSnapshot["items"][number]) {
  return item.propertyTitle || item.propertyReference || item.propertyId;
}

function propertyFacts(item: LeadCustomerPresentationShortlistSnapshot["items"][number]) {
  return [
    item.propertyReference ? `Ref ${item.propertyReference}` : null,
    item.propertyLocation,
    item.propertyPrice === null ? null : formatCurrency(item.propertyPrice, "EUR"),
    item.propertyBedrooms === null ? null : `${item.propertyBedrooms} sov`,
    item.propertyBathrooms === null ? null : `${item.propertyBathrooms} bad`,
  ].filter((value): value is string => Boolean(value));
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function safeWebsiteUrl(value: string | null) {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

function uniqueItems(values: Array<string | null | undefined>, limit = 8) {
  return Array.from(new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value)))).slice(0, limit);
}

function humanizeMatchReason(value: string) {
  const normalized = value.trim().replace(/\s+/g, " ");
  const lower = normalized.toLowerCase();
  const isUnverified = lower.includes("(unverified)") || lower.includes("unverified");

  const suffix = isUnverified ? ", men må verifiseres" : "";
  if (lower.includes("bedrooms matches")) {
    return `Antall soverom ser ut til å passe${suffix}.`;
  }
  if (lower.includes("bathrooms matches")) {
    return `Antall bad ser ut til å passe${suffix}.`;
  }
  if (lower.includes("property_type matches")) {
    return `Boligtypen ser ut til å passe${suffix}.`;
  }
  if (lower.includes("estimated total cost") && lower.includes("within the buyer budget")) {
    return normalized
      .replace(/^Estimated total cost/i, "Estimert totalpris")
      .replace(/ is within the buyer budget\.?$/i, " er innenfor kundens budsjett.");
  }
  const cleaned = normalized
    .replace(/\s*\(unverified\)\.?/gi, "")
    .replace(/\bunverified\b\.?/gi, "")
    .trim()
    .replace(/\.$/, "");
  if (isUnverified && !cleaned) return "Dette punktet må verifiseres.";
  return isUnverified ? `${cleaned}, men må verifiseres.` : normalized;
}

function humanizedReasons(values: string[], limit = 2) {
  return uniqueItems(values.slice(0, limit).map(humanizeMatchReason), limit).join(" ");
}

type MatchReasonKey = "bedrooms" | "bathrooms" | "property_type" | "budget";

function matchReasonKey(value: string): MatchReasonKey | null {
  const lower = value.toLowerCase();
  if (lower.includes("bedrooms matches")) return "bedrooms";
  if (lower.includes("bathrooms matches")) return "bathrooms";
  if (lower.includes("property_type matches")) return "property_type";
  if (lower.includes("estimated total cost") && lower.includes("within the buyer budget")) return "budget";
  return null;
}

function sharedReasonKeys(reasonGroups: string[][]) {
  if (reasonGroups.length < 3) return new Set<MatchReasonKey>();
  const keyedGroups = reasonGroups.map((reasons) => new Set(reasons.map(matchReasonKey).filter((key): key is MatchReasonKey => Boolean(key))));
  const allKeys: MatchReasonKey[] = ["bedrooms", "bathrooms", "property_type", "budget"];
  return new Set(allKeys.filter((key) => keyedGroups.every((group) => group.has(key))));
}

function sharedReasonSummary(sharedKeys: Set<MatchReasonKey>) {
  const parts: string[] = [];
  if (sharedKeys.has("bedrooms") && sharedKeys.has("bathrooms")) {
    parts.push("romfordelingen ser ut til å passe behovet for soverom og bad");
  } else {
    if (sharedKeys.has("bedrooms")) parts.push("antall soverom ser ut til å passe");
    if (sharedKeys.has("bathrooms")) parts.push("antall bad ser ut til å passe");
  }
  if (sharedKeys.has("property_type")) parts.push("boligtypen treffer ønsket type");
  if (sharedKeys.has("budget")) parts.push("prisene ser ut til å ligge innenfor budsjettet");
  if (parts.length === 0) return null;
  return `Felles for forslagene er at ${parts.join(", ")}. Dette må fortsatt bekreftes mot oppdatert prospekt og tilgjengelighet.`;
}

function itemSpecificReasons(values: string[], sharedKeys: Set<MatchReasonKey>, limit = 2) {
  return humanizedReasons(values.filter((value) => {
    const key = matchReasonKey(value);
    return !key || !sharedKeys.has(key);
  }), limit);
}

function buildPresentationJson(input: {
  snapshot: LeadCustomerPresentationShortlistSnapshot;
  title: string;
  language: string | null | undefined;
}) {
  const { snapshot } = input;
  const verification = uniqueItems([
    ...snapshot.items.flatMap((item) => item.concerns.slice(0, 3)),
    ...snapshot.items.flatMap((item) => item.questionsToVerify.slice(0, 3)),
    "Pris, tilgjengelighet og nøkkelfakta må bekreftes før kunden får endelig anbefaling.",
  ]);

  return BoundedJsonSchema.parse({
    version: "lead-customer-presentation-v1",
    title: input.title,
    language: input.language || null,
    buyerProfileId: snapshot.buyerProfileId,
    shortlistId: snapshot.shortlistId,
    summary: snapshot.buyerSummary || "Kundens behov er godkjent i buyer profile.",
    budget: {
      amount: snapshot.budgetAmount,
      currency: snapshot.budgetCurrency || "EUR",
      includesCosts: snapshot.budgetIncludesCosts,
      approximate: snapshot.budgetApproximate,
    },
    sections: [
      {
        type: "needs_summary",
        title: "Kundens behov",
        bullets: uniqueItems([
          snapshot.buyerSummary,
          `Budsjett: ${formatCurrency(snapshot.budgetAmount, snapshot.budgetCurrency)}${snapshot.budgetIncludesCosts ? " inkl. omkostninger" : ""}`,
          snapshot.locationFlexible ? "Område er fleksibelt, men nærområder bør prioriteres." : null,
        ], 6),
      },
      {
        type: "properties",
        title: "Valgte boliger",
        items: snapshot.items.map((item) => ({
          propertyId: item.propertyId,
          reference: item.propertyReference,
          title: propertyName(item),
          location: item.propertyLocation,
          imageUrl: item.propertyPrimaryImageUrl,
          publicUrl: item.propertyPublicUrl,
          facts: propertyFacts(item),
          decision: item.decision,
          systemEligibility: item.systemEligibility,
          score: item.score,
          dataQualityScore: item.dataQualityScore,
          reasons: item.reasons.slice(0, 5),
          concerns: item.concerns.slice(0, 5),
          questionsToVerify: item.questionsToVerify.slice(0, 5),
        })),
      },
      {
        type: "verification",
        title: "Må avklares før deling",
        bullets: verification,
      },
    ],
  });
}

function buildEmailDraft(input: {
  snapshot: LeadCustomerPresentationShortlistSnapshot;
  title: string;
}) {
  const location = input.snapshot.items.map((item) => item.propertyLocation).find(Boolean) || "området vi har vurdert";
  const subject = `Boligforslag: ${input.snapshot.items.length} alternativer i ${location}`;
  const sharedReasons = sharedReasonKeys(input.snapshot.items.map((item) => item.reasons));
  const sharedReasonText = sharedReasonSummary(sharedReasons);
  const missingWebsiteLinks = input.snapshot.items.filter((item) => !safeWebsiteUrl(item.propertyPublicUrl)).length;
  const propertyLines = input.snapshot.items.map((item, index) => {
    const facts = propertyFacts(item).join(" · ");
    const reasons = itemSpecificReasons(item.reasons, sharedReasons, 2);
    const verification = uniqueItems([...item.concerns.slice(0, 2), ...item.questionsToVerify.slice(0, 1)], 3).join(" ");
    const websiteUrl = safeWebsiteUrl(item.propertyPublicUrl);
    return [
      `${index + 1}. ${propertyName(item)}${facts ? ` (${facts})` : ""}`,
      reasons ? `   Aktuelt fordi: ${reasons}` : null,
      verification ? `   Må avklares: ${verification}` : null,
      websiteUrl ? `   Se boligen på nettsiden: ${websiteUrl}` : null,
    ].filter(Boolean).join("\n");
  });
  const closingChecks = uniqueItems([
    "Pris, tilgjengelighet og enkelte detaljer må bekreftes før vi går videre.",
    missingWebsiteLinks > 0 ? "Boliglenker kontrolleres før endelig sending." : null,
  ], 2);

  const bodyText = [
    "Hei,",
    "",
    "Jeg har sett gjennom aktuelle boliger opp mot behovene vi har notert så langt.",
    input.snapshot.budgetAmount === null
      ? "Budsjett må avklares."
      : `Budsjett: ca. ${formatCurrency(input.snapshot.budgetAmount, input.snapshot.budgetCurrency)}${input.snapshot.budgetIncludesCosts ? " inkludert omkostninger" : ""}.`,
    sharedReasonText,
    "",
    "Jeg ville sett nærmere på disse alternativene:",
    ...propertyLines,
    "",
    ...closingChecks,
    "Gi meg gjerne beskjed om hvilke av disse du ønsker at jeg undersøker nærmere.",
    "",
    "Vennlig hilsen",
    "Freddy",
  ].join("\n");

  const propertyHtml = input.snapshot.items
    .map((item, index) => {
      const facts = propertyFacts(item).join(" · ");
      const reasons = itemSpecificReasons(item.reasons, sharedReasons, 2);
      const verification = uniqueItems([...item.concerns.slice(0, 2), ...item.questionsToVerify.slice(0, 1)], 3).join(" ");
      const websiteUrl = safeWebsiteUrl(item.propertyPublicUrl);
      return [
        `<li style="margin:0 0 18px 0;">`,
        `<strong>${index + 1}. ${escapeHtml(propertyName(item))}</strong>`,
        facts ? `<br><span>${escapeHtml(facts)}</span>` : "",
        reasons ? `<br><span><strong>Aktuelt fordi:</strong> ${escapeHtml(reasons)}</span>` : "",
        verification ? `<br><span><strong>Må avklares:</strong> ${escapeHtml(verification)}</span>` : "",
        websiteUrl
          ? `<br><a href="${escapeHtml(websiteUrl)}" target="_blank" rel="noopener noreferrer">Se boligen på nettsiden</a>`
          : "",
        `</li>`,
      ].join("");
    })
    .join("");

  const budgetLine =
    input.snapshot.budgetAmount === null
      ? "Budsjett må avklares."
      : `Budsjett: ca. ${formatCurrency(input.snapshot.budgetAmount, input.snapshot.budgetCurrency)}${input.snapshot.budgetIncludesCosts ? " inkludert omkostninger" : ""}.`;

  const bodyHtml = [
    `<p>Hei,</p>`,
    `<p>Jeg har sett gjennom aktuelle boliger opp mot behovene vi har notert så langt.</p>`,
    `<p>${escapeHtml(budgetLine)}</p>`,
    sharedReasonText ? `<p>${escapeHtml(sharedReasonText)}</p>` : "",
    `<p>Jeg ville sett nærmere på disse alternativene:</p>`,
    `<ol style="padding-left:20px;margin:0 0 16px 0;">${propertyHtml}</ol>`,
    `<p>${closingChecks.map(escapeHtml).join("<br>")}</p>`,
    `<p>Gi meg gjerne beskjed om hvilke av disse du ønsker at jeg undersøker nærmere.</p>`,
    `<p>Vennlig hilsen<br>Freddy</p>`,
  ].join("");

  return {
    subject,
    bodyText,
    bodyHtml,
  };
}

export async function saveLeadCustomerPresentationDraft(input: {
  request: LeadCustomerPresentationDraftRequest;
  correlationId: string;
  createdBy: string;
  repository: LeadCustomerPresentationRepository;
}): Promise<LeadCustomerPresentationDraftResult> {
  const correlationId = CorrelationIdSchema.parse(input.correlationId);
  const request = LeadCustomerPresentationDraftRequestSchema.parse(input.request);
  const snapshot = await input.repository.loadShortlistSnapshotForPresentation({
    brand: request.brand,
    buyerProfileId: request.buyerProfileId,
    shortlistId: request.shortlistId,
  });

  if (!snapshot || snapshot.items.length === 0) {
    throw new LeadIntelligenceError(
      "INVALID_REQUEST",
      "A draft shortlist with selected properties is required before creating a presentation draft",
      400,
    );
  }

  const title = request.title || snapshot.shortlistTitle || `Kundepresentasjon ${new Date().toISOString().slice(0, 10)}`;
  const presentationJson = buildPresentationJson({
    snapshot,
    title,
    language: request.language,
  });
  const emailDraft = buildEmailDraft({ snapshot, title });
  const canonicalPayload = {
    brand: request.brand,
    buyerProfileId: request.buyerProfileId,
    shortlistId: request.shortlistId,
    title,
    language: request.language || null,
    presentationJson,
    emailDraft,
  };
  const payloadHash = stableHash(canonicalPayload);
  const idempotencySeed = request.idempotencySeed || correlationId;
  const presentationIdempotencyKey = stableIdempotencyKey("presentation", {
    seed: idempotencySeed,
    payloadHash,
  });
  const messageIdempotencyKey = stableIdempotencyKey("message-draft", {
    seed: idempotencySeed,
    payloadHash,
  });

  const persisted = await input.repository.createCustomerPresentationDraft({
    brand: request.brand,
    buyerProfileId: request.buyerProfileId,
    shortlistId: request.shortlistId,
    status: "draft",
    title,
    presentationJson,
    idempotencyKey: presentationIdempotencyKey,
    payloadHash,
    correlationId,
    createdBy: input.createdBy,
    approvedBy: null,
    approvedAt: null,
    archivedAt: null,
    messageDraft: {
      brand: request.brand,
      buyerProfileId: request.buyerProfileId,
      shortlistId: request.shortlistId,
      channel: "email",
      status: "draft",
      subject: emailDraft.subject,
      bodyText: emailDraft.bodyText,
      bodyHtml: emailDraft.bodyHtml,
      language: request.language || null,
      idempotencyKey: messageIdempotencyKey,
      payloadHash,
      correlationId,
      createdBy: input.createdBy,
      approvedBy: null,
      approvedAt: null,
      sentAt: null,
      cancelledAt: null,
    },
  });

  if (!persisted.payloadHashMatches || !persisted.messageDraftId) {
    throw new LeadIntelligenceReviewError(
      "REVIEW_CONFLICT",
      "This presentation idempotency key was already used for a different payload",
      409,
      { conflict: true },
    );
  }

  return {
    presentationId: persisted.presentationId,
    buyerProfileId: request.buyerProfileId,
    shortlistId: request.shortlistId,
    messageDraftId: persisted.messageDraftId,
    duplicate: persisted.duplicate,
    conflict: false,
    loadedFromHistory: false,
    status: "draft",
    messageStatus: "draft",
    itemCount: snapshot.items.length,
    title,
    subject: emailDraft.subject,
    presentationPreview: buildLeadCustomerPresentationPreview(presentationJson),
    messageDraft: {
      subject: emailDraft.subject,
      bodyText: emailDraft.bodyText,
      bodyHtml: emailDraft.bodyHtml,
    },
    sideEffects: {
      emailSent: false,
      leadsCreated: false,
      contactsCreated: false,
      propertyMatchingStarted: false,
      presentationPublished: false,
    },
  };
}
