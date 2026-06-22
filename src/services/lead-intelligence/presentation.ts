import { createHash } from "node:crypto";
import { z } from "zod";
import { BoundedJsonSchema, LEAD_INTELLIGENCE_LIMITS, LanguageCodeSchema } from "./contracts";
import { LeadIntelligenceError } from "./extraction";
import { LeadIntelligenceRealEstateBrandSchema } from "./brand-allowlist";
import {
  type CreateLeadCustomerPresentationDraftInput,
  type LeadCustomerPresentationShortlistSnapshot,
} from "./persistence";
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

export interface LeadCustomerPresentationRepository {
  loadShortlistSnapshotForPresentation(input: {
    brand: string;
    buyerProfileId: string;
    shortlistId: string;
  }): Promise<LeadCustomerPresentationShortlistSnapshot | null>;
  createCustomerPresentationDraft(input: CreateLeadCustomerPresentationDraftInput): Promise<{
    presentationId: string;
    messageDraftId: string | null;
    duplicate: boolean;
    payloadHashMatches: boolean;
  }>;
}

export interface LeadCustomerPresentationDraftResult {
  presentationId: string;
  messageDraftId: string;
  duplicate: boolean;
  conflict: boolean;
  status: "draft";
  messageStatus: "draft";
  itemCount: number;
  title: string;
  subject: string;
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
  const propertyLines = input.snapshot.items.map((item, index) => {
    const facts = propertyFacts(item).join(" · ");
    const reasons = item.reasons.slice(0, 2).join(" ");
    const verification = uniqueItems([...item.concerns.slice(0, 2), ...item.questionsToVerify.slice(0, 1)], 3).join(" ");
    const websiteUrl = safeWebsiteUrl(item.propertyPublicUrl);
    return [
      `${index + 1}. ${propertyName(item)}${facts ? ` (${facts})` : ""}`,
      `   Hvorfor aktuell: ${reasons || "Matcher deler av behovet."}`,
      verification ? `   Må avklares: ${verification}` : "   Må avklares: Pris og tilgjengelighet må bekreftes.",
      websiteUrl ? `   Se boligen på nettsiden: ${websiteUrl}` : "   Nettsidelenke: må legges inn eller verifiseres før deling.",
    ].filter(Boolean).join("\n");
  });

  const bodyText = [
    "Hei,",
    "",
    "Jeg har sett gjennom aktuelle boliger opp mot behovene vi har notert så langt.",
    input.snapshot.budgetAmount === null
      ? "Budsjett må avklares."
      : `Budsjett: ca. ${formatCurrency(input.snapshot.budgetAmount, input.snapshot.budgetCurrency)}${input.snapshot.budgetIncludesCosts ? " inkludert omkostninger" : ""}.`,
    "",
    "Jeg ville sett nærmere på disse alternativene:",
    ...propertyLines,
    "",
    "Pris, tilgjengelighet og enkelte detaljer må bekreftes før vi går videre.",
    "Gi meg gjerne beskjed om hvilke av disse du ønsker at jeg undersøker nærmere.",
    "",
    "Vennlig hilsen",
    "Freddy",
  ].join("\n");

  const propertyHtml = input.snapshot.items
    .map((item, index) => {
      const facts = propertyFacts(item).join(" · ");
      const reasons = item.reasons.slice(0, 2).join(" ");
      const verification = uniqueItems([...item.concerns.slice(0, 2), ...item.questionsToVerify.slice(0, 1)], 3).join(" ");
      const websiteUrl = safeWebsiteUrl(item.propertyPublicUrl);
      return [
        `<li style="margin:0 0 18px 0;">`,
        `<strong>${index + 1}. ${escapeHtml(propertyName(item))}</strong>`,
        facts ? `<br><span>${escapeHtml(facts)}</span>` : "",
        `<br><span><strong>Hvorfor aktuell:</strong> ${escapeHtml(reasons || "Matcher deler av behovet.")}</span>`,
        `<br><span><strong>Må avklares:</strong> ${escapeHtml(verification || "Pris og tilgjengelighet må bekreftes.")}</span>`,
        websiteUrl
          ? `<br><a href="${escapeHtml(websiteUrl)}" target="_blank" rel="noopener noreferrer">Se boligen på nettsiden</a>`
          : `<br><span><strong>Nettsidelenke:</strong> må legges inn eller verifiseres før deling.</span>`,
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
    `<p>Jeg ville sett nærmere på disse alternativene:</p>`,
    `<ol style="padding-left:20px;margin:0 0 16px 0;">${propertyHtml}</ol>`,
    `<p>Pris, tilgjengelighet og enkelte detaljer må bekreftes før vi går videre.</p>`,
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
    messageDraftId: persisted.messageDraftId,
    duplicate: persisted.duplicate,
    conflict: false,
    status: "draft",
    messageStatus: "draft",
    itemCount: snapshot.items.length,
    title,
    subject: emailDraft.subject,
    sideEffects: {
      emailSent: false,
      leadsCreated: false,
      contactsCreated: false,
      propertyMatchingStarted: false,
      presentationPublished: false,
    },
  };
}
