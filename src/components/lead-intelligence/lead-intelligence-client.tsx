"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clipboard,
  ExternalLink,
  Loader2,
  MessageSquareText,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  ShieldCheck,
  Sparkles,
  Trash2,
  UserCheck,
  Users,
  XCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { BRANDS } from "@/lib/constants";
import { LEAD_INTELLIGENCE_LIMITS, type ExtractedLead, type PhoneLookupNormalization } from "@/services/lead-intelligence/contracts";
import { criterionReviewFingerprint } from "@/services/lead-intelligence/review-shared";

type Source = "phone_call" | "whatsapp" | "email" | "sms" | "meeting_note" | "other";

interface LeadAnalysisResponse {
  ok: true;
  correlationId: string;
  result: ExtractedLead;
  meta: {
    model: string;
    promptVersion: string;
    durationMs: number;
    repaired: boolean;
    redaction: {
      phoneCount: number;
      emailCount: number;
    };
    phoneNormalization: PhoneLookupNormalization;
  };
}

interface SafeErrorResponse {
  ok: false;
  error: {
    correlationId: string;
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

interface LeadContactCandidatePreview {
  contactId: string;
  name: string | null;
  maskedPhone: string | null;
  maskedEmail: string | null;
  matchType: "exact_phone" | "exact_email" | "name_similarity" | "manual" | "other";
  confidence: number;
  reasons: string[];
}

interface ContactCandidatesResponse {
  ok: true;
  correlationId: string;
  candidates: LeadContactCandidatePreview[];
  requiresManualSelection: boolean;
}

interface LinkedContactPreview {
  contactId: string;
  name: string | null;
  maskedPhone: string | null;
  maskedEmail: string | null;
}

interface ReviewSaveResponse {
  ok: true;
  correlationId: string;
  result: {
    status: {
      newlySaved: boolean;
      duplicate: boolean;
      conflict: boolean;
    };
    intake: { id: string; duplicate: boolean };
    analysisRun: { id: string; duplicate: boolean };
    buyerProfile: { id: string; criterionCount: number; duplicate: boolean };
    contactCandidates: {
      recorded: number;
      selectedContactId: string | null;
      decision: "connect_existing" | "create_new" | "continue_without_contact";
      createdContact: false;
      linkedContact: boolean;
      duplicate?: boolean;
    };
  };
  sideEffects: {
    contactsCreated: false;
    contactUpdated: false;
    emailSent: false;
    propertyMatchingStarted: false;
  };
}

interface Props {
  featureEnabled: boolean;
  persistenceEnabled: boolean;
  connectExistingEnabled: boolean;
  propertyMatchingEnabled: boolean;
}

type CriterionType = "hard_requirement" | "preference" | "exclusion" | "missing_information";
type CriterionApprovalStatus = "pending" | "approved" | "rejected";

interface CriterionReviewState {
  approvalStatus: CriterionApprovalStatus;
  customerConfirmed: boolean;
}

interface ReviewCriterionRow {
  id: string;
  fingerprint: string;
  criterionType: CriterionType;
  index: number;
  key: string;
  label: string;
  detail: string;
}

type PropertyMatchEligibility = "eligible" | "conditional" | "rejected";
type MatchReviewDecision = "system" | "current" | "maybe" | "needs_research" | "rejected";
type SelectedShortlistDecision = Exclude<MatchReviewDecision, "system" | "rejected">;
type SelectedShortlistMatch = PropertyMatchPreviewResponse["result"]["matches"][number] & {
  decision: SelectedShortlistDecision;
};

interface PropertyMatchPreviewResponse {
  ok: true;
  correlationId: string;
  result: {
    buyerProfileId: string;
    discoveryMode: "explicit" | "auto";
    bestEffort: boolean;
    analyzed: number;
    matched: number;
    candidateLimit: number | null;
    missingPropertyReferences: string[];
    skippedProperties: Array<{
      propertyId: string;
      reason: "PROPERTY_BRAND_MISMATCH" | "PROPERTY_NORMALIZATION_FAILED";
    }>;
    matches: Array<{
      propertyId: string;
      property: {
        id: string;
        reference: string | null;
        title: string | null;
        location: string | null;
        propertyType: string | null;
        price: number | null;
        bedrooms: number | null;
        bathrooms: number | null;
        primaryImageUrl: string | null;
        publicUrl: string | null;
      };
      score: number;
      eligibility: PropertyMatchEligibility;
      dataQualityScore: number;
      reasonsForMatch: string[];
      concerns: string[];
      questionsToVerify: string[];
      budgetResult: {
        outcome: "pass" | "fail" | "unknown" | "penalty" | "not_applicable";
        reason: string;
        expected: unknown;
        actual: unknown;
      } | null;
    }>;
    sideEffects: {
      leadsCreated: false;
      contactsCreated: false;
      emailsSent: false;
      matchesPersisted: false;
      shortlistCreated: false;
    };
  };
}

interface ShortlistSaveResponse {
  ok: true;
  correlationId: string;
  result: {
    shortlistId: string;
    duplicate: boolean;
    conflict: boolean;
    itemCount: number;
    sideEffects: {
      leadsCreated: false;
      contactsCreated: false;
      emailsSent: false;
      propertyMatchingStarted: false;
      presentationCreated: false;
    };
  };
}

interface PresentationDraftResponse {
  ok: true;
  correlationId: string;
  result: {
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
    presentationPreview: {
      summary: string | null;
      budget: {
        amount: number | null;
        currency: string | null;
        includesCosts: boolean | null;
        approximate: boolean | null;
      } | null;
      needs: string[];
      verification: string[];
      properties: Array<{
        propertyId: string | null;
        reference: string | null;
        title: string;
        location: string | null;
        imageUrl: string | null;
        publicUrl: string | null;
        facts: string[];
        decision: string | null;
        systemEligibility: string | null;
        score: number | null;
        dataQualityScore: number | null;
        reasons: string[];
        concerns: string[];
        questionsToVerify: string[];
      }>;
    };
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
  };
}

interface PresentationDraftHistoryResponse {
  ok: true;
  correlationId: string;
  result: {
    brand: string;
    buyerProfileId: string;
    limit: number;
    items: Array<{
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
    }>;
  };
}

interface LeadIntelligenceWorklistItem {
  buyerProfileId: string;
  intakeId: string;
  analysisRunId: string | null;
  source: Source | null;
  intakeStatus: string | null;
  profileStatus: string;
  purchaseReadiness: string | null;
  summary: string | null;
  budgetAmount: number | null;
  budgetCurrency: string | null;
  locationFlexible: boolean;
  contactLinked: boolean;
  criterionCount: number;
  shortlistCount: number;
  latestShortlistId: string | null;
  latestShortlistStatus: string | null;
  latestShortlistItemCount: number;
  presentationCount: number;
  latestPresentationId: string | null;
  latestPresentationStatus: string | null;
  latestMessageDraftId: string | null;
  latestMessageDraftStatus: string | null;
  createdAt: string;
  updatedAt: string;
  approvedAt: string | null;
  linkedContact: LinkedContactPreview | null;
}

interface LeadIntelligenceWorklistResponse {
  ok: true;
  correlationId: string;
  result: {
    brand: string;
    limit: number;
    items: LeadIntelligenceWorklistItem[];
  };
}

interface LeadIntelligenceCrmContextItem {
  contactId: string;
  name: string | null;
  maskedPhone: string | null;
  maskedEmail: string | null;
  matchType: LeadContactCandidatePreview["matchType"];
  confidence: number;
  reasons: string[];
  pipelineStatus: string | null;
  pipelineValue: number | null;
  propertyInterest: string | null;
  source: string | null;
  sentiment: string | null;
  notesExcerpt: string | null;
  interactionCount: number;
  lastContact: string | null;
  nextFollowup: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

interface LeadIntelligenceCrmContextResponse {
  ok: true;
  correlationId: string;
  result: {
    candidates: LeadContactCandidatePreview[];
    context: LeadIntelligenceCrmContextItem[];
  };
  sideEffects: {
    contactsCreated: false;
    contactsUpdated: false;
    leadsCreated: false;
    emailSent: false;
    propertyMatchingStarted: false;
  };
}

interface SavedProfileContactCandidatesResponse {
  ok: true;
  correlationId: string;
  result: {
    buyerProfileId: string;
    linkedContact: LinkedContactPreview | null;
    candidates: LeadContactCandidatePreview[];
    requiresManualSelection: boolean;
  };
  sideEffects: {
    contactsCreated: false;
    contactsUpdated: false;
    leadsCreated: false;
    emailSent: false;
    propertyMatchingStarted: false;
  };
}

interface SavedProfileContactLinkResponse {
  ok: true;
  correlationId: string;
  result: {
    buyerProfileId: string;
    contactId: string;
    duplicate: boolean;
    linkedContact: LinkedContactPreview;
  };
  sideEffects: {
    contactsCreated: false;
    contactsUpdated: false;
    buyerProfileUpdated: true;
    leadsCreated: false;
    emailSent: false;
    propertyMatchingStarted: false;
  };
}

interface SavedProfileArchiveResponse {
  ok: true;
  correlationId: string;
  result: {
    buyerProfileId: string;
    status: "archived";
    duplicate: boolean;
    archived: true;
  };
  sideEffects: {
    profileArchived: true;
    contactsCreated: false;
    contactsUpdated: false;
    leadsCreated: false;
    emailSent: false;
    propertyMatchingStarted: false;
    presentationCreated: false;
  };
}

const sourceOptions: Array<{ value: Source; label: string }> = [
  { value: "phone_call", label: "Telefonsamtale" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "email", label: "E-post" },
  { value: "sms", label: "SMS" },
  { value: "meeting_note", label: "Møtenotat" },
  { value: "other", label: "Annet" },
];

const realEstateBrands = BRANDS.filter((brand) => brand.type === "real_estate");

function prettyJson(value: unknown) {
  return JSON.stringify(value, null, 2);
}

function shortPropertyId(propertyId: string) {
  return propertyId.length > 12 ? `${propertyId.slice(0, 8)}...${propertyId.slice(-4)}` : propertyId;
}

function leadIntelligenceDraftReturnUrl({
  buyerProfileId,
  presentationId,
  messageDraftId,
}: {
  buyerProfileId?: string | null;
  presentationId?: string | null;
  messageDraftId?: string | null;
}) {
  const params = new URLSearchParams();
  if (buyerProfileId) params.set("buyerProfileId", buyerProfileId);
  if (presentationId) params.set("presentationId", presentationId);
  if (messageDraftId) params.set("messageDraftId", messageDraftId);
  const query = params.toString();
  return query ? `/lead-intelligence?${query}` : "/lead-intelligence";
}

function internalInventoryPropertyUrl(propertyId: string | null, returnTo?: string | null) {
  if (!propertyId) return null;
  const params = new URLSearchParams({ propertyId });
  if (returnTo) params.set("returnTo", returnTo);
  return `/inventory?${params.toString()}`;
}

function formatCurrency(value: number | null, currency = "EUR") {
  if (value === null) return null;
  try {
    return new Intl.NumberFormat("nb-NO", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(value);
  } catch {
    return new Intl.NumberFormat("nb-NO", {
      maximumFractionDigits: 0,
    }).format(value);
  }
}

function formatDateTime(value: string | null) {
  if (!value) return "Ikke satt";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("nb-NO", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

function generateClientCorrelationId() {
  const bytes = new Uint8Array(12);
  globalThis.crypto?.getRandomValues(bytes);
  const random = bytes.some(Boolean)
    ? Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("")
    : Math.random().toString(16).slice(2).padEnd(24, "0").slice(0, 24);
  return `rf_${Date.now().toString(36)}_${random}`;
}

function propertyFactsLine(match: PropertyMatchPreviewResponse["result"]["matches"][number]) {
  const parts = [
    match.property.reference ? `Ref ${match.property.reference}` : null,
    match.property.location,
    match.property.propertyType,
    formatCurrency(match.property.price),
    match.property.bedrooms === null ? null : `${match.property.bedrooms} sov`,
    match.property.bathrooms === null ? null : `${match.property.bathrooms} bad`,
  ].filter(Boolean);
  return parts.join(" · ");
}

function propertyDisplayName(match: PropertyMatchPreviewResponse["result"]["matches"][number]) {
  return match.property.title || match.property.reference || shortPropertyId(match.propertyId);
}

function decisionLabelForPresentation(decision: SelectedShortlistDecision) {
  switch (decision) {
    case "current":
      return "Aktuell";
    case "maybe":
      return "Kanskje";
    case "needs_research":
      return "Må undersøkes";
  }
}

function uniquePresentationItems(values: Array<string | null | undefined>, limit = 6) {
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

function humanizedMatchReasonItems(values: string[], limit = 3) {
  return uniquePresentationItems(values.slice(0, limit).map(humanizeMatchReason), limit);
}

function humanizedMatchReasons(values: string[], limit = 2) {
  return humanizedMatchReasonItems(values, limit).join(" ");
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

function sharedMatchReasonKeys(reasonGroups: string[][]) {
  if (reasonGroups.length < 3) return new Set<MatchReasonKey>();
  const keyedGroups = reasonGroups.map((reasons) => new Set(reasons.map(matchReasonKey).filter((key): key is MatchReasonKey => Boolean(key))));
  const allKeys: MatchReasonKey[] = ["bedrooms", "bathrooms", "property_type", "budget"];
  return new Set(allKeys.filter((key) => keyedGroups.every((group) => group.has(key))));
}

function sharedMatchReasonSummary(sharedKeys: Set<MatchReasonKey>) {
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

function itemSpecificMatchReasons(values: string[], sharedKeys: Set<MatchReasonKey>, limit = 2) {
  return humanizedMatchReasons(values.filter((value) => {
    const key = matchReasonKey(value);
    return !key || !sharedKeys.has(key);
  }), limit);
}

function buildShortlistPresentation(lead: ExtractedLead, matches: SelectedShortlistMatch[]) {
  const contactName = lead.contact.name?.trim() || "kunden";
  const propertyTypes = lead.propertyTypes.length > 0 ? lead.propertyTypes.join(", ") : "bolig";
  const locations = lead.locations.preferred.length > 0
    ? lead.locations.preferred.join(", ")
    : lead.locations.flexible
      ? "fleksibelt område"
      : "område ikke avklart";
  const budget = lead.budget.amount
    ? `${formatCurrency(lead.budget.amount)}${lead.budget.includesCosts ? " inkl. omkostninger" : ""}`
    : "må avklares";
  const needBullets = uniquePresentationItems([
    `Boligtype: ${propertyTypes}`,
    `Område: ${locations}${lead.locations.flexible ? " / nærområde vurderes" : ""}`,
    `Budsjett: ${budget}`,
    ...lead.hardRequirements.slice(0, 3).map((criterion) => criterion.sourceText),
  ]);
  const verificationBullets = uniquePresentationItems([
    ...lead.missingInformation.slice(0, 3).map((item) => item.question),
    ...matches.flatMap((match) => match.questionsToVerify.slice(0, 2)),
    ...matches.flatMap((match) => match.concerns.slice(0, 2)),
    "Pris, tilgjengelighet og nøkkelfakta må bekreftes før kunden får endelig anbefaling.",
  ], 8);

  return {
    title: `Kundepresentasjon for ${contactName}`,
    subtitle: `${matches.length} bolig${matches.length === 1 ? "" : "er"} valgt for manuell gjennomgang.`,
    needBullets,
    verificationBullets,
  };
}

function buildShortlistPresentationText(
  lead: ExtractedLead,
  matches: SelectedShortlistMatch[],
) {
  const presentation = buildShortlistPresentation(lead, matches);
  const propertyLines = matches.map((match, index) => {
    const facts = propertyFactsLine(match);
    const reasons = humanizedMatchReasons(match.reasonsForMatch, 3);
    const verification = uniquePresentationItems([
      ...match.concerns.slice(0, 2),
      ...match.questionsToVerify.slice(0, 2),
    ], 3).join(" ");
    return [
      `${index + 1}. ${propertyDisplayName(match)}${facts ? ` (${facts})` : ""}`,
      `   Status: ${decisionLabelForPresentation(match.decision)}`,
      `   Hvorfor den passer: ${reasons || "Matcher deler av behovet."}`,
      verification ? `   Må avklares: ${verification}` : "   Må avklares: Pris og tilgjengelighet må bekreftes.",
    ].join("\n");
  });

  return [
    presentation.title,
    presentation.subtitle,
    "",
    "Kundens behov:",
    ...presentation.needBullets.map((item) => `- ${item}`),
    "",
    "Boligforslag:",
    ...propertyLines,
    "",
    "Før videre deling må dette avklares:",
    ...presentation.verificationBullets.map((item) => `- ${item}`),
  ].join("\n");
}

function buildShortlistEmailDraft(
  lead: ExtractedLead,
  matches: SelectedShortlistMatch[],
) {
  const contactName = lead.contact.name?.trim() || "kunden";
  const locationText = lead.locations.preferred.length > 0
    ? lead.locations.preferred.join(", ")
    : lead.locations.flexible
      ? "fleksibelt område"
      : "området vi har snakket om";
  const budgetText = lead.budget.amount
    ? `Budsjett: ca. ${formatCurrency(lead.budget.amount)}${lead.budget.includesCosts ? " inkludert omkostninger" : ""}.`
    : "Budsjett må avklares.";
  const sharedReasons = sharedMatchReasonKeys(matches.map((match) => match.reasonsForMatch));
  const sharedReasonText = sharedMatchReasonSummary(sharedReasons);
  const missingWebsiteLinks = matches.filter((match) => !match.property.publicUrl).length;
  const propertyLines = matches.map((match, index) => {
    const facts = propertyFactsLine(match);
    const reasons = itemSpecificMatchReasons(match.reasonsForMatch, sharedReasons, 2);
    const concerns = uniquePresentationItems([
      ...match.concerns.slice(0, 2),
      ...match.questionsToVerify.slice(0, 1),
    ], 3);
    return [
      `${index + 1}. ${propertyDisplayName(match)}${facts ? ` (${facts})` : ""}`,
      reasons ? `   Aktuelt fordi: ${reasons}` : null,
      concerns.length > 0 ? `   Må avklares: ${concerns.join(" ")}` : null,
      match.property.publicUrl ? `   Se boligen på nettsiden: ${match.property.publicUrl}` : null,
    ].filter(Boolean).join("\n");
  });
  const closingChecks = uniquePresentationItems([
    "Pris, tilgjengelighet og enkelte detaljer må bekreftes før vi går videre.",
    missingWebsiteLinks > 0 ? "Boliglenker kontrolleres før endelig sending." : null,
  ], 2);

  return {
    subject: `Boligforslag: ${matches.length} alternativer i ${locationText}`,
    body: [
      `Hei ${contactName},`,
      "",
      "Jeg har sett gjennom aktuelle boliger opp mot behovene vi har notert så langt.",
      budgetText,
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
    ].join("\n"),
  };
}

function matchReviewDecisionLabel(decision: MatchReviewDecision) {
  switch (decision) {
    case "current":
      return "Aktuell";
    case "maybe":
      return "Kanskje";
    case "needs_research":
      return "Må undersøkes";
    case "rejected":
      return "Avvist";
    case "system":
    default:
      return "Systemforslag";
  }
}

function matchReviewDecisionVariant(decision: MatchReviewDecision) {
  switch (decision) {
    case "current":
      return "success";
    case "maybe":
    case "needs_research":
      return "warning";
    case "rejected":
      return "destructive";
    case "system":
    default:
      return "secondary";
  }
}

function listToText(values: string[]) {
  return values.join(", ");
}

function textToList(value: string) {
  return Array.from(
    new Set(
      value
        .split(/[\n,;]+/)
        .map((item) => normalizeKnownLocationAlias(item.trim()))
        .filter(Boolean),
    ),
  ).slice(0, LEAD_INTELLIGENCE_LIMITS.locations);
}

function normalizeKnownLocationAlias(value: string) {
  const folded = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  if (folded === "moreira") return "Moraira";
  if (folded === "moraira") return "Moraira";
  return value;
}

function parseJsonEditor(value: string) {
  try {
    return { parsed: JSON.parse(value) as ExtractedLead, error: null };
  } catch (error) {
    return { parsed: null, error: error instanceof Error ? error.message : "Ugyldig JSON" };
  }
}

function flattenReviewCriteria(lead: ExtractedLead | null): ReviewCriterionRow[] {
  if (!lead) return [];

  return [
    ...lead.hardRequirements.map((item, index) => {
      const fingerprint = criterionReviewFingerprint({
        criterionType: "hard_requirement",
        index,
        item,
      });
      return {
        id: fingerprint,
        fingerprint,
        criterionType: "hard_requirement" as const,
        index,
        key: item.key,
        label: "Absolutt krav",
        detail: item.sourceText,
      };
    }),
    ...lead.preferences.map((item, index) => {
      const fingerprint = criterionReviewFingerprint({
        criterionType: "preference",
        index,
        item,
      });
      return {
        id: fingerprint,
        fingerprint,
        criterionType: "preference" as const,
        index,
        key: item.key,
        label: "Sterkt ønske",
        detail: item.sourceText,
      };
    }),
    ...lead.exclusions.map((item, index) => {
      const fingerprint = criterionReviewFingerprint({
        criterionType: "exclusion",
        index,
        item,
      });
      return {
        id: fingerprint,
        fingerprint,
        criterionType: "exclusion" as const,
        index,
        key: item.key,
        label: "Avvisningskriterium",
        detail: item.sourceText,
      };
    }),
    ...lead.missingInformation.map((item, index) => {
      const fingerprint = criterionReviewFingerprint({
        criterionType: "missing_information",
        index,
        item,
      });
      return {
        id: fingerprint,
        fingerprint,
        criterionType: "missing_information" as const,
        index,
        key: item.key,
        label: "Manglende informasjon",
        detail: item.question,
      };
    }),
  ];
}

function badgeForPhone(status: PhoneLookupNormalization["status"]) {
  switch (status) {
    case "verified_e164":
      return { label: "Verifisert E.164", variant: "success" as const };
    case "national":
      return { label: "Nasjonalt format", variant: "warning" as const };
    case "invalid":
      return { label: "Ugyldig telefon", variant: "destructive" as const };
    default:
      return { label: "Ingen telefon", variant: "secondary" as const };
  }
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label className="text-xs font-medium uppercase tracking-wide text-slate-500">{children}</label>;
}

function TextInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange(value: string): void;
}) {
  return (
    <div className="space-y-1">
      <FieldLabel>{label}</FieldLabel>
      <Input value={value} onChange={(event) => onChange(event.target.value)} />
    </div>
  );
}

function JsonSection({
  title,
  value,
}: {
  title: string;
  value: unknown;
}) {
  return (
    <div className="rounded-lg border border-slate-700/60 bg-slate-900/50 p-3">
      <h3 className="mb-2 text-sm font-semibold text-slate-200">{title}</h3>
      <pre className="max-h-56 overflow-auto whitespace-pre-wrap break-words text-xs text-slate-300">
        {prettyJson(value)}
      </pre>
    </div>
  );
}

const propertyReferencePattern = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/;

function parsePropertyReferences(value: string) {
  const references = value
    .split(/[\s,;]+/)
    .map((item) => item.trim())
    .filter(Boolean);
  const unique = Array.from(new Map(references.map((reference) => [reference.toLowerCase(), reference])).values());

  if (references.length !== unique.length) {
    return { references: unique, error: "Eiendomsreferanser må være unike." };
  }

  if (unique.length > 20) {
    return { references: unique.slice(0, 20), error: "Maks 20 eiendomsreferanser kan forhåndsvises samtidig." };
  }

  const invalid = unique.find((reference) => !propertyReferencePattern.test(reference));
  if (invalid) {
    return { references: unique, error: `Ugyldig eiendomsreferanse: ${invalid}` };
  }

  return { references: unique, error: null };
}

function MatchList({
  title,
  items,
  emptyLabel,
}: {
  title: string;
  items: string[];
  emptyLabel: string;
}) {
  return (
    <div>
      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</p>
      {items.length > 0 ? (
        <ul className="space-y-1 text-xs text-slate-300">
          {items.map((item) => (
            <li key={item} className="rounded border border-slate-800 bg-slate-950/50 px-2 py-1">
              {item}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-slate-500">{emptyLabel}</p>
      )}
    </div>
  );
}

function PresentationPreviewList({
  title,
  items,
  emptyLabel,
  tone = "default",
}: {
  title: string;
  items: string[];
  emptyLabel: string;
  tone?: "default" | "warning";
}) {
  const dotClass = tone === "warning" ? "bg-amber-300" : "bg-emerald-300";
  return (
    <section className="rounded-lg border border-slate-800 bg-slate-950/50 p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</p>
      {items.length > 0 ? (
        <ul className="mt-2 space-y-2 text-sm leading-relaxed text-slate-200">
          {items.map((item) => (
            <li key={item} className="flex gap-2">
              <span className={`mt-2 h-1.5 w-1.5 shrink-0 rounded-full ${dotClass}`} />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-slate-500">{emptyLabel}</p>
      )}
    </section>
  );
}

function PresentationDraftReadiness({
  preview,
}: {
  preview: PresentationDraftResponse["result"]["presentationPreview"];
}) {
  const missingCustomerLinks = preview.properties.filter((property) => !property.publicUrl);
  const propertyCount = preview.properties.length;
  const verificationItems = uniquePresentationItems([
    ...preview.verification,
    ...preview.properties.flatMap((property) => property.questionsToVerify),
    ...preview.properties.flatMap((property) => property.concerns),
  ], 8);
  const hasProperties = preview.properties.length > 0;
  const allCustomerLinksReady = hasProperties && missingCustomerLinks.length === 0;
  const hasLeanShortlist = propertyCount > 0 && propertyCount <= 5;
  const canUseManually = hasProperties && verificationItems.length === 0 && allCustomerLinksReady;
  const needsShortlistTrim = propertyCount > 5;
  const readinessLabel = canUseManually ? "Klar for manuell deling" : "Må kvalitetssikres";
  const nextActions = uniquePresentationItems([
    !hasProperties ? "Lag et shortlist-utkast med minst én godkjent bolig." : null,
    needsShortlistTrim ? "Vurder å korte ned utkastet til 3–5 boliger før kunden får det." : null,
    missingCustomerLinks.length > 0 ? "Kontroller eller legg inn kundelenker for boligene som mangler offentlig lenke." : null,
    verificationItems.length > 0 ? "Avklar punktene under før teksten brukes mot kunde." : null,
    hasProperties ? "Åpne boligkortene i RealtyFlow og kontroller pris, tilgjengelighet og nøkkelfakta manuelt." : null,
    canUseManually ? "Les gjennom e-postteksten og kopier den manuelt når du er fornøyd." : null,
  ], 6);

  return (
    <section className="mt-3 rounded-lg border border-slate-800 bg-slate-950/60 p-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-slate-100">Før deling med kunde</p>
          <p className="mt-1 text-xs text-slate-500">
            Dette er en intern kvalitetssjekk for manuell bruk. Den sender ikke e-post og publiserer ikke presentasjon.
          </p>
        </div>
        <Badge variant={canUseManually ? "success" : "warning"}>
          {readinessLabel}
        </Badge>
      </div>

      <div className="mt-3 grid gap-2 md:grid-cols-4">
        <div className="rounded-lg border border-slate-800 bg-slate-900/70 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Utvalg</p>
          <p className="mt-2 text-sm text-slate-200">
            {hasProperties
              ? `${propertyCount} bolig${propertyCount === 1 ? "" : "er"} i utkastet.`
              : "Ingen boliger i utkastet."}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {hasLeanShortlist ? "Passer som kort kundeliste." : "3–5 boliger er vanligvis mest oversiktlig."}
          </p>
        </div>
        <div className="rounded-lg border border-slate-800 bg-slate-900/70 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Kundelenker</p>
          <p className="mt-2 text-sm text-slate-200">
            {allCustomerLinksReady
              ? "Alle boligkort har ekstern nettsidelenke."
              : `${missingCustomerLinks.length} bolig${missingCustomerLinks.length === 1 ? "" : "er"} mangler kundelenke.`}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            RealtyFlow-lenker er bare interne for Freddy.
          </p>
        </div>
        <div className="rounded-lg border border-slate-800 bg-slate-900/70 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Avklaringer</p>
          <p className="mt-2 text-sm text-slate-200">
            {verificationItems.length === 0
              ? "Ingen åpne avklaringer er lagret i utkastet."
              : `${verificationItems.length} punkt${verificationItems.length === 1 ? "" : "er"} må vurderes før sending.`}
          </p>
        </div>
        <div className="rounded-lg border border-slate-800 bg-slate-900/70 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Sikkerhet</p>
          <p className="mt-2 text-sm text-slate-200">E-poststatus: draft.</p>
          <p className="mt-1 text-xs text-slate-500">Ingen send-knapp finnes i denne fasen.</p>
        </div>
      </div>

      {nextActions.length > 0 && (
        <div className="mt-3 rounded-lg border border-primary-500/20 bg-primary-500/10 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-primary-200">Anbefalt neste handling</p>
          <ul className="mt-2 space-y-1 text-xs text-primary-50">
            {nextActions.map((item) => (
              <li key={item} className="flex gap-2">
                <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary-200" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {verificationItems.length > 0 && (
        <ul className="mt-3 space-y-1 text-xs text-amber-100">
          {verificationItems.slice(0, 5).map((item) => (
            <li key={item} className="rounded border border-amber-500/20 bg-amber-500/10 px-2 py-1">
              {item}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function InternalPresentationPreview({
  preview,
  returnTo,
}: {
  preview: PresentationDraftResponse["result"]["presentationPreview"];
  returnTo?: string | null;
}) {
  return (
    <div className="mt-4 rounded-xl border border-slate-700 bg-slate-950/80 p-4 text-sm text-slate-200 sm:p-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-base font-semibold text-slate-100">Intern presentasjons-preview</p>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">
            Viser trygg preview fra lagret presentasjon. Den er ikke publisert og sendes ikke.
          </p>
        </div>
        {preview.budget?.amount !== null && preview.budget?.amount !== undefined && (
          <Badge variant="secondary">
            Budsjett {formatCurrency(preview.budget.amount, preview.budget.currency || "EUR")}
          </Badge>
        )}
      </div>

      {preview.needs.length > 0 && (
        <div className="mt-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Behov</p>
          <ul className="mt-2 grid gap-2 text-sm text-slate-200 md:grid-cols-2">
            {preview.needs.map((item) => (
              <li key={item} className="rounded-lg border border-slate-800 bg-slate-900/70 px-3 py-2 leading-relaxed">
                {item}
              </li>
            ))}
          </ul>
        </div>
      )}

      <PresentationDraftReadiness preview={preview} />

      <div className="mt-3 space-y-3">
        {preview.properties.length === 0 ? (
          <p className="rounded border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
            Presentasjonen inneholder ingen boligkort. Lag et nytt presentasjonsutkast fra en lagret shortlist.
          </p>
        ) : (
          preview.properties.map((property, index) => {
            const realtyFlowUrl = internalInventoryPropertyUrl(property.propertyId, returnTo);
            return (
            <div key={`${property.propertyId || property.reference || property.title}-${index}`} className="rounded-xl border border-slate-800 bg-slate-900/70">
              <div className="grid gap-0 xl:grid-cols-[minmax(220px,320px),1fr]">
                {property.imageUrl && (
                  <img
                    src={property.imageUrl}
                    alt={property.title}
                    className="h-48 w-full object-cover xl:h-full"
                    loading="lazy"
                  />
                )}
                <div className="space-y-4 p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <p className="text-base font-semibold leading-snug text-slate-100">{property.title}</p>
                      <p className="mt-1 text-sm text-slate-500">
                        {[
                          property.reference ? `Ref ${property.reference}` : null,
                          property.location,
                          property.score === null ? null : `Score ${property.score}`,
                          property.dataQualityScore === null ? null : `Data ${property.dataQualityScore}`,
                        ].filter(Boolean).join(" · ")}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-2">
                      {property.publicUrl && (
                        <Button asChild size="sm" variant="outline">
                          <a href={property.publicUrl} target="_blank" rel="noopener noreferrer">
                            <ExternalLink className="mr-2 h-4 w-4" />
                            Åpne boligside
                          </a>
                        </Button>
                      )}
                      {realtyFlowUrl && (
                        <Button asChild size="sm" variant={property.publicUrl ? "secondary" : "outline"}>
                          <a href={realtyFlowUrl} target="_blank" rel="noopener noreferrer">
                            <ExternalLink className="mr-2 h-4 w-4" />
                            Åpne i RealtyFlow
                          </a>
                        </Button>
                      )}
                      {!property.publicUrl && !realtyFlowUrl && (
                        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
                          Lenke mangler i eiendomsdata
                        </div>
                      )}
                    </div>
                  </div>

                  {property.facts.length > 0 && (
                    <p className="rounded-lg border border-slate-800 bg-slate-950/50 px-3 py-2 text-sm leading-relaxed text-slate-300">
                      {property.facts.join(" · ")}
                    </p>
                  )}

                  <div className="grid gap-3 xl:grid-cols-2 2xl:grid-cols-3">
                    <PresentationPreviewList title="Hvorfor aktuell" items={property.reasons} emptyLabel="Ingen grunner lagret." />
                    <PresentationPreviewList
                      title="Risiko/avvik"
                      items={property.concerns}
                      emptyLabel="Ingen tydelige avvik."
                      tone="warning"
                    />
                    <PresentationPreviewList
                      title="Må verifiseres"
                      items={property.questionsToVerify}
                      emptyLabel="Ingen åpne verifikasjonsspørsmål."
                      tone="warning"
                    />
                  </div>
                </div>
              </div>
            </div>
          );
          })
        )}
      </div>

      {preview.verification.length > 0 && (
        <div className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-200">Må avklares før deling</p>
          <ul className="mt-2 space-y-1 text-xs text-amber-100">
            {preview.verification.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export function LeadIntelligenceClient({
  featureEnabled,
  persistenceEnabled,
  connectExistingEnabled,
  propertyMatchingEnabled,
}: Props) {
  const [source, setSource] = useState<Source>("phone_call");
  const [brand, setBrand] = useState(realEstateBrands[0]?.id || "soleada");
  const [language, setLanguage] = useState("");
  const [rawText, setRawText] = useState("");
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<LeadAnalysisResponse | null>(null);
  const [error, setError] = useState<SafeErrorResponse["error"] | null>(null);
  const [editableJson, setEditableJson] = useState("");
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const [criterionReviews, setCriterionReviews] = useState<Record<string, CriterionReviewState>>({});
  const [candidateLoading, setCandidateLoading] = useState(false);
  const [contactCandidatesLoaded, setContactCandidatesLoaded] = useState(false);
  const [contactCandidates, setContactCandidates] = useState<LeadContactCandidatePreview[]>([]);
  const [contactCandidateError, setContactCandidateError] = useState<SafeErrorResponse["error"] | null>(null);
  const [contactDecision, setContactDecision] = useState<"connect_existing" | "create_new" | "continue_without_contact">("continue_without_contact");
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);
  const [saveLoading, setSaveLoading] = useState(false);
  const [saveError, setSaveError] = useState<SafeErrorResponse["error"] | null>(null);
  const [saveResult, setSaveResult] = useState<ReviewSaveResponse | null>(null);
  const [propertyReferencesText, setPropertyReferencesText] = useState("");
  const [propertyMatchLoading, setPropertyMatchLoading] = useState(false);
  const [propertyMatchError, setPropertyMatchError] = useState<SafeErrorResponse["error"] | null>(null);
  const [propertyMatchResult, setPropertyMatchResult] = useState<PropertyMatchPreviewResponse | null>(null);
  const [matchReviewDecisions, setMatchReviewDecisions] = useState<Record<string, MatchReviewDecision>>({});
  const [shortlistSaveLoading, setShortlistSaveLoading] = useState(false);
  const [shortlistSaveError, setShortlistSaveError] = useState<SafeErrorResponse["error"] | null>(null);
  const [shortlistSaveResult, setShortlistSaveResult] = useState<ShortlistSaveResponse | null>(null);
  const [emailDraftCopyState, setEmailDraftCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const [emailDraftHtmlCopyState, setEmailDraftHtmlCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const [presentationCopyState, setPresentationCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const [presentationDraftLoading, setPresentationDraftLoading] = useState(false);
  const [presentationDraftError, setPresentationDraftError] = useState<SafeErrorResponse["error"] | null>(null);
  const [presentationDraftResult, setPresentationDraftResult] = useState<PresentationDraftResponse | null>(null);
  const [presentationDraftHistoryLoading, setPresentationDraftHistoryLoading] = useState(false);
  const [presentationDraftHistoryError, setPresentationDraftHistoryError] = useState<SafeErrorResponse["error"] | null>(null);
  const [presentationDraftHistoryResult, setPresentationDraftHistoryResult] = useState<PresentationDraftHistoryResponse | null>(null);
  const [editableEmailSubject, setEditableEmailSubject] = useState("");
  const [editableEmailBody, setEditableEmailBody] = useState("");
  const [worklistLoading, setWorklistLoading] = useState(false);
  const [worklistError, setWorklistError] = useState<SafeErrorResponse["error"] | null>(null);
  const [worklistResult, setWorklistResult] = useState<LeadIntelligenceWorklistResponse | null>(null);
  const [activeWorklistItem, setActiveWorklistItem] = useState<LeadIntelligenceWorklistItem | null>(null);
  const [worklistHistoryExpanded, setWorklistHistoryExpanded] = useState(true);
  const returnUrlHydratedRef = useRef(false);
  const [crmContextLoading, setCrmContextLoading] = useState(false);
  const [crmContextError, setCrmContextError] = useState<SafeErrorResponse["error"] | null>(null);
  const [crmContextResult, setCrmContextResult] = useState<LeadIntelligenceCrmContextResponse | null>(null);
  const [profileContactCandidatesLoading, setProfileContactCandidatesLoading] = useState(false);
  const [profileContactCandidatesError, setProfileContactCandidatesError] = useState<SafeErrorResponse["error"] | null>(null);
  const [profileContactCandidatesResult, setProfileContactCandidatesResult] = useState<SavedProfileContactCandidatesResponse | null>(null);
  const [profileSelectedContactId, setProfileSelectedContactId] = useState<string | null>(null);
  const [profileContactLinkLoading, setProfileContactLinkLoading] = useState(false);
  const [profileContactLinkError, setProfileContactLinkError] = useState<SafeErrorResponse["error"] | null>(null);
  const [profileContactLinkResult, setProfileContactLinkResult] = useState<SavedProfileContactLinkResponse | null>(null);
  const [profileArchiveLoading, setProfileArchiveLoading] = useState(false);
  const [profileArchiveError, setProfileArchiveError] = useState<SafeErrorResponse["error"] | null>(null);
  const [profileArchiveResult, setProfileArchiveResult] = useState<SavedProfileArchiveResponse | null>(null);

  const jsonEditor = useMemo(() => parseJsonEditor(editableJson), [editableJson]);
  const edited = jsonEditor.parsed || response?.result || null;
  const phoneBadge = response ? badgeForPhone(response.meta.phoneNormalization.status) : null;
  const remaining = LEAD_INTELLIGENCE_LIMITS.bodyText - rawText.length;
  const reviewCriteria = useMemo(() => flattenReviewCriteria(edited), [edited]);
  const reviewedCount = reviewCriteria.filter(
    (criterion) => criterionReviews[criterion.id]?.approvalStatus && criterionReviews[criterion.id].approvalStatus !== "pending",
  ).length;
  const allCriteriaReviewed = reviewCriteria.length > 0 && reviewedCount === reviewCriteria.length;
  const parsedPropertyReferences = useMemo(
    () => parsePropertyReferences(propertyReferencesText),
    [propertyReferencesText],
  );
  const selectedShortlistItems = useMemo(() => {
    if (!propertyMatchResult) return [];
    return propertyMatchResult.result.matches
      .map((match) => ({
        propertyId: match.propertyId,
        decision: matchReviewDecisions[match.propertyId] || "system",
      }))
      .filter((item): item is { propertyId: string; decision: Exclude<MatchReviewDecision, "system" | "rejected"> } =>
        item.decision === "current" ||
        item.decision === "maybe" ||
        item.decision === "needs_research",
      );
  }, [matchReviewDecisions, propertyMatchResult]);
  const selectedShortlistMatches = useMemo(() => {
    if (!propertyMatchResult) return [];
    const selectedById = new Map(selectedShortlistItems.map((item) => [item.propertyId, item.decision]));
    return propertyMatchResult.result.matches
      .map((match) => {
        const decision = selectedById.get(match.propertyId);
        return decision ? { ...match, decision } : null;
      })
      .filter((match): match is SelectedShortlistMatch =>
        Boolean(match),
      );
  }, [propertyMatchResult, selectedShortlistItems]);
  const shortlistPresentation = useMemo(() => {
    if (!shortlistSaveResult || !edited || selectedShortlistMatches.length === 0) return null;
    return buildShortlistPresentation(edited, selectedShortlistMatches);
  }, [edited, selectedShortlistMatches, shortlistSaveResult]);
  const shortlistPresentationText = useMemo(() => {
    if (!shortlistSaveResult || !edited || selectedShortlistMatches.length === 0) return null;
    return buildShortlistPresentationText(edited, selectedShortlistMatches);
  }, [edited, selectedShortlistMatches, shortlistSaveResult]);
  const shortlistEmailDraft = useMemo(() => {
    if (!shortlistSaveResult || !edited || selectedShortlistMatches.length === 0) return null;
    return buildShortlistEmailDraft(edited, selectedShortlistMatches);
  }, [edited, selectedShortlistMatches, shortlistSaveResult]);

  const resetDraftCopyState = () => {
    setEmailDraftCopyState("idle");
    setEmailDraftHtmlCopyState("idle");
    setPresentationCopyState("idle");
  };

  const clearPresentationDraftState = () => {
    setPresentationDraftError(null);
    setPresentationDraftResult(null);
    setPresentationDraftHistoryError(null);
    setPresentationDraftHistoryResult(null);
    setEditableEmailSubject("");
    setEditableEmailBody("");
    resetDraftCopyState();
  };

  const clearPropertyMatchPreview = () => {
    setPropertyMatchError(null);
    setPropertyMatchResult(null);
    setMatchReviewDecisions({});
    setShortlistSaveError(null);
    setShortlistSaveResult(null);
    clearPresentationDraftState();
  };

  const clearCrmContext = () => {
    setCrmContextLoading(false);
    setCrmContextError(null);
    setCrmContextResult(null);
  };

  const clearActiveProfileActions = () => {
    setProfileContactCandidatesLoading(false);
    setProfileContactCandidatesError(null);
    setProfileContactCandidatesResult(null);
    setProfileSelectedContactId(null);
    setProfileContactLinkLoading(false);
    setProfileContactLinkError(null);
    setProfileContactLinkResult(null);
    setProfileArchiveLoading(false);
    setProfileArchiveError(null);
    setProfileArchiveResult(null);
  };

  const clearContactCandidates = () => {
    setContactCandidatesLoaded(false);
    setContactCandidates([]);
    setContactCandidateError(null);
    clearCrmContext();
    setContactDecision("continue_without_contact");
    setSelectedContactId(null);
    setSaveError(null);
    setSaveResult(null);
    setActiveWorklistItem(null);
    setWorklistHistoryExpanded(true);
    clearActiveProfileActions();
    clearPropertyMatchPreview();
  };

  const updateEdited = (updater: (current: ExtractedLead) => ExtractedLead) => {
    if (!edited) return;
    const next = updater(edited);
    setEditableJson(prettyJson(next));
    clearContactCandidates();
  };

  const analyze = async () => {
    setLoading(true);
    setError(null);
    setCopyState("idle");

    try {
      const res = await fetch("/api/lead-intelligence/analyze", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          source,
          brand,
          rawText,
          language: language.trim() || null,
        }),
      });
      const body = (await res.json()) as LeadAnalysisResponse | SafeErrorResponse;
      if (!res.ok || !body.ok) {
        setError((body as SafeErrorResponse).error || {
          correlationId: res.headers.get("x-correlation-id") || "unknown",
          code: "INTERNAL_ERROR",
          message: "Analysen feilet",
        });
        return;
      }
      setResponse(body);
      setEditableJson(prettyJson(body.result));
      setCriterionReviews(
        Object.fromEntries(
          flattenReviewCriteria(body.result).map((criterion) => [
            criterion.id,
            { approvalStatus: "pending", customerConfirmed: false },
          ]),
        ),
      );
      clearContactCandidates();
      setSaveError(null);
      setSaveResult(null);
    } catch {
      setError({
        correlationId: "client",
        code: "INTERNAL_ERROR",
        message: "Kunne ikke kontakte analyse-API-et.",
      });
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    setResponse(null);
    setError(null);
    setEditableJson("");
    setCopyState("idle");
    setCriterionReviews({});
    setContactCandidatesLoaded(false);
    setContactCandidates([]);
    setContactCandidateError(null);
    clearCrmContext();
    setContactDecision("continue_without_contact");
    setSelectedContactId(null);
    setSaveError(null);
    setSaveResult(null);
    setActiveWorklistItem(null);
    setWorklistHistoryExpanded(true);
    setPropertyReferencesText("");
    clearPropertyMatchPreview();
  };

  const copyJson = async () => {
    try {
      await navigator.clipboard.writeText(editableJson);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
  };

  const updateCriterionReview = (id: string, patch: Partial<CriterionReviewState>) => {
    setCriterionReviews((current) => ({
      ...current,
      [id]: {
        approvalStatus: current[id]?.approvalStatus || "pending",
        customerConfirmed: current[id]?.customerConfirmed || false,
        ...patch,
      },
    }));
    setSaveError(null);
    setSaveResult(null);
    setActiveWorklistItem(null);
    setWorklistHistoryExpanded(true);
    clearPropertyMatchPreview();
  };

  const loadContactCandidates = async () => {
    if (!edited || !persistenceEnabled) return;
    setCandidateLoading(true);
    setContactCandidatesLoaded(false);
    setContactCandidateError(null);
    try {
      const res = await fetch("/api/lead-intelligence/contact-candidates", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          brand,
          contact: edited.contact,
        }),
      });
      const body = (await res.json()) as ContactCandidatesResponse | SafeErrorResponse;
      if (!res.ok || !body.ok) {
        setContactCandidateError((body as SafeErrorResponse).error || {
          correlationId: res.headers.get("x-correlation-id") || "unknown",
          code: "INTERNAL_ERROR",
          message: "Kunne ikke hente kontaktkandidater.",
        });
        return;
      }
      setContactCandidates(body.candidates);
      setContactCandidatesLoaded(true);
      clearCrmContext();
      setContactDecision("continue_without_contact");
      setSelectedContactId(null);
      setSaveResult(null);
    } catch {
      setContactCandidateError({
        correlationId: "client",
        code: "INTERNAL_ERROR",
        message: "Kunne ikke kontakte kandidat-API-et.",
      });
    } finally {
      setCandidateLoading(false);
    }
  };

  const loadCrmContext = async () => {
    if (!edited || !persistenceEnabled) return;
    setCrmContextLoading(true);
    setCrmContextError(null);
    setCrmContextResult(null);
    try {
      const res = await fetch("/api/lead-intelligence/crm-context", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          brand,
          contact: edited.contact,
          contactIds: contactCandidates.map((candidate) => candidate.contactId),
        }),
      });
      const body = (await res.json()) as LeadIntelligenceCrmContextResponse | SafeErrorResponse;
      if (!res.ok || !body.ok) {
        setCrmContextError((body as SafeErrorResponse).error || {
          correlationId: res.headers.get("x-correlation-id") || "unknown",
          code: "INTERNAL_ERROR",
          message: "Kunne ikke hente CRM-kontekst.",
        });
        return;
      }
      setCrmContextResult(body);
      setContactCandidates(body.result.candidates);
      setContactCandidatesLoaded(true);
      setContactCandidateError(null);
      setContactDecision("continue_without_contact");
      setSelectedContactId(null);
      setSaveResult(null);
    } catch {
      setCrmContextError({
        correlationId: "client",
        code: "INTERNAL_ERROR",
        message: "Kunne ikke kontakte CRM-kontekst-API-et.",
      });
    } finally {
      setCrmContextLoading(false);
    }
  };

  const saveReview = async () => {
    if (!edited || !response || !persistenceEnabled || !allCriteriaReviewed || jsonEditor.error) return;
    setSaveLoading(true);
    setSaveError(null);
    setSaveResult(null);

    try {
      const res = await fetch("/api/lead-intelligence/review", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-correlation-id": response.correlationId,
        },
        body: JSON.stringify({
          brand,
          source,
          rawText,
          language: language.trim() || null,
          idempotencySeed: response.correlationId,
          analysis: edited,
          analysisMeta: {
            model: response.meta.model,
            promptVersion: response.meta.promptVersion,
            durationMs: response.meta.durationMs,
            repaired: response.meta.repaired,
          },
          contactDecision: {
            action: contactDecision,
            contactId: contactDecision === "connect_existing" ? selectedContactId : null,
            explicitApproval: true,
          },
          reviewedCriteria: reviewCriteria.map((criterion) => ({
            criterionType: criterion.criterionType,
            fingerprint: criterion.fingerprint,
            approvalStatus: criterionReviews[criterion.id]?.approvalStatus,
            customerConfirmed: criterionReviews[criterion.id]?.customerConfirmed || false,
          })),
        }),
      });
      const body = (await res.json()) as ReviewSaveResponse | SafeErrorResponse;
      if (!res.ok || !body.ok) {
        setSaveError((body as SafeErrorResponse).error || {
          correlationId: res.headers.get("x-correlation-id") || "unknown",
          code: "INTERNAL_ERROR",
          message: "Kunne ikke lagre review.",
        });
        return;
      }
      setSaveResult(body);
      setActiveWorklistItem(null);
      setWorklistHistoryExpanded(true);
      clearPropertyMatchPreview();
      void loadWorklist();
    } catch {
      setSaveError({
        correlationId: "client",
        code: "INTERNAL_ERROR",
        message: "Kunne ikke kontakte review-API-et.",
      });
    } finally {
      setSaveLoading(false);
    }
  };

  const previewPropertyMatches = async (mode: "auto" | "explicit") => {
    if (!saveResult || !propertyMatchingEnabled) return;
    if (mode === "explicit" && parsedPropertyReferences.error) return;
    setPropertyMatchLoading(true);
    setPropertyMatchError(null);
    setPropertyMatchResult(null);

    try {
      const res = await fetch("/api/lead-intelligence/property-matches/preview", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-correlation-id": saveResult.correlationId,
        },
        body: JSON.stringify({
          brand,
          buyerProfileId: saveResult.result.buyerProfile.id,
          ...(mode === "auto"
            ? {
                autoDiscover: true,
                candidateLimit: 120,
                maxResults: 10,
              }
            : {
                propertyReferences: parsedPropertyReferences.references,
                maxResults: parsedPropertyReferences.references.length,
              }),
        }),
      });
      const body = (await res.json()) as PropertyMatchPreviewResponse | SafeErrorResponse;
      if (!res.ok || !body.ok) {
        setPropertyMatchError((body as SafeErrorResponse).error || {
          correlationId: res.headers.get("x-correlation-id") || "unknown",
          code: "INTERNAL_ERROR",
          message: "Kunne ikke forhåndsvise eiendomsmatcher.",
        });
        return;
      }
      setPropertyMatchResult(body);
      setMatchReviewDecisions({});
      setShortlistSaveError(null);
      setShortlistSaveResult(null);
      clearPresentationDraftState();
    } catch {
      setPropertyMatchError({
        correlationId: "client",
        code: "INTERNAL_ERROR",
        message: "Kunne ikke kontakte property-match-preview-API-et.",
      });
    } finally {
      setPropertyMatchLoading(false);
    }
  };

  const saveShortlistDraft = async () => {
    if (!saveResult || !propertyMatchResult || selectedShortlistItems.length === 0) return;
    setShortlistSaveLoading(true);
    setShortlistSaveError(null);
    setShortlistSaveResult(null);
    clearPresentationDraftState();

    try {
      const res = await fetch("/api/lead-intelligence/shortlists", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-correlation-id": propertyMatchResult.correlationId,
        },
        body: JSON.stringify({
          brand,
          buyerProfileId: saveResult.result.buyerProfile.id,
          title: `Shortlist ${new Date().toLocaleDateString("nb-NO")}`,
          idempotencySeed: propertyMatchResult.correlationId,
          items: selectedShortlistItems,
        }),
      });
      const body = (await res.json()) as ShortlistSaveResponse | SafeErrorResponse;
      if (!res.ok || !body.ok) {
        setShortlistSaveError((body as SafeErrorResponse).error || {
          correlationId: res.headers.get("x-correlation-id") || "unknown",
          code: "INTERNAL_ERROR",
          message: "Kunne ikke lagre shortlist-utkast.",
        });
        return;
      }
      setShortlistSaveResult(body);
      clearPresentationDraftState();
    } catch {
      setShortlistSaveError({
        correlationId: "client",
        code: "INTERNAL_ERROR",
        message: "Kunne ikke kontakte shortlist-API-et.",
      });
    } finally {
      setShortlistSaveLoading(false);
    }
  };

  const copyEmailDraftText = async () => {
    const draft = presentationDraftResult?.result.messageDraft
      ? {
          subject: editableEmailSubject,
          body: editableEmailBody,
        }
      : shortlistEmailDraft;
    if (!draft) return;
    try {
      await navigator.clipboard.writeText(`Emne: ${draft.subject}\n\n${draft.body}`);
      setEmailDraftCopyState("copied");
    } catch {
      setEmailDraftCopyState("failed");
    }
  };

  const copyEmailDraftHtml = async () => {
    const draft = presentationDraftResult?.result.messageDraft;
    if (!draft?.bodyHtml) return;
    try {
      if ("ClipboardItem" in window && typeof navigator.clipboard.write === "function") {
        await navigator.clipboard.write([
          new ClipboardItem({
            "text/html": new Blob([draft.bodyHtml], { type: "text/html" }),
            "text/plain": new Blob([`Emne: ${draft.subject}\n\n${draft.bodyText}`], { type: "text/plain" }),
          }),
        ]);
      } else {
        await navigator.clipboard.writeText(draft.bodyHtml);
      }
      setEmailDraftHtmlCopyState("copied");
    } catch {
      setEmailDraftHtmlCopyState("failed");
    }
  };

  const copyPresentationDraft = async () => {
    if (!shortlistPresentationText) return;
    try {
      await navigator.clipboard.writeText(shortlistPresentationText);
      setPresentationCopyState("copied");
    } catch {
      setPresentationCopyState("failed");
    }
  };

  const savePresentationDraft = async () => {
    if (!saveResult || !shortlistSaveResult) return;
    setPresentationDraftLoading(true);
    setPresentationDraftError(null);
    setPresentationDraftResult(null);
    setEditableEmailSubject("");
    setEditableEmailBody("");
    resetDraftCopyState();

    try {
      const res = await fetch("/api/lead-intelligence/presentations", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-correlation-id": shortlistSaveResult.correlationId,
        },
        body: JSON.stringify({
          brand,
          buyerProfileId: saveResult.result.buyerProfile.id,
          shortlistId: shortlistSaveResult.result.shortlistId,
          title: shortlistPresentation?.title || `Kundepresentasjon ${new Date().toLocaleDateString("nb-NO")}`,
          idempotencySeed: shortlistSaveResult.correlationId,
          language: language || null,
        }),
      });
      const body = (await res.json()) as PresentationDraftResponse | SafeErrorResponse;
      if (!res.ok || !body.ok) {
        setPresentationDraftError((body as SafeErrorResponse).error || {
          correlationId: res.headers.get("x-correlation-id") || "unknown",
          code: "INTERNAL_ERROR",
          message: "Kunne ikke lagre presentasjonsutkast.",
        });
        return;
      }
      setPresentationDraftResult(body);
      setEditableEmailSubject(body.result.messageDraft.subject);
      setEditableEmailBody(body.result.messageDraft.bodyText);
      window.setTimeout(() => {
        document.getElementById("lead-intelligence-active-presentation-draft")?.scrollIntoView({
          behavior: "smooth",
          block: "nearest",
        });
      }, 50);
    } catch {
      setPresentationDraftError({
        correlationId: "client",
        code: "INTERNAL_ERROR",
        message: "Kunne ikke kontakte presentasjons-API-et.",
      });
    } finally {
      setPresentationDraftLoading(false);
    }
  };

  const loadPresentationDraftById = async (presentationId: string) => {
    setPresentationDraftLoading(true);
    setPresentationDraftError(null);
    setPresentationDraftResult(null);
    setEditableEmailSubject("");
    setEditableEmailBody("");
    resetDraftCopyState();

    try {
      const params = new URLSearchParams({
        brand,
        presentationId,
      });
      const res = await fetch(`/api/lead-intelligence/presentations?${params.toString()}`, {
        method: "GET",
        headers: { accept: "application/json" },
      });
      const body = (await res.json()) as PresentationDraftResponse | SafeErrorResponse;
      if (!res.ok || !body.ok) {
        setPresentationDraftError((body as SafeErrorResponse).error || {
          correlationId: res.headers.get("x-correlation-id") || "unknown",
          code: "INTERNAL_ERROR",
          message: "Kunne ikke hente lagret presentasjonsutkast.",
        });
        return;
      }
      setShortlistSaveResult({
        ok: true,
        correlationId: body.correlationId,
        result: {
          shortlistId: body.result.shortlistId,
          duplicate: true,
          conflict: false,
          itemCount: body.result.itemCount,
          sideEffects: {
            leadsCreated: false,
            contactsCreated: false,
            emailsSent: false,
            propertyMatchingStarted: false,
            presentationCreated: false,
          },
        },
      });
      setPresentationDraftResult(body);
      setEditableEmailSubject(body.result.messageDraft.subject);
      setEditableEmailBody(body.result.messageDraft.bodyText);
      window.setTimeout(() => {
        document.getElementById("lead-intelligence-active-presentation-draft")?.scrollIntoView({
          behavior: "smooth",
          block: "nearest",
        });
      }, 50);
    } catch {
      setPresentationDraftError({
        correlationId: "client",
        code: "INTERNAL_ERROR",
        message: "Kunne ikke kontakte presentasjons-API-et.",
      });
    } finally {
      setPresentationDraftLoading(false);
    }
  };

  const loadLatestPresentationDraft = async () => {
    if (!activeWorklistItem?.latestPresentationId) return;
    await loadPresentationDraftById(activeWorklistItem.latestPresentationId);
  };

  const loadPresentationDraftHistory = async () => {
    if (!activeWorklistItem?.buyerProfileId) return;
    setPresentationDraftHistoryLoading(true);
    setPresentationDraftHistoryError(null);

    try {
      const params = new URLSearchParams({
        brand,
        buyerProfileId: activeWorklistItem.buyerProfileId,
        limit: "5",
      });
      const res = await fetch(`/api/lead-intelligence/presentations?${params.toString()}`, {
        method: "GET",
        headers: { accept: "application/json" },
      });
      const body = (await res.json()) as PresentationDraftHistoryResponse | SafeErrorResponse;
      if (!res.ok || !body.ok) {
        setPresentationDraftHistoryError((body as SafeErrorResponse).error || {
          correlationId: res.headers.get("x-correlation-id") || "unknown",
          code: "INTERNAL_ERROR",
          message: "Kunne ikke hente utkasthistorikk.",
        });
        return;
      }
      setPresentationDraftHistoryResult(body);
    } catch {
      setPresentationDraftHistoryError({
        correlationId: "client",
        code: "INTERNAL_ERROR",
        message: "Kunne ikke kontakte presentasjons-API-et.",
      });
    } finally {
      setPresentationDraftHistoryLoading(false);
    }
  };

  const loadWorklist = async () => {
    if (!persistenceEnabled) return;
    setWorklistLoading(true);
    setWorklistError(null);

    try {
      const params = new URLSearchParams({
        brand,
        limit: "20",
      });
      const res = await fetch(`/api/lead-intelligence/worklist?${params.toString()}`, {
        method: "GET",
        headers: { accept: "application/json" },
      });
      const body = (await res.json()) as LeadIntelligenceWorklistResponse | SafeErrorResponse;
      if (!res.ok || !body.ok) {
        setWorklistError((body as SafeErrorResponse).error || {
          correlationId: res.headers.get("x-correlation-id") || "unknown",
          code: "INTERNAL_ERROR",
          message: "Kunne ikke hente arbeidslisten.",
        });
        return;
      }
      setWorklistResult(body);
    } catch {
      setWorklistError({
        correlationId: "client",
        code: "INTERNAL_ERROR",
        message: "Kunne ikke kontakte arbeidsliste-API-et.",
      });
    } finally {
      setWorklistLoading(false);
    }
  };

  const loadSavedProfileContactCandidates = async () => {
    if (!activeWorklistItem || !persistenceEnabled) return;
    setProfileContactCandidatesLoading(true);
    setProfileContactCandidatesError(null);
    setProfileContactLinkError(null);
    setProfileContactLinkResult(null);
    setProfileSelectedContactId(null);

    try {
      const res = await fetch(
        `/api/lead-intelligence/buyer-profiles/${activeWorklistItem.buyerProfileId}/contact-candidates`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ brand }),
        },
      );
      const body = (await res.json()) as SavedProfileContactCandidatesResponse | SafeErrorResponse;
      if (!res.ok || !body.ok) {
        setProfileContactCandidatesError((body as SafeErrorResponse).error || {
          correlationId: res.headers.get("x-correlation-id") || "unknown",
          code: "INTERNAL_ERROR",
          message: "Kunne ikke hente kontaktkandidater for lagret profil.",
        });
        return;
      }
      setProfileContactCandidatesResult(body);
      if (body.result.linkedContact) {
        setActiveWorklistItem((current) =>
          current && current.buyerProfileId === body.result.buyerProfileId
            ? {
                ...current,
                contactLinked: true,
                linkedContact: body.result.linkedContact,
              }
            : current,
        );
      }
    } catch {
      setProfileContactCandidatesError({
        correlationId: "client",
        code: "INTERNAL_ERROR",
        message: "Kunne ikke kontakte profil-kandidat-API-et.",
      });
    } finally {
      setProfileContactCandidatesLoading(false);
    }
  };

  const linkSavedProfileContact = async (contactId: string) => {
    if (!activeWorklistItem || !persistenceEnabled || !connectExistingEnabled) return;
    const confirmed = window.confirm(
      "Koble denne buyer profile til den valgte eksisterende kontakten? Kontaktkortet oppdateres ikke, og det opprettes ikke lead eller e-post.",
    );
    if (!confirmed) return;

    setProfileSelectedContactId(contactId);
    setProfileContactLinkLoading(true);
    setProfileContactLinkError(null);
    setProfileContactLinkResult(null);

    try {
      const res = await fetch(
        `/api/lead-intelligence/buyer-profiles/${activeWorklistItem.buyerProfileId}/contact-link`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ brand, contactId }),
        },
      );
      const body = (await res.json()) as SavedProfileContactLinkResponse | SafeErrorResponse;
      if (!res.ok || !body.ok) {
        setProfileContactLinkError((body as SafeErrorResponse).error || {
          correlationId: res.headers.get("x-correlation-id") || "unknown",
          code: "INTERNAL_ERROR",
          message: "Kunne ikke koble eksisterende kontakt.",
        });
        return;
      }

      setProfileContactLinkResult(body);
      setActiveWorklistItem((current) =>
        current && current.buyerProfileId === body.result.buyerProfileId
          ? {
              ...current,
              contactLinked: true,
              linkedContact: body.result.linkedContact,
            }
          : current,
      );
      setSaveResult((current) =>
        current
          ? {
              ...current,
              result: {
                ...current.result,
                contactCandidates: {
                  ...current.result.contactCandidates,
                  selectedContactId: body.result.contactId,
                  decision: "connect_existing",
                  linkedContact: true,
                  duplicate: body.result.duplicate,
                },
              },
            }
          : current,
      );
      void loadWorklist();
    } catch {
      setProfileContactLinkError({
        correlationId: "client",
        code: "INTERNAL_ERROR",
        message: "Kunne ikke kontakte kontaktkoblings-API-et.",
      });
    } finally {
      setProfileContactLinkLoading(false);
    }
  };

  const archiveActiveProfile = async () => {
    if (!activeWorklistItem || !persistenceEnabled) return;
    const confirmed = window.confirm(
      "Arkiver denne buyer profile? Den fjernes fra arbeidslisten, men slettes ikke fysisk og kan beholdes som audit-historikk.",
    );
    if (!confirmed) return;

    setProfileArchiveLoading(true);
    setProfileArchiveError(null);
    setProfileArchiveResult(null);

    try {
      const res = await fetch(
        `/api/lead-intelligence/buyer-profiles/${activeWorklistItem.buyerProfileId}/archive`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ brand }),
        },
      );
      const body = (await res.json()) as SavedProfileArchiveResponse | SafeErrorResponse;
      if (!res.ok || !body.ok) {
        setProfileArchiveError((body as SafeErrorResponse).error || {
          correlationId: res.headers.get("x-correlation-id") || "unknown",
          code: "INTERNAL_ERROR",
          message: "Kunne ikke arkivere profilen.",
        });
        return;
      }

      setActiveWorklistItem(null);
      setSaveResult(null);
      clearActiveProfileActions();
      setProfileArchiveResult(body);
      clearPropertyMatchPreview();
      setWorklistHistoryExpanded(true);
      void loadWorklist();
    } catch {
      setProfileArchiveError({
        correlationId: "client",
        code: "INTERNAL_ERROR",
        message: "Kunne ikke kontakte profilarkiv-API-et.",
      });
    } finally {
      setProfileArchiveLoading(false);
    }
  };

  const continueFromWorklistItem = (item: LeadIntelligenceWorklistItem) => {
    if (!item.analysisRunId) return;
    clearContactCandidates();
    clearActiveProfileActions();
    setResponse(null);
    setError(null);
    setEditableJson("");
    setCriterionReviews({});
    setCopyState("idle");
    setActiveWorklistItem(item);
    setWorklistHistoryExpanded(false);
    setSaveError(null);
    setSaveResult({
      ok: true,
      correlationId: generateClientCorrelationId(),
      result: {
        status: {
          newlySaved: false,
          duplicate: true,
          conflict: false,
        },
        intake: {
          id: item.intakeId,
          duplicate: true,
        },
        analysisRun: {
          id: item.analysisRunId,
          duplicate: true,
        },
        buyerProfile: {
          id: item.buyerProfileId,
          criterionCount: item.criterionCount,
          duplicate: true,
        },
        contactCandidates: {
          recorded: 0,
          selectedContactId: null,
          decision: "continue_without_contact",
          createdContact: false,
          linkedContact: item.contactLinked,
          duplicate: true,
        },
      },
      sideEffects: {
        contactsCreated: false,
        contactUpdated: false,
        emailSent: false,
        propertyMatchingStarted: false,
      },
    });
    window.setTimeout(() => {
      document.getElementById("lead-intelligence-active-profile")?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 50);
  };

  useEffect(() => {
    if (!featureEnabled || !persistenceEnabled) return;
    void loadWorklist();
    // Auto-refresh when the user changes brand; loadWorklist is intentionally not a dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [featureEnabled, persistenceEnabled, brand]);

  useEffect(() => {
    if (returnUrlHydratedRef.current || !worklistResult || typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const buyerProfileId = params.get("buyerProfileId");
    const presentationId = params.get("presentationId");
    if (!buyerProfileId && !presentationId) return;

    const item = worklistResult.result.items.find((candidate) =>
      (buyerProfileId && candidate.buyerProfileId === buyerProfileId) ||
      (presentationId && candidate.latestPresentationId === presentationId),
    );
    if (!item) return;

    returnUrlHydratedRef.current = true;
    continueFromWorklistItem(item);
    if (presentationId) {
      void loadPresentationDraftById(presentationId);
    } else if (item.latestPresentationId) {
      void loadPresentationDraftById(item.latestPresentationId);
    }
    // Restore should run once against the first loaded worklist snapshot from the URL.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [worklistResult]);

  const presentationDraftReturnUrl = presentationDraftResult
    ? leadIntelligenceDraftReturnUrl({
        buyerProfileId: presentationDraftResult.result.buyerProfileId,
        presentationId: presentationDraftResult.result.presentationId,
        messageDraftId: presentationDraftResult.result.messageDraftId,
      })
    : null;

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary-400" />
            <Badge variant="default">Preview</Badge>
          </div>
          <h1 className="text-3xl font-bold text-white">AI Lead Inbox</h1>
          <p className="mt-2 max-w-3xl text-sm text-slate-400">
            Lim inn en henvendelse og få et strukturert forslag til kontakt, kjøpsstatus,
            budsjett, krav, ønsker og avvisningskriterier. Previewet skriver ikke til CRM.
          </p>
        </div>
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-100">
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 h-5 w-5 text-emerald-300" />
            <div>
              <p className="font-semibold">Freddy kontrollerer før noe lagres.</p>
              <p className="text-emerald-200/80">
                Ingen data lagres før du godkjenner i en senere fase. Ingen melding sendes til kunden.
              </p>
            </div>
          </div>
        </div>
      </div>

      {!featureEnabled && (
        <Card className="border-amber-500/30 bg-amber-500/10">
          <CardContent className="flex items-start gap-3 pt-5 text-amber-100">
            <AlertTriangle className="mt-0.5 h-5 w-5 text-amber-300" />
            <div>
              <p className="font-semibold">Lead Intelligence er deaktivert i dette miljøet.</p>
              <p className="text-sm text-amber-100/80">
                Serveren må ha REALTYFLOW_LEAD_INTELLIGENCE_ENABLED=true for å åpne analysepreviewet.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {featureEnabled && !persistenceEnabled && (
        <Card className="border-amber-500/30 bg-amber-500/10">
          <CardContent className="flex items-start gap-3 pt-5 text-amber-100">
            <AlertTriangle className="mt-0.5 h-5 w-5 text-amber-300" />
            <div>
              <p className="font-semibold">Lagring er deaktivert i dette miljøet.</p>
              <p className="text-sm text-amber-100/80">
                Analysepreviewet kan brukes, men kontaktkandidatoppslag og lagring krever
                REALTYFLOW_LEAD_INTELLIGENCE_PERSISTENCE_ENABLED=true på serveren.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {featureEnabled && (
        <Card>
          <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5 text-primary-400" />
                Lagrede tester og kjøperprofiler
              </CardTitle>
              <p className="mt-1 text-sm text-slate-400">
                Tidligere lagrede tester ligger her. Velg en lagret buyer profile for å fortsette med
                eiendomsmatch uten å analysere henvendelsen på nytt.
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={loadWorklist}
              disabled={!persistenceEnabled || worklistLoading}
            >
              {worklistLoading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 h-4 w-4" />
              )}
              Oppdater lagrede saker
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            {!persistenceEnabled && (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-100">
                Arbeidslisten krever persistence-flagget, fordi den bare leser allerede lagrede intake- og
                buyer-profile-rader.
              </div>
            )}

            {worklistError && (
              <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-100">
                <p className="font-semibold">{worklistError.code}</p>
                <p className="mt-1">{worklistError.message}</p>
                {worklistError.details && (
                  <pre className="mt-3 max-h-40 overflow-auto rounded border border-red-400/20 bg-red-950/30 p-2 text-xs text-red-100/90">
                    {prettyJson(worklistError.details)}
                  </pre>
                )}
                <p className="mt-2 text-xs text-red-200/80">Correlation ID: {worklistError.correlationId}</p>
              </div>
            )}

            {persistenceEnabled && !worklistResult && !worklistLoading && !worklistError && (
              <div className="rounded-lg border border-slate-700/60 bg-slate-900/50 p-6 text-sm text-slate-400">
                Arbeidslisten hentes automatisk. Trykk Oppdater lagrede saker hvis du nettopp har lagret noe
                i en annen fane.
              </div>
            )}

            {worklistResult && worklistResult.result.items.length === 0 && (
              <div className="rounded-lg border border-slate-700/60 bg-slate-900/50 p-6 text-sm text-slate-400">
                Ingen lagrede Lead Intelligence-saker for dette brandet ennå.
              </div>
            )}

            {worklistResult && worklistResult.result.items.length > 0 && (
              <>
                <div className="rounded-lg border border-primary-500/30 bg-primary-500/10 p-4 text-sm text-primary-100">
                  <p className="font-semibold">{worklistResult.result.items.length} lagrede sak(er) hentet.</p>
                  <p className="mt-1 text-primary-100/80">
                    Dette er historikken over tidligere tester for valgt brand. Knappen Fortsett med denne profilen
                    setter buyer profile som aktiv for match-preview uten å opprette lead, kontakt eller e-post.
                  </p>
                </div>
                {profileArchiveResult && !activeWorklistItem && (
                  <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-100">
                    <p className="font-semibold">
                      Profil {shortPropertyId(profileArchiveResult.result.buyerProfileId)} er arkivert.
                    </p>
                    <p className="mt-1 text-xs text-emerald-100/75">
                      Den er fjernet fra arbeidslisten, men ikke fysisk slettet. Ingen kontakt, lead, e-post,
                      presentasjon eller matchingjobb ble opprettet.
                    </p>
                  </div>
                )}
                {activeWorklistItem && saveResult && (
                  <div
                    id="lead-intelligence-active-profile"
                    className="rounded-lg border border-primary-400/60 bg-slate-950 p-4 shadow-lg shadow-primary-950/20"
                  >
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div>
                        <p className="text-xs uppercase tracking-wide text-primary-300">Aktiv lagret profil</p>
                        <h2 className="mt-1 text-base font-semibold text-slate-100">
                          {activeWorklistItem.summary || `Buyer profile ${shortPropertyId(activeWorklistItem.buyerProfileId)}`}
                        </h2>
                        <p className="mt-1 text-sm text-slate-400">
                          Buyer profile {activeWorklistItem.buyerProfileId} · kriterier {activeWorklistItem.criterionCount}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Badge variant="default">Valgt for videre arbeid</Badge>
                        <Badge variant={propertyMatchingEnabled ? "success" : "secondary"}>
                          {propertyMatchingEnabled ? "Match aktivert" : "Matching av"}
                        </Badge>
                        <Badge variant={activeWorklistItem.contactLinked ? "success" : "outline"}>
                          {activeWorklistItem.contactLinked ? "Kontakt koblet" : "Kontakt ikke koblet"}
                        </Badge>
                      </div>
                    </div>

                    <div className={`mt-4 grid gap-4 ${propertyMatchResult ? "lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]" : "lg:grid-cols-1"}`}>
                      <div className="space-y-3">
                        <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-3 text-sm text-slate-300">
                          <p className="font-semibold text-slate-100">Neste handling</p>
                          <p className="mt-1 text-xs text-slate-400">
                            Kjør automatisk søk i eksisterende eiendommer, eller lim inn referanser hvis du vil teste
                            konkrete boliger. Dette oppretter ikke lead, kontakt, e-post eller matchingjobb.
                          </p>
                        </div>

                        <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-3 text-sm text-slate-300">
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                            <div>
                              <p className="font-semibold text-slate-100">Kontaktkort</p>
                              <p className="mt-1 text-xs text-slate-400">
                                Se koblet kontakt eller finn en eksisterende kontakt for denne lagrede profilen.
                                Ingen ny kontakt opprettes her.
                              </p>
                            </div>
                            <Button
                              type="button"
                              variant="destructive"
                              size="sm"
                              onClick={archiveActiveProfile}
                              disabled={profileArchiveLoading}
                            >
                              {profileArchiveLoading ? (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              ) : (
                                <Trash2 className="mr-2 h-4 w-4" />
                              )}
                              Arkiver profil
                            </Button>
                          </div>

                          {activeWorklistItem.linkedContact ? (
                            <div className="mt-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-emerald-100">
                              <p className="text-xs uppercase tracking-wide text-emerald-200/80">
                                Koblet eksisterende kontakt
                              </p>
                              <p className="mt-1 font-semibold text-emerald-50">
                                {activeWorklistItem.linkedContact.name || "Uten navn"}
                              </p>
                              <p className="mt-1 text-xs text-emerald-100/75">
                                {activeWorklistItem.linkedContact.maskedPhone || "ingen telefon"} ·{" "}
                                {activeWorklistItem.linkedContact.maskedEmail || "ingen e-post"}
                              </p>
                              <p className="mt-2 text-xs text-emerald-100/70">
                                Kontaktdata er hentet read-only og ble ikke overskrevet av Lead Intelligence.
                              </p>
                            </div>
                          ) : (
                            <div className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-amber-100">
                              <p className="font-semibold">Ingen kontakt koblet ennå.</p>
                              <p className="mt-1 text-xs text-amber-100/80">
                                Du kan søke etter eksisterende kontakt fra den lagrede analysen. Opprett ny kontakt er
                                fortsatt en egen godkjenningsfase.
                              </p>
                            </div>
                          )}

                          <div className="mt-3 flex flex-wrap gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={loadSavedProfileContactCandidates}
                              disabled={profileContactCandidatesLoading || !persistenceEnabled}
                            >
                              {profileContactCandidatesLoading ? (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              ) : (
                                <Search className="mr-2 h-4 w-4" />
                              )}
                              Finn kontaktkandidater
                            </Button>
                            <Button type="button" variant="outline" size="sm" disabled>
                              <Users className="mr-2 h-4 w-4" />
                              Opprett ny kontakt kommer i egen gate
                            </Button>
                          </div>

                          {profileArchiveResult && (
                            <div className="mt-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-100">
                              Profil {shortPropertyId(profileArchiveResult.result.buyerProfileId)} er arkivert.
                              Den er fjernet fra arbeidslisten, men ikke fysisk slettet.
                            </div>
                          )}

                          {profileArchiveError && (
                            <div className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-100">
                              <p className="font-semibold">{profileArchiveError.code}</p>
                              <p className="mt-1">{profileArchiveError.message}</p>
                              <p className="mt-2 text-red-100/70">Correlation ID: {profileArchiveError.correlationId}</p>
                            </div>
                          )}

                          {profileContactCandidatesError && (
                            <div className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-100">
                              <p className="font-semibold">{profileContactCandidatesError.code}</p>
                              <p className="mt-1">{profileContactCandidatesError.message}</p>
                              <p className="mt-2 text-amber-100/80">
                                Correlation ID: {profileContactCandidatesError.correlationId}
                              </p>
                            </div>
                          )}

                          {profileContactLinkError && (
                            <div className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-100">
                              <p className="font-semibold">{profileContactLinkError.code}</p>
                              <p className="mt-1">{profileContactLinkError.message}</p>
                              <p className="mt-2 text-red-100/70">Correlation ID: {profileContactLinkError.correlationId}</p>
                            </div>
                          )}

                          {profileContactLinkResult && (
                            <div className="mt-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-100">
                              Kontakt {profileContactLinkResult.result.linkedContact.name || shortPropertyId(profileContactLinkResult.result.contactId)}
                              {" "}er koblet til buyer profile. Ingen kontakt, lead eller e-post ble opprettet.
                            </div>
                          )}

                          {profileContactCandidatesResult && (
                            <div className="mt-3 space-y-2">
                              {profileContactCandidatesResult.result.candidates.length === 0 ? (
                                <p className="rounded-lg border border-slate-800 bg-slate-950/60 p-3 text-xs text-slate-400">
                                  Ingen eksisterende kontaktkandidater funnet for denne profilen.
                                </p>
                              ) : (
                                profileContactCandidatesResult.result.candidates.map((candidate) => (
                                  <div
                                    key={`${candidate.matchType}:${candidate.contactId}`}
                                    className="rounded-lg border border-slate-800 bg-slate-950/70 p-3"
                                  >
                                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                      <label className="flex min-w-0 cursor-pointer items-start gap-3">
                                        <input
                                          type="radio"
                                          name="saved-profile-contact-candidate"
                                          checked={profileSelectedContactId === candidate.contactId}
                                          onChange={() => {
                                            setProfileSelectedContactId(candidate.contactId);
                                            setProfileContactLinkError(null);
                                            setProfileContactLinkResult(null);
                                          }}
                                          className="mt-1 h-4 w-4"
                                          disabled={Boolean(activeWorklistItem.linkedContact) || !connectExistingEnabled}
                                        />
                                        <span className="min-w-0">
                                          <span className="block font-medium text-slate-100">
                                            {candidate.name || "Uten navn"}
                                          </span>
                                          <span className="mt-1 block text-xs text-slate-500">
                                            {candidate.maskedPhone || "ingen telefon"} ·{" "}
                                            {candidate.maskedEmail || "ingen e-post"}
                                          </span>
                                          <span className="mt-1 block text-xs text-slate-400">
                                            {candidate.matchType} · {Math.round(candidate.confidence * 100)}%
                                          </span>
                                        </span>
                                      </label>
                                      <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        onClick={() => linkSavedProfileContact(candidate.contactId)}
                                        disabled={
                                          profileContactLinkLoading ||
                                          Boolean(activeWorklistItem.linkedContact) ||
                                          !connectExistingEnabled
                                        }
                                      >
                                        {profileContactLinkLoading && profileSelectedContactId === candidate.contactId ? (
                                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        ) : (
                                          <UserCheck className="mr-2 h-4 w-4" />
                                        )}
                                        Koble
                                      </Button>
                                    </div>
                                  </div>
                                ))
                              )}
                              {!connectExistingEnabled && (
                                <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-100">
                                  Kobling til eksisterende kontakt er ikke aktivert i dette miljøet.
                                </p>
                              )}
                            </div>
                          )}
                        </div>

                        {activeWorklistItem.latestPresentationId && (
                          <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-100">
                            <p className="font-semibold">Siste lagrede e-postutkast finnes</p>
                            <p className="mt-1 text-xs text-emerald-100/75">
                              Presentation {shortPropertyId(activeWorklistItem.latestPresentationId)}
                              {activeWorklistItem.latestMessageDraftId
                                ? ` · Message draft ${shortPropertyId(activeWorklistItem.latestMessageDraftId)}`
                                : ""}
                            </p>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="mt-3"
                              onClick={loadLatestPresentationDraft}
                              disabled={presentationDraftLoading}
                            >
                              {presentationDraftLoading ? (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              ) : (
                                <RefreshCw className="mr-2 h-4 w-4" />
                              )}
                              Åpne siste e-postutkast
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="ml-2 mt-3"
                              onClick={loadPresentationDraftHistory}
                              disabled={presentationDraftHistoryLoading}
                            >
                              {presentationDraftHistoryLoading ? (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              ) : (
                                <MessageSquareText className="mr-2 h-4 w-4" />
                              )}
                              Vis utkasthistorikk
                            </Button>
                            <p className="mt-2 text-xs text-emerald-100/70">
                              Hentes read-only og vises lokalt. Det sendes fortsatt ingen e-post.
                            </p>
                          </div>
                        )}

                        {presentationDraftHistoryResult && (
                          <div className="rounded-lg border border-slate-700 bg-slate-950/70 p-3 text-sm text-slate-200">
                            <p className="font-semibold text-slate-100">
                              Utkasthistorikk ({presentationDraftHistoryResult.result.items.length})
                            </p>
                            {presentationDraftHistoryResult.result.items.length === 0 ? (
                              <p className="mt-2 text-xs text-slate-500">
                                Ingen presentasjons- eller e-postutkast er lagret for denne profilen ennå.
                              </p>
                            ) : (
                              <div className="mt-3 space-y-2">
                                {presentationDraftHistoryResult.result.items.map((item) => (
                                  <div
                                    key={item.presentationId}
                                    className="rounded-lg border border-slate-800 bg-slate-900/70 p-3"
                                  >
                                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                                      <div>
                                        <p className="font-medium text-slate-100">{item.subject}</p>
                                        <p className="mt-1 text-xs text-slate-400">
                                          Presentation {shortPropertyId(item.presentationId)} · Message draft{" "}
                                          {shortPropertyId(item.messageDraftId)} · {item.itemCount} bolig(er)
                                        </p>
                                        <p className="mt-1 text-xs text-slate-500">
                                          Status: {item.status} · E-poststatus: {item.messageStatus} · Lagret{" "}
                                          {formatDateTime(item.messageDraftCreatedAt)}
                                        </p>
                                      </div>
                                      <Button
                                        type="button"
                                        size="sm"
                                        variant="outline"
                                        onClick={() => loadPresentationDraftById(item.presentationId)}
                                        disabled={presentationDraftLoading}
                                      >
                                        Åpne
                                      </Button>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                            <p className="mt-3 text-xs text-slate-500">
                              Historikken henter bare metadata. Selve e-postteksten åpnes først når du trykker Åpne.
                            </p>
                          </div>
                        )}

                        {presentationDraftHistoryError && !propertyMatchResult && (
                          <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-100">
                            <p className="font-semibold">{presentationDraftHistoryError.code}</p>
                            <p className="mt-1">{presentationDraftHistoryError.message}</p>
                            {presentationDraftHistoryError.details && (
                              <pre className="mt-2 max-h-40 overflow-auto rounded bg-red-950/50 p-2 text-xs text-red-50">
                                {prettyJson(presentationDraftHistoryError.details)}
                              </pre>
                            )}
                            <p className="mt-2 text-xs text-red-100/70">
                              Correlation ID: {presentationDraftHistoryError.correlationId}
                            </p>
                          </div>
                        )}

                        {presentationDraftResult?.result.loadedFromHistory && (
                          <div
                            id="lead-intelligence-active-presentation-draft"
                            className="rounded-lg border border-emerald-400/30 bg-slate-950/80 p-3 text-sm text-emerald-100"
                          >
                            <p className="font-semibold text-emerald-50">
                              Lagret presentasjonsutkast hentet read-only.
                            </p>
                            <p className="mt-1 text-xs text-emerald-100/70">
                              Presentation {presentationDraftResult.result.presentationId} · Message draft{" "}
                              {presentationDraftResult.result.messageDraftId}
                            </p>
                            <p className="mt-1 text-xs text-emerald-100/70">
                              Status: {presentationDraftResult.result.status} · E-poststatus:{" "}
                              {presentationDraftResult.result.messageStatus} · E-post sendt: nei
                            </p>

                            <div className="mt-3 flex flex-wrap gap-2">
                              <Button type="button" variant="outline" size="sm" onClick={copyEmailDraftText}>
                                <Clipboard className="mr-2 h-4 w-4" />
                                Kopier e-posttekst
                              </Button>
                              {presentationDraftResult.result.messageDraft.bodyHtml && (
                                <Button type="button" variant="outline" size="sm" onClick={copyEmailDraftHtml}>
                                  <Clipboard className="mr-2 h-4 w-4" />
                                  Kopier HTML
                                </Button>
                              )}
                            </div>

                            <div className="mt-3 space-y-3">
                              <label
                                className="block text-xs font-semibold text-slate-300"
                                htmlFor="active-profile-history-email-subject"
                              >
                                Emne
                              </label>
                              <input
                                id="active-profile-history-email-subject"
                                value={editableEmailSubject}
                                onChange={(event) => {
                                  setEditableEmailSubject(event.target.value);
                                  resetDraftCopyState();
                                }}
                                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-primary-500"
                              />
                              <label
                                className="block text-xs font-semibold text-slate-300"
                                htmlFor="active-profile-history-email-body"
                              >
                                E-posttekst
                              </label>
                              <textarea
                                id="active-profile-history-email-body"
                                value={editableEmailBody}
                                onChange={(event) => {
                                  setEditableEmailBody(event.target.value);
                                  resetDraftCopyState();
                                }}
                                rows={12}
                                className="w-full resize-y rounded-lg border border-slate-700 bg-slate-950 px-3 py-3 font-mono text-xs text-slate-100 outline-none focus:border-primary-500"
                              />
                            </div>
                            <p className="mt-2 text-xs text-emerald-100/70">
                              Endringer her er lokale. Ingen e-post sendes fra denne visningen.
                            </p>
                            {emailDraftCopyState === "copied" && (
                              <p className="mt-2 text-xs text-emerald-300">E-posttekst kopiert.</p>
                            )}
                            {emailDraftCopyState === "failed" && (
                              <p className="mt-2 text-xs text-red-300">Kunne ikke kopiere e-posttekst.</p>
                            )}
                            {emailDraftHtmlCopyState === "copied" && (
                              <p className="mt-2 text-xs text-emerald-300">HTML-utkast kopiert.</p>
                            )}
                            {emailDraftHtmlCopyState === "failed" && (
                              <p className="mt-2 text-xs text-red-300">Kunne ikke kopiere HTML-utkast.</p>
                            )}
                            <InternalPresentationPreview
                              preview={presentationDraftResult.result.presentationPreview}
                              returnTo={presentationDraftReturnUrl}
                            />
                          </div>
                        )}

                        {presentationDraftError && !propertyMatchResult && (
                          <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-100">
                            <p className="font-semibold">{presentationDraftError.code}</p>
                            <p className="mt-1">{presentationDraftError.message}</p>
                            {presentationDraftError.details && (
                              <pre className="mt-2 max-h-40 overflow-auto rounded bg-red-950/50 p-2 text-xs text-red-50">
                                {prettyJson(presentationDraftError.details)}
                              </pre>
                            )}
                            <p className="mt-2 text-xs text-red-100/70">
                              Correlation ID: {presentationDraftError.correlationId}
                            </p>
                          </div>
                        )}

                        <div className="space-y-2">
                          <FieldLabel>Eiendomsreferanser, valgfritt</FieldLabel>
                          <textarea
                            value={propertyReferencesText}
                            onChange={(event) => {
                              setPropertyReferencesText(event.target.value);
                              clearPropertyMatchPreview();
                            }}
                            rows={3}
                            placeholder="F.eks. N8513, N8514 eller én database-UUID per linje..."
                            className="w-full resize-y rounded-lg border border-slate-600 bg-slate-950 px-3 py-3 font-mono text-xs text-slate-100 outline-none focus:border-primary-500"
                          />
                          {parsedPropertyReferences.error ? (
                            <p className="text-sm text-amber-300">{parsedPropertyReferences.error}</p>
                          ) : (
                            <p className="text-xs text-slate-500">
                              Tomt felt bruker automatisk søk i eksisterende eiendommer.
                            </p>
                          )}
                        </div>

                        <div className="flex flex-wrap gap-2">
                          <Button
                            type="button"
                            onClick={() => previewPropertyMatches("auto")}
                            disabled={propertyMatchLoading || !propertyMatchingEnabled}
                          >
                            {propertyMatchLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
                            Finn aktuelle eiendommer automatisk
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => previewPropertyMatches("explicit")}
                            disabled={
                              propertyMatchLoading ||
                              !propertyMatchingEnabled ||
                              parsedPropertyReferences.references.length === 0 ||
                              Boolean(parsedPropertyReferences.error)
                            }
                          >
                            <Search className="mr-2 h-4 w-4" />
                            Forhåndsvis valgte eiendommer
                          </Button>
                        </div>

                        {propertyMatchError && (
                          <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-100">
                            <p className="font-semibold">{propertyMatchError.code}</p>
                            <p className="mt-1">{propertyMatchError.message}</p>
                            {propertyMatchError.details && (
                              <pre className="mt-2 max-h-40 overflow-auto rounded bg-red-950/50 p-2 text-xs text-red-50">
                                {prettyJson(propertyMatchError.details)}
                              </pre>
                            )}
                            <p className="mt-2 text-xs text-red-100/80">Correlation ID: {propertyMatchError.correlationId}</p>
                          </div>
                        )}
                      </div>

                      {propertyMatchResult && (
                        <div className="space-y-3">
                          <>
                            <div className="grid gap-3 sm:grid-cols-4">
                              <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3">
                                <p className="text-xs uppercase tracking-wide text-slate-500">Analysert</p>
                                <p className="mt-1 text-lg font-semibold text-slate-100">{propertyMatchResult.result.analyzed}</p>
                              </div>
                              <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3">
                                <p className="text-xs uppercase tracking-wide text-slate-500">Aktuelle</p>
                                <p className="mt-1 text-lg font-semibold text-slate-100">{propertyMatchResult.result.matched}</p>
                              </div>
                              <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3">
                                <p className="text-xs uppercase tracking-wide text-slate-500">Mangler</p>
                                <p className="mt-1 text-lg font-semibold text-slate-100">{propertyMatchResult.result.missingPropertyReferences.length}</p>
                              </div>
                              <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3">
                                <p className="text-xs uppercase tracking-wide text-slate-500">Valgt</p>
                                <p className="mt-1 text-lg font-semibold text-slate-100">{selectedShortlistItems.length}</p>
                              </div>
                            </div>

                            {propertyMatchResult.result.bestEffort && (
                              <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-100">
                                Ingen eiendommer traff alle kravene. Systemet viser de nærmeste alternativene med
                                synlige avvik.
                              </p>
                            )}

                            <div className="max-h-[34rem] space-y-3 overflow-auto pr-1">
                              {propertyMatchResult.result.matches.map((match) => {
                                const reviewDecision = matchReviewDecisions[match.propertyId] || "system";
                                const propertyUrl = match.property.publicUrl || internalInventoryPropertyUrl(match.propertyId, presentationDraftReturnUrl);
                                return (
                                  <div key={match.propertyId} className="rounded-lg border border-slate-800 bg-slate-900/60 p-3">
                                    <div className="flex flex-wrap items-start justify-between gap-3">
                                      <div className="min-w-0">
                                        <p className="truncate text-sm font-semibold text-slate-100">
                                          {propertyDisplayName(match)}
                                        </p>
                                        {propertyFactsLine(match) && (
                                          <p className="mt-1 text-xs text-slate-400">{propertyFactsLine(match)}</p>
                                        )}
                                        {propertyUrl && (
                                          <a
                                            href={propertyUrl}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="mt-2 inline-flex text-xs text-primary-300 underline-offset-2 hover:underline"
                                          >
                                            {match.property.publicUrl ? "Åpne boligside" : "Åpne i RealtyFlow"}
                                          </a>
                                        )}
                                      </div>
                                      <div className="flex flex-col items-end gap-2">
                                        <p className="text-sm text-slate-200">Score {match.score}</p>
                                        <Badge
                                          variant={
                                            match.eligibility === "eligible"
                                              ? "success"
                                              : match.eligibility === "rejected"
                                                ? "destructive"
                                                : "warning"
                                          }
                                        >
                                          {match.eligibility}
                                        </Badge>
                                      </div>
                                    </div>
                                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                                      <label htmlFor={`active-match-review-${match.propertyId}`} className="text-xs font-semibold text-slate-300">
                                        Manuell vurdering
                                      </label>
                                      <select
                                        id={`active-match-review-${match.propertyId}`}
                                        value={reviewDecision}
                                        onChange={(event) => {
                                          setMatchReviewDecisions((current) => ({
                                            ...current,
                                            [match.propertyId]: event.target.value as MatchReviewDecision,
                                          }));
                                          setShortlistSaveError(null);
                                          setShortlistSaveResult(null);
                                          clearPresentationDraftState();
                                        }}
                                        className="h-9 rounded-lg border border-slate-700 bg-slate-950 px-2 text-xs text-slate-100"
                                      >
                                        <option value="system">Systemforslag</option>
                                        <option value="current">Aktuell</option>
                                        <option value="maybe">Kanskje</option>
                                        <option value="needs_research">Må undersøkes</option>
                                        <option value="rejected">Avvist</option>
                                      </select>
                                    </div>
                                    <MatchList title="Risiko/avvik" items={match.concerns} emptyLabel="Ingen tydelige avvik." />
                                  </div>
                                );
                              })}
                            </div>

                            <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-3">
                              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                                <div>
                                  <p className="text-sm font-semibold text-slate-200">Shortlist-utkast</p>
                                  <p className="mt-1 text-xs text-slate-500">
                                    Valgte boliger: {selectedShortlistItems.length}. Ingen e-post, lead eller kontakt opprettes.
                                  </p>
                                </div>
                                <Button
                                  type="button"
                                  onClick={saveShortlistDraft}
                                  disabled={shortlistSaveLoading || selectedShortlistItems.length === 0}
                                >
                                  {shortlistSaveLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                                  Lagre shortlist-utkast
                                </Button>
                              </div>

                              {shortlistSaveResult && (
                                <div className="mt-3 space-y-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-100">
                                  <div>
                                    <p className="font-semibold">
                                      Shortlist {shortlistSaveResult.result.shortlistId} lagret med
                                      {" "}{shortlistSaveResult.result.itemCount} bolig(er).
                                    </p>
                                    <p className="mt-1 text-xs text-emerald-100/70">
                                      E-post sendt: nei · Leads opprettet: nei · Kontakter opprettet: nei ·
                                      Presentasjon opprettet: nei · Property matching-jobb startet: nei
                                    </p>
                                  </div>

                                  <div className="rounded-lg border border-emerald-400/20 bg-slate-950/70 p-3">
                                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                                      <div>
                                        <p className="text-sm font-semibold text-emerald-50">
                                          Neste steg: presentasjons- og e-postutkast
                                        </p>
                                        <p className="mt-1 text-xs text-emerald-100/75">
                                          Lager et internt draft fra lagret shortlist. Det sendes ikke e-post,
                                          publiseres ikke presentasjon og opprettes ikke lead eller kontakt.
                                        </p>
                                      </div>
                                      <Button
                                        type="button"
                                        size="sm"
                                        onClick={savePresentationDraft}
                                        disabled={presentationDraftLoading}
                                      >
                                        {presentationDraftLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                                        Lagre presentasjonsutkast
                                      </Button>
                                    </div>

                                    {presentationDraftResult && (
                                      <div className="mt-3 rounded-lg border border-emerald-400/20 bg-slate-950/80 p-3">
                                        <p className="font-semibold text-emerald-50">
                                          {presentationDraftResult.result.loadedFromHistory
                                            ? "Lagret presentasjonsutkast hentet read-only."
                                            : presentationDraftResult.result.duplicate
                                            ? "Identisk presentasjonsutkast var allerede lagret."
                                            : "Presentasjonsutkast lagret som draft uten eksterne sideeffekter."}
                                        </p>
                                        <p className="mt-1 text-xs text-emerald-100/70">
                                          Presentation {presentationDraftResult.result.presentationId} ·
                                          Message draft {presentationDraftResult.result.messageDraftId}
                                        </p>
                                        <p className="mt-1 text-xs text-emerald-100/70">
                                          Status: {presentationDraftResult.result.status} · E-poststatus:
                                          {" "}{presentationDraftResult.result.messageStatus} · E-post sendt: nei ·
                                          Presentasjon publisert: nei
                                        </p>

                                        <div className="mt-3 flex flex-wrap gap-2">
                                          <Button type="button" variant="outline" size="sm" onClick={copyEmailDraftText}>
                                            <Clipboard className="mr-2 h-4 w-4" />
                                            Kopier e-posttekst
                                          </Button>
                                          {presentationDraftResult.result.messageDraft.bodyHtml && (
                                            <Button type="button" variant="outline" size="sm" onClick={copyEmailDraftHtml}>
                                              <Clipboard className="mr-2 h-4 w-4" />
                                              Kopier HTML
                                            </Button>
                                          )}
                                        </div>

                                        <InternalPresentationPreview
                                          preview={presentationDraftResult.result.presentationPreview}
                                          returnTo={presentationDraftReturnUrl}
                                        />

                                        <div className="mt-3 rounded-lg border border-slate-800 bg-slate-950/80 p-3">
                                          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-200/70">
                                            Rediger e-postutkast lokalt
                                          </p>
                                          <p className="mt-1 text-xs text-emerald-100/70">
                                            Endringene lagres ikke i databasen. Kopier e-posttekst bruker teksten under.
                                          </p>
                                          <div className="mt-3 space-y-3">
                                            <label className="block text-xs font-semibold text-slate-300" htmlFor="active-profile-email-subject">
                                              Emne
                                            </label>
                                            <input
                                              id="active-profile-email-subject"
                                              value={editableEmailSubject}
                                              onChange={(event) => {
                                                setEditableEmailSubject(event.target.value);
                                                resetDraftCopyState();
                                              }}
                                              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-primary-500"
                                            />
                                            <label className="block text-xs font-semibold text-slate-300" htmlFor="active-profile-email-body">
                                              E-posttekst
                                            </label>
                                            <textarea
                                              id="active-profile-email-body"
                                              value={editableEmailBody}
                                              onChange={(event) => {
                                                setEditableEmailBody(event.target.value);
                                                resetDraftCopyState();
                                              }}
                                              rows={12}
                                              className="w-full resize-y rounded-lg border border-slate-700 bg-slate-950 px-3 py-3 font-mono text-xs text-slate-100 outline-none focus:border-primary-500"
                                            />
                                          </div>
                                          <p className="mt-2 text-xs text-emerald-100/70">
                                            Dette er kun et draft-preview. Det finnes ingen send-knapp i denne fasen.
                                          </p>
                                          {emailDraftCopyState === "copied" && (
                                            <p className="mt-2 text-xs text-emerald-300">E-posttekst kopiert.</p>
                                          )}
                                          {emailDraftCopyState === "failed" && (
                                            <p className="mt-2 text-xs text-red-300">Kunne ikke kopiere e-posttekst.</p>
                                          )}
                                          {emailDraftHtmlCopyState === "copied" && (
                                            <p className="mt-2 text-xs text-emerald-300">HTML-utkast kopiert.</p>
                                          )}
                                          {emailDraftHtmlCopyState === "failed" && (
                                            <p className="mt-2 text-xs text-red-300">Kunne ikke kopiere HTML-utkast.</p>
                                          )}
                                        </div>
                                      </div>
                                    )}

                                    {presentationDraftError && (
                                      <div className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-100">
                                        <p className="font-semibold">{presentationDraftError.code}</p>
                                        <p className="mt-1">{presentationDraftError.message}</p>
                                        {presentationDraftError.details && (
                                          <pre className="mt-2 max-h-48 overflow-auto rounded bg-red-950/50 p-2 text-xs text-red-50">
                                            {prettyJson(presentationDraftError.details)}
                                          </pre>
                                        )}
                                        <p className="mt-2 text-xs text-red-100/70">
                                          Correlation ID: {presentationDraftError.correlationId}
                                        </p>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              )}

                              {shortlistSaveError && (
                                <div className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-100">
                                  <p className="font-semibold">{shortlistSaveError.code}</p>
                                  <p className="mt-1">{shortlistSaveError.message}</p>
                                </div>
                              )}
                            </div>
                          </>
                        </div>
                      )}
                    </div>
                  </div>
                )}
                <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-4">
                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div>
                      <p className="text-sm font-semibold text-slate-100">Lagret profilhistorikk</p>
                      <p className="mt-1 text-xs text-slate-500">
                        {activeWorklistItem
                          ? "Historikken er skjult mens du jobber med valgt profil, slik at arbeidsflaten holder seg kort."
                          : "Velg en profil for å fortsette uten å analysere henvendelsen på nytt."}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {activeWorklistItem && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            document.getElementById("lead-intelligence-active-profile")?.scrollIntoView({
                              behavior: "smooth",
                              block: "start",
                            });
                          }}
                        >
                          Gå til aktiv profil
                        </Button>
                      )}
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setWorklistHistoryExpanded((current) => !current)}
                      >
                        {worklistHistoryExpanded ? "Skjul profilhistorikk" : "Vis profilhistorikk"}
                      </Button>
                    </div>
                  </div>

                  {!worklistHistoryExpanded && (
                    <p className="mt-3 rounded-lg border border-slate-800 bg-slate-900/60 p-3 text-xs text-slate-400">
                      {worklistResult.result.items.length} lagrede profiler er skjult. Åpne historikken hvis du vil bytte aktiv profil.
                    </p>
                  )}

                  {worklistHistoryExpanded && (
                    <div className="mt-4 grid gap-3 lg:grid-cols-2">
                      {worklistResult.result.items.map((item) => {
                        const budget = formatCurrency(item.budgetAmount, item.budgetCurrency || "EUR");
                        const isActive = activeWorklistItem?.buyerProfileId === item.buyerProfileId;
                        return (
                          <div
                            key={item.buyerProfileId}
                            className={`rounded-lg border bg-slate-950 p-4 ${
                              isActive ? "border-primary-400/70 ring-1 ring-primary-400/30" : "border-slate-700/60"
                            }`}
                          >
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div>
                                <p className="text-xs uppercase tracking-wide text-slate-500">
                                  Buyer profile {shortPropertyId(item.buyerProfileId)}
                                </p>
                                <h2 className="mt-1 text-sm font-semibold text-slate-100">
                                  {item.summary || "Uten sammendrag"}
                                </h2>
                              </div>
                              <div className="flex flex-wrap gap-2">
                                {isActive && <Badge variant="default">Aktiv</Badge>}
                                <Badge variant="outline">{item.profileStatus}</Badge>
                                {item.purchaseReadiness && <Badge variant="secondary">{item.purchaseReadiness}</Badge>}
                              </div>
                            </div>

                            <dl className="mt-4 grid gap-3 text-xs text-slate-400 md:grid-cols-3">
                              <div>
                                <dt className="text-slate-500">Kilde</dt>
                                <dd>{sourceOptions.find((option) => option.value === item.source)?.label || "Ikke satt"}</dd>
                              </div>
                              <div>
                                <dt className="text-slate-500">Budsjett</dt>
                                <dd>{budget || "Ikke satt"}</dd>
                              </div>
                              <div>
                                <dt className="text-slate-500">Kontakt</dt>
                                <dd>
                                  {item.linkedContact
                                    ? item.linkedContact.name || item.linkedContact.maskedPhone || "Koblet"
                                    : item.contactLinked
                                      ? "Koblet"
                                      : "Ikke koblet"}
                                </dd>
                              </div>
                              <div>
                                <dt className="text-slate-500">Kriterier</dt>
                                <dd>{item.criterionCount}</dd>
                              </div>
                              <div>
                                <dt className="text-slate-500">Shortlist</dt>
                                <dd>
                                  {item.shortlistCount > 0
                                    ? `${item.latestShortlistItemCount} bolig(er) · ${item.latestShortlistStatus}`
                                    : "Ingen"}
                                </dd>
                              </div>
                              <div>
                                <dt className="text-slate-500">E-postutkast</dt>
                                <dd>{item.latestMessageDraftStatus || "Ingen"}</dd>
                              </div>
                            </dl>

                            <div className="mt-4 grid gap-2 text-xs text-slate-500 md:grid-cols-2">
                              <p>Intake {shortPropertyId(item.intakeId)}</p>
                              <p>Oppdatert {formatDateTime(item.updatedAt)}</p>
                              <p>Analyse {item.analysisRunId ? shortPropertyId(item.analysisRunId) : "mangler"}</p>
                              <p>Godkjent {formatDateTime(item.approvedAt)}</p>
                            </div>

                            <div className="mt-4 flex flex-wrap gap-2">
                              <Button
                                type="button"
                                variant={isActive ? "secondary" : "outline"}
                                size="sm"
                                onClick={() => continueFromWorklistItem(item)}
                                disabled={!item.analysisRunId}
                              >
                                <UserCheck className="mr-2 h-4 w-4" />
                                {isActive ? "Valgt for videre arbeid" : "Fortsett med denne profilen"}
                              </Button>
                              {!item.analysisRunId && (
                                <p className="text-xs text-amber-200">
                                  Mangler analyse-run og kan ikke brukes til videre preview ennå.
                                </p>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MessageSquareText className="h-5 w-5 text-primary-400" />
              Henvendelse
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-3">
              <div className="space-y-1">
                <FieldLabel>Kilde</FieldLabel>
                <select
                  value={source}
                  onChange={(event) => {
                    setSource(event.target.value as Source);
                    clearContactCandidates();
                  }}
                  className="h-10 w-full rounded-lg border border-slate-600 bg-slate-900 px-3 text-sm text-slate-100"
                >
                  {sourceOptions.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <FieldLabel>Brand</FieldLabel>
                <select
                  value={brand}
                  onChange={(event) => {
                    setBrand(event.target.value);
                    clearContactCandidates();
                    setSaveResult(null);
                    setWorklistResult(null);
                    setWorklistError(null);
                  }}
                  className="h-10 w-full rounded-lg border border-slate-600 bg-slate-900 px-3 text-sm text-slate-100"
                >
                  {realEstateBrands.map((item) => (
                    <option key={item.id} value={item.id}>{item.name}</option>
                  ))}
                </select>
              </div>
              <TextInput
                label="Språk (valgfritt)"
                value={language}
                onChange={(value) => {
                  setLanguage(value);
                  clearContactCandidates();
                }}
              />
            </div>

            <div className="space-y-1">
              <FieldLabel>Rå tekst</FieldLabel>
              <textarea
                value={rawText}
                onChange={(event) => {
                  setRawText(event.target.value);
                  clearContactCandidates();
                  setSaveResult(null);
                }}
                maxLength={LEAD_INTELLIGENCE_LIMITS.bodyText}
                rows={18}
                className="w-full resize-y rounded-lg border border-slate-600 bg-slate-950 px-3 py-3 text-sm text-slate-100 outline-none transition-colors placeholder:text-slate-600 focus:border-primary-500"
                placeholder="Lim inn telefonsamtalenotat, WhatsApp, SMS, e-post eller møtenotat..."
              />
              <div className="flex justify-between text-xs text-slate-500">
                <span>Bare tekst i denne fasen. Vedlegg og HTML analyseres ikke.</span>
                <span className={remaining < 500 ? "text-amber-300" : undefined}>{remaining} tegn igjen</span>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                disabled={!featureEnabled || loading || rawText.trim().length < 12}
                onClick={analyze}
              >
                {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                Analyser henvendelse
              </Button>
              <Button type="button" variant="secondary" onClick={reset} disabled={loading}>
                <RotateCcw className="mr-2 h-4 w-4" />
                Start på nytt
              </Button>
              {response && (
                <Button type="button" variant="outline" onClick={analyze} disabled={loading || !featureEnabled}>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Analyser på nytt
                </Button>
              )}
            </div>

            {error && (
              <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-100">
                <p className="font-semibold">{error.code}</p>
                <p className="mt-1">{error.message}</p>
                {error.details && (
                  <pre className="mt-3 max-h-40 overflow-auto rounded border border-red-400/20 bg-red-950/30 p-2 text-xs text-red-100/90">
                    {prettyJson(error.details)}
                  </pre>
                )}
                <p className="mt-2 text-xs text-red-200/80">Correlation ID: {error.correlationId}</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Analysepreview</CardTitle>
          </CardHeader>
          <CardContent>
            {!response && !loading && (
              <div className="rounded-lg border border-slate-700/60 bg-slate-900/50 p-8 text-center text-slate-400">
                <Sparkles className="mx-auto mb-3 h-8 w-8 text-slate-500" />
                <p className="font-medium text-slate-300">Ingen analyse ennå.</p>
                <p className="mt-1 text-sm">Lim inn en henvendelse og kjør analysen for å se forslag her.</p>
              </div>
            )}

            {loading && (
              <div className="rounded-lg border border-slate-700/60 bg-slate-900/50 p-8 text-center text-slate-300">
                <Loader2 className="mx-auto mb-3 h-8 w-8 animate-spin text-primary-400" />
                <p>Analyserer henvendelsen med strukturert output...</p>
              </div>
            )}

            {response && edited && (
              <div className="space-y-5">
                <div className="grid gap-3 md:grid-cols-3">
                  <div className="rounded-lg border border-slate-700/60 bg-slate-900/50 p-3">
                    <p className="text-xs uppercase tracking-wide text-slate-500">Correlation ID</p>
                    <p className="mt-1 break-all text-xs text-slate-300">{response.correlationId}</p>
                  </div>
                  <div className="rounded-lg border border-slate-700/60 bg-slate-900/50 p-3">
                    <p className="text-xs uppercase tracking-wide text-slate-500">Prompt</p>
                    <p className="mt-1 text-xs text-slate-300">{response.meta.promptVersion}</p>
                  </div>
                  <div className="rounded-lg border border-slate-700/60 bg-slate-900/50 p-3">
                    <p className="text-xs uppercase tracking-wide text-slate-500">Varighet</p>
                    <p className="mt-1 text-xs text-slate-300">{response.meta.durationMs} ms</p>
                  </div>
                </div>

                <div className="grid gap-4 lg:grid-cols-2">
                  <div className="rounded-lg border border-slate-700/60 bg-slate-950 p-4">
                    <h2 className="mb-3 text-sm font-semibold text-slate-200">Original henvendelse</h2>
                    <dl className="mb-3 grid gap-2 text-xs text-slate-400 md:grid-cols-3">
                      <div>
                        <dt className="text-slate-500">Kilde</dt>
                        <dd>{sourceOptions.find((option) => option.value === source)?.label}</dd>
                      </div>
                      <div>
                        <dt className="text-slate-500">Brand</dt>
                        <dd>{BRANDS.find((item) => item.id === brand)?.name || brand}</dd>
                      </div>
                      <div>
                        <dt className="text-slate-500">Språk</dt>
                        <dd>{language || "Ikke satt"}</dd>
                      </div>
                    </dl>
                    <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words text-sm text-slate-200">
                      {rawText}
                    </pre>
                  </div>

                  <div className="space-y-4 rounded-lg border border-slate-700/60 bg-slate-950 p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-sm font-semibold text-slate-200">Kontaktforslag</h2>
                      {phoneBadge && <Badge variant={phoneBadge.variant}>{phoneBadge.label}</Badge>}
                    </div>
                    <div className="grid gap-3 md:grid-cols-2">
                      <TextInput
                        label="Navn"
                        value={edited.contact.name || ""}
                        onChange={(value) => updateEdited((current) => ({
                          ...current,
                          contact: { ...current.contact, name: value || null },
                        }))}
                      />
                      <TextInput
                        label="Telefon"
                        value={edited.contact.phone || ""}
                        onChange={(value) => updateEdited((current) => ({
                          ...current,
                          contact: { ...current.contact, phone: value || null },
                        }))}
                      />
                      <TextInput
                        label="E-post"
                        value={edited.contact.email || ""}
                        onChange={(value) => updateEdited((current) => ({
                          ...current,
                          contact: { ...current.contact, email: value || null },
                        }))}
                      />
                      <TextInput
                        label="Land"
                        value={edited.contact.country || ""}
                        onChange={(value) => updateEdited((current) => ({
                          ...current,
                          contact: { ...current.contact, country: value || null },
                        }))}
                      />
                    </div>
                    <div className="grid gap-3 md:grid-cols-3">
                      <TextInput
                        label="Readiness"
                        value={edited.purchaseReadiness.level}
                        onChange={(value) => updateEdited((current) => ({
                          ...current,
                          purchaseReadiness: { ...current.purchaseReadiness, level: value as ExtractedLead["purchaseReadiness"]["level"] },
                        }))}
                      />
                      <TextInput
                        label="Budsjett"
                        value={String(edited.budget.amount || "")}
                        onChange={(value) => updateEdited((current) => ({
                          ...current,
                          budget: { ...current.budget, amount: value ? Number(value) : null },
                        }))}
                      />
                      <TextInput
                        label="Valuta"
                        value={edited.budget.currency || ""}
                        onChange={(value) => updateEdited((current) => ({
                          ...current,
                          budget: { ...current.budget, currency: value || null },
                        }))}
                      />
                    </div>
                    <p className="text-xs text-slate-500">
                      Telefonlookup: {response.meta.phoneNormalization.normalizedLookup || "ingen"}.
                      E.164-verifisering: {response.meta.phoneNormalization.verifiedE164 ? "ja" : "nei"}.
                    </p>
                  </div>
                </div>

                <div className="rounded-lg border border-slate-700/60 bg-slate-950 p-4">
                  <h2 className="mb-3 text-sm font-semibold text-slate-200">Område og boligtype</h2>
                  <div className="grid gap-3 md:grid-cols-2">
                    <TextInput
                      label="Foretrukne områder"
                      value={listToText(edited.locations.preferred)}
                      onChange={(value) => updateEdited((current) => ({
                        ...current,
                        locations: {
                          ...current.locations,
                          preferred: textToList(value),
                        },
                      }))}
                    />
                    <TextInput
                      label="Ekskluderte områder"
                      value={listToText(edited.locations.excluded)}
                      onChange={(value) => updateEdited((current) => ({
                        ...current,
                        locations: {
                          ...current.locations,
                          excluded: textToList(value),
                        },
                      }))}
                    />
                  </div>
                  <label className="mt-3 flex cursor-pointer items-center gap-2 text-sm text-slate-300">
                    <input
                      type="checkbox"
                      checked={edited.locations.flexible}
                      onChange={(event) => updateEdited((current) => ({
                        ...current,
                        locations: {
                          ...current.locations,
                          flexible: event.target.checked,
                        },
                      }))}
                    />
                    Fleksibel på område
                  </label>
                  {!edited.locations.flexible && edited.locations.preferred.length > 0 && (
                    <p className="mt-2 text-xs text-slate-500">
                      Match-preview behandler valgt område som et krav. Eiendommer i andre områder skal avvises eller få tydelig avvik.
                    </p>
                  )}
                  {edited.locations.flexible && edited.locations.preferred.length > 0 && (
                    <p className="mt-2 text-xs text-slate-500">
                      Fleksibelt betyr nærområde rundt valgt sted. Når systemet kjenner områdene, avvises boliger som ligger mer enn ca. 30 km unna.
                    </p>
                  )}
                </div>

                <div className="grid gap-4 lg:grid-cols-2">
                  <JsonSection title="Boligtyper og områder" value={{ propertyTypes: edited.propertyTypes, locations: edited.locations }} />
                  <JsonSection title="Kjøpsstatus og budsjett" value={{ purchaseReadiness: edited.purchaseReadiness, budget: edited.budget }} />
                  <JsonSection title="Absolutte krav" value={edited.hardRequirements} />
                  <JsonSection title="Sterke ønsker" value={edited.preferences} />
                  <JsonSection title="Avvisningskriterier" value={edited.exclusions} />
                  <JsonSection title="Manglende informasjon" value={edited.missingInformation} />
                </div>

                <div className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
                  <div className="rounded-lg border border-slate-700/60 bg-slate-950 p-4">
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <h2 className="text-sm font-semibold text-slate-200">Godkjenn kriterier</h2>
                        <p className="mt-1 text-xs text-slate-500">
                          Hvert krav, ønske og avvisningskriterium må godkjennes eller avvises før buyer profile lagres.
                        </p>
                      </div>
                      <Badge variant={allCriteriaReviewed ? "success" : "secondary"}>
                        {reviewedCount}/{reviewCriteria.length} vurdert
                      </Badge>
                    </div>

                    <div className="max-h-[32rem] space-y-3 overflow-auto pr-1">
                      {reviewCriteria.map((criterion) => {
                        const state = criterionReviews[criterion.id] || {
                          approvalStatus: "pending",
                          customerConfirmed: false,
                        };
                        return (
                          <div
                            key={criterion.id}
                            className="rounded-lg border border-slate-800 bg-slate-900/60 p-3"
                          >
                            <div className="flex flex-wrap items-start justify-between gap-2">
                              <div>
                                <p className="text-sm font-medium text-slate-200">{criterion.label}</p>
                                <p className="mt-1 text-xs text-slate-500">
                                  {criterion.key} · {criterion.criterionType}
                                </p>
                              </div>
                              <Badge
                                variant={
                                  state.approvalStatus === "approved"
                                    ? "success"
                                    : state.approvalStatus === "rejected"
                                      ? "destructive"
                                      : "secondary"
                                }
                              >
                                {state.approvalStatus === "approved"
                                  ? "Godkjent"
                                  : state.approvalStatus === "rejected"
                                    ? "Avvist"
                                    : "Venter"}
                              </Badge>
                            </div>
                            <p className="mt-2 text-sm text-slate-300">{criterion.detail}</p>
                            <div className="mt-3 flex flex-wrap items-center gap-2">
                              <Button
                                type="button"
                                variant={state.approvalStatus === "approved" ? "default" : "outline"}
                                size="sm"
                                onClick={() => updateCriterionReview(criterion.id, { approvalStatus: "approved" })}
                              >
                                <CheckCircle2 className="mr-2 h-4 w-4" />
                                Godkjenn
                              </Button>
                              <Button
                                type="button"
                                variant={state.approvalStatus === "rejected" ? "destructive" : "outline"}
                                size="sm"
                                onClick={() => updateCriterionReview(criterion.id, { approvalStatus: "rejected" })}
                              >
                                <XCircle className="mr-2 h-4 w-4" />
                                Avvis
                              </Button>
                              <label className="flex items-center gap-2 text-xs text-slate-400">
                                <input
                                  type="checkbox"
                                  checked={state.customerConfirmed}
                                  onChange={(event) =>
                                    updateCriterionReview(criterion.id, { customerConfirmed: event.target.checked })
                                  }
                                  className="h-4 w-4 rounded border-slate-600 bg-slate-900"
                                />
                                Kunden har bekreftet
                              </label>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="space-y-4 rounded-lg border border-slate-700/60 bg-slate-950 p-4">
                    <div>
                      <h2 className="text-sm font-semibold text-slate-200">Kontaktkandidater</h2>
                      <p className="mt-1 text-xs text-slate-500">
                        Kandidater vises maskert. Eksisterende kontakt kan velges eksplisitt, men ingen kontakt opprettes automatisk.
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={loadContactCandidates}
                      disabled={candidateLoading || !edited || !persistenceEnabled}
                    >
                      {candidateLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
                      Vis kontaktkandidater
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={loadCrmContext}
                      disabled={crmContextLoading || !edited || !persistenceEnabled}
                    >
                      {crmContextLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                      Hent CRM-kontekst
                    </Button>

                    {!persistenceEnabled && (
                      <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-100">
                        Kontaktkandidatoppslag er deaktivert sammen med persistence. Ingen databaseoppslag kjøres fra denne visningen.
                      </div>
                    )}

                    {contactCandidateError && (
                      <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-100">
                        <p className="font-semibold">{contactCandidateError.code}</p>
                        <p className="mt-1">{contactCandidateError.message}</p>
                        <p className="mt-2 text-xs text-amber-100/80">
                          Correlation ID: {contactCandidateError.correlationId}
                        </p>
                      </div>
                    )}

                    {crmContextError && (
                      <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-100">
                        <p className="font-semibold">{crmContextError.code}</p>
                        <p className="mt-1">{crmContextError.message}</p>
                        <p className="mt-2 text-xs text-amber-100/80">
                          Correlation ID: {crmContextError.correlationId}
                        </p>
                      </div>
                    )}

                    {contactCandidates.length === 0 && !contactCandidateError && !contactCandidatesLoaded && (
                      <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-3 text-sm text-slate-400">
                        Ingen kontaktkandidater hentet ennå.
                      </div>
                    )}

                    {contactCandidates.length === 0 && !contactCandidateError && contactCandidatesLoaded && (
                      <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-100">
                        Kandidatoppslag fullført. Ingen matchende kontaktkandidater funnet.
                      </div>
                    )}

                    {contactCandidates.length > 0 && !contactCandidateError && contactCandidatesLoaded && (
                      <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-3 text-sm text-slate-300">
                        {contactCandidates.length} kontaktkandidat{contactCandidates.length === 1 ? "" : "er"} funnet.
                      </div>
                    )}

                    {contactCandidates.length > 0 && !connectExistingEnabled && (
                      <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-100">
                        Kandidatoppslag er kun read-only nå. Kobling til eksisterende kontakt er låst til egen testkontakt
                        og egen server-side aktivering.
                      </div>
                    )}

                    {crmContextResult && (
                      <div className="space-y-3 rounded-lg border border-slate-800 bg-slate-900/50 p-3">
                        <div>
                          <p className="text-sm font-semibold text-slate-200">CRM-kontekst</p>
                          <p className="mt-1 text-xs text-slate-500">
                            Read-only kontekst fra eksisterende kontaktpipeline. Ingen kontakt, lead eller e-post er opprettet.
                          </p>
                        </div>
                        {crmContextResult.result.context.length === 0 ? (
                          <p className="text-sm text-slate-400">
                            Ingen eksisterende CRM-kontekst funnet for de server-bekreftede kandidatene.
                          </p>
                        ) : (
                          <div className="space-y-2">
                            {crmContextResult.result.context.map((item) => (
                              <div
                                key={`${item.matchType}:${item.contactId}`}
                                className="rounded-lg border border-slate-800 bg-slate-950 p-3 text-sm text-slate-300"
                              >
                                <div className="flex flex-wrap items-start justify-between gap-2">
                                  <div>
                                    <p className="font-medium text-slate-100">{item.name || "Uten navn"}</p>
                                    <p className="mt-1 text-xs text-slate-500">
                                      {item.maskedPhone || "ingen telefon"} · {item.maskedEmail || "ingen e-post"}
                                    </p>
                                  </div>
                                  <Badge variant="secondary">
                                    {item.matchType} · {Math.round(item.confidence * 100)}%
                                  </Badge>
                                </div>
                                <div className="mt-3 grid gap-2 text-xs text-slate-400 sm:grid-cols-2">
                                  <p>Status: <span className="text-slate-200">{item.pipelineStatus || "ukjent"}</span></p>
                                  <p>Verdi: <span className="text-slate-200">{formatCurrency(item.pipelineValue)}</span></p>
                                  <p>Kilde: <span className="text-slate-200">{item.source || "ukjent"}</span></p>
                                  <p>Siste kontakt: <span className="text-slate-200">{formatDateTime(item.lastContact)}</span></p>
                                  <p>Neste oppfølging: <span className="text-slate-200">{formatDateTime(item.nextFollowup)}</span></p>
                                  <p>Interaksjoner: <span className="text-slate-200">{item.interactionCount}</span></p>
                                </div>
                                {item.propertyInterest && (
                                  <p className="mt-3 text-xs text-slate-400">
                                    Boliginteresse: <span className="text-slate-200">{item.propertyInterest}</span>
                                  </p>
                                )}
                                {item.notesExcerpt && (
                                  <p className="mt-3 rounded-md border border-slate-800 bg-slate-900 p-2 text-xs text-slate-300">
                                    {item.notesExcerpt}
                                  </p>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                        <p className="text-xs text-slate-500">
                          Sideeffekter: kontakter opprettet nei · leads opprettet nei · e-post sendt nei · property matching startet nei.
                        </p>
                      </div>
                    )}

                    <div className="space-y-2">
                      {contactCandidates.map((candidate) => (
                        <div
                          key={`${candidate.matchType}:${candidate.contactId}`}
                          className="flex items-start gap-3 rounded-lg border border-slate-800 bg-slate-900/50 p-3"
                        >
                          {connectExistingEnabled ? (
                            <input
                              type="radio"
                              name="lead-contact-candidate"
                              checked={contactDecision === "connect_existing" && selectedContactId === candidate.contactId}
                              onChange={() => {
                                setContactDecision("connect_existing");
                                setSelectedContactId(candidate.contactId);
                                setSaveError(null);
                                setSaveResult(null);
                              }}
                              className="mt-1 h-4 w-4"
                            />
                          ) : (
                            <Search className="mt-0.5 h-4 w-4 text-slate-500" aria-hidden="true" />
                          )}
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm font-medium text-slate-200">
                              {candidate.name || "Uten navn"}
                            </span>
                            <span className="mt-1 block text-xs text-slate-500">
                              {candidate.maskedPhone || "ingen telefon"} · {candidate.maskedEmail || "ingen e-post"}
                            </span>
                            <span className="mt-1 block text-xs text-slate-400">
                              {candidate.matchType} · {Math.round(candidate.confidence * 100)}%
                            </span>
                          </span>
                        </div>
                      ))}
                    </div>

                    <div className="space-y-2 border-t border-slate-800 pt-3">
                      <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-300">
                        <input
                          type="radio"
                          name="lead-contact-decision"
                          checked={contactDecision === "continue_without_contact"}
                          onChange={() => {
                            setContactDecision("continue_without_contact");
                            setSelectedContactId(null);
                            setSaveError(null);
                            setSaveResult(null);
                          }}
                        />
                        Fortsett uten koblet kontakt
                      </label>
                      <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-300">
                        <input
                          type="radio"
                          name="lead-contact-decision"
                          checked={contactDecision === "create_new"}
                          onChange={() => {
                            setContactDecision("create_new");
                            setSelectedContactId(null);
                            setSaveError(null);
                            setSaveResult(null);
                          }}
                        />
                        Marker at ny kontakt må opprettes senere
                      </label>
                    </div>

                    <div className="rounded-lg border border-blue-500/30 bg-blue-500/10 p-3 text-xs text-blue-100">
                      <div className="flex items-start gap-2">
                        <UserCheck className="mt-0.5 h-4 w-4 text-blue-300" />
                        <p>
                          Denne fasen lagrer bare intake, analyse og buyer profile. Kontaktkandidat lagres kun når
                          Freddy eksplisitt kobler en eksisterende kontakt. Den sender ikke e-post, starter ikke
                          matching og oppdaterer ikke eksisterende kontaktdata.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="rounded-lg border border-slate-700/60 bg-slate-950 p-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <h2 className="text-sm font-semibold text-slate-200">Lagre review</h2>
                      <p className="mt-1 text-xs text-slate-500">
                        Lagrer godkjent intake og buyer profile bak server-side feature flag. Ingen kommunikasjon sendes.
                      </p>
                    </div>
                    <Button
                      type="button"
                      onClick={saveReview}
                      disabled={
                        saveLoading ||
                        !persistenceEnabled ||
                        Boolean(jsonEditor.error) ||
                        !allCriteriaReviewed ||
                        (contactDecision === "connect_existing" && !selectedContactId)
                      }
                    >
                      {saveLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                      Lagre intake og kjøperprofil
                    </Button>
                  </div>

                  {!allCriteriaReviewed && (
                    <p className="mt-3 text-sm text-amber-300">
                      Alle kriterier må godkjennes eller avvises før lagring.
                    </p>
                  )}

                  {!persistenceEnabled && (
                    <p className="mt-3 text-sm text-amber-300">
                      Lagring er av i dette miljøet. Analyse og lokal redigering fungerer fortsatt, men ingen intake eller buyer profile skrives.
                    </p>
                  )}

                  {saveError && (
                    <div className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-100">
                      <p className="font-semibold">{saveError.code}</p>
                      <p className="mt-1">{saveError.message}</p>
                      {saveError.code === "REVIEW_CONFLICT" && (
                        <div className="mt-2 rounded-md border border-red-400/30 bg-red-950/40 p-2 text-xs text-red-50">
                          Dette reviewet er allerede lagret med en annen versjon av innholdet. Systemet har ikke
                          overskrevet buyer profile eller kriterier. Start på nytt eller analyser henvendelsen på
                          nytt dersom du vil lagre en ny godkjent versjon.
                        </div>
                      )}
                      {saveError.details && (
                        <pre className="mt-2 max-h-48 overflow-auto rounded bg-red-950/50 p-2 text-xs text-red-50">
                          {prettyJson(saveError.details)}
                        </pre>
                      )}
                      <p className="mt-2 text-xs text-red-100/80">Correlation ID: {saveError.correlationId}</p>
                    </div>
                  )}

                  {saveResult && (
                    <div className="mt-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-100">
                      <div className="flex items-start gap-2">
                        <Users className="mt-0.5 h-4 w-4 text-emerald-300" />
                        <div>
                          <p className="font-semibold">
                            {activeWorklistItem
                              ? "Lagret buyer profile valgt fra arbeidslisten."
                              : saveResult.result.status.duplicate
                              ? "Identisk review var allerede lagret."
                              : "Review lagret uten eksterne sideeffekter."}
                          </p>
                          <p className="mt-1 text-emerald-100/80">
                            Intake {saveResult.result.intake.id} · Buyer profile {saveResult.result.buyerProfile.id} ·
                            kriterier {saveResult.result.buyerProfile.criterionCount}
                          </p>
                          {activeWorklistItem && (
                            <p className="mt-1 text-xs text-emerald-100/80">
                              Du kan kjøre ny eiendomsmatch på denne lagrede profilen uten å analysere henvendelsen
                              på nytt. Presentasjonsutkast fra gammel analyse åpnes ikke i denne fasen.
                            </p>
                          )}
                          {saveResult.result.status.duplicate && (
                            <p className="mt-1 text-xs text-emerald-100/80">
                              Ingen nye rader ble opprettet. Du ser samme intake, analyse og buyer profile som ved
                              første lagring.
                            </p>
                          )}
                          <p className="mt-1 text-xs text-emerald-100/70">
                            Ny lagring: {saveResult.result.status.newlySaved ? "ja" : "nei"} ·
                            Duplicate: {saveResult.result.status.duplicate ? "ja" : "nei"} ·
                            Conflict: {saveResult.result.status.conflict ? "ja" : "nei"} ·
                            E-post sendt: nei · Property matching: nei · Kontakt opprettet: nei
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {saveResult && (
                  <div className="rounded-lg border border-slate-700/60 bg-slate-950 p-4">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div>
                        <h2 id="lead-intelligence-property-match" className="text-sm font-semibold text-slate-200">
                          Eiendomsmatch-preview
                        </h2>
                        <p className="mt-1 text-xs text-slate-500">
                          La systemet søke i eksisterende eiendommer, eller lim inn eksplisitte referanser som N8513
                          for en kontrollert test. Matchpreviewen lagres ikke; shortlist-utkast lagres bare etter
                          eksplisitt valg.
                        </p>
                      </div>
                      <Badge variant={propertyMatchingEnabled ? "success" : "secondary"}>
                        {propertyMatchingEnabled ? "Preview aktivert" : "Feature flag av"}
                      </Badge>
                    </div>

                    {!propertyMatchingEnabled && (
                      <div className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-100">
                        Property matching er deaktivert i dette miljøet. Serveren må ha
                        REALTYFLOW_PROPERTY_MATCHING_ENABLED=true før denne read-only previewen kan brukes.
                      </div>
                    )}

                    <div className="mt-4 space-y-2">
                      <FieldLabel>Eiendomsreferanser</FieldLabel>
                      <textarea
                        value={propertyReferencesText}
                        onChange={(event) => {
                          setPropertyReferencesText(event.target.value);
                          clearPropertyMatchPreview();
                        }}
                        rows={4}
                        placeholder="F.eks. N8513, N8514 eller én database-UUID per linje..."
                        className="w-full resize-y rounded-lg border border-slate-600 bg-slate-950 px-3 py-3 font-mono text-xs text-slate-100 outline-none focus:border-primary-500"
                      />
                      <p className="text-xs text-slate-500">
                        Valgfritt. Maks 20 eksplisitte eiendomsreferanser hvis du vil teste bestemte boliger.
                      </p>
                    </div>

                    {parsedPropertyReferences.error && (
                      <p className="mt-2 text-sm text-amber-300">{parsedPropertyReferences.error}</p>
                    )}

                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => previewPropertyMatches("auto")}
                        disabled={
                          propertyMatchLoading ||
                          !propertyMatchingEnabled ||
                          !saveResult
                        }
                      >
                        {propertyMatchLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
                        Finn aktuelle eiendommer automatisk
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => previewPropertyMatches("explicit")}
                        disabled={
                          propertyMatchLoading ||
                          !propertyMatchingEnabled ||
                          !saveResult ||
                          parsedPropertyReferences.references.length === 0 ||
                          Boolean(parsedPropertyReferences.error)
                        }
                      >
                        {propertyMatchLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
                        Forhåndsvis valgte eiendommer
                      </Button>
                    </div>

                    {propertyMatchError && (
                      <div className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-100">
                        <p className="font-semibold">{propertyMatchError.code}</p>
                        <p className="mt-1">{propertyMatchError.message}</p>
                        {propertyMatchError.details && (
                          <pre className="mt-2 max-h-48 overflow-auto rounded bg-red-950/50 p-2 text-xs text-red-50">
                            {prettyJson(propertyMatchError.details)}
                          </pre>
                        )}
                        <p className="mt-2 text-xs text-red-100/80">Correlation ID: {propertyMatchError.correlationId}</p>
                      </div>
                    )}

                    {propertyMatchResult && (
                      <div className="mt-4 space-y-3">
                        <p className="rounded-lg border border-slate-800 bg-slate-900/60 p-3 text-xs text-slate-400">
                          Modus: {propertyMatchResult.result.discoveryMode === "auto" ? "Automatisk søk i eksisterende eiendommer" : "Valgte referanser"}
                          {propertyMatchResult.result.candidateLimit
                            ? ` · Kandidatgrense ${propertyMatchResult.result.candidateLimit}`
                            : ""}
                        </p>
                        <div className="grid gap-3 md:grid-cols-4">
                          <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3">
                            <p className="text-xs uppercase tracking-wide text-slate-500">Analysert</p>
                            <p className="mt-1 text-lg font-semibold text-slate-100">{propertyMatchResult.result.analyzed}</p>
                          </div>
                          <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3">
                            <p className="text-xs uppercase tracking-wide text-slate-500">Aktuelle</p>
                            <p className="mt-1 text-lg font-semibold text-slate-100">{propertyMatchResult.result.matched}</p>
                          </div>
                          <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3">
                            <p className="text-xs uppercase tracking-wide text-slate-500">Mangler</p>
                            <p className="mt-1 text-lg font-semibold text-slate-100">{propertyMatchResult.result.missingPropertyReferences.length}</p>
                          </div>
                          <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3">
                            <p className="text-xs uppercase tracking-wide text-slate-500">Skipped</p>
                            <p className="mt-1 text-lg font-semibold text-slate-100">{propertyMatchResult.result.skippedProperties.length}</p>
                          </div>
                        </div>

                        {propertyMatchResult.result.bestEffort && (
                          <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-100">
                            Ingen eiendommer traff alle kravene. Systemet viser derfor de nærmeste alternativene
                            fra eksisterende eiendommer, med avvik og risiko synlig.
                          </p>
                        )}

                        {!propertyMatchResult.result.bestEffort &&
                          propertyMatchResult.result.matched === 0 &&
                          propertyMatchResult.result.matches.length > 0 && (
                          <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-100">
                            Ingen av de valgte eiendommene er aktuelle uten manuell vurdering. Avviste eller usikre
                            treff vises under med forklaring.
                          </p>
                        )}

                        {propertyMatchResult.result.matches.length > 0 && (
                          <p className="rounded-lg border border-slate-800 bg-slate-950/70 p-3 text-xs text-slate-400">
                            Systemstatusen viser regelmotorens vurdering. Bruk manuell vurdering for å merke boliger
                            som Freddy vil ta videre, men dette er bare lokalt i previewen og lagres ikke som shortlist.
                          </p>
                        )}

                        <div className="space-y-3">
                          {propertyMatchResult.result.matches.map((match) => {
                            const reviewDecision = matchReviewDecisions[match.propertyId] || "system";
                            const propertyUrl = match.property.publicUrl || internalInventoryPropertyUrl(match.propertyId, presentationDraftReturnUrl);
                            const manualDecisionOverridesRejected =
                              match.eligibility === "rejected" &&
                              (reviewDecision === "current" || reviewDecision === "maybe");

                            return (
                              <div key={match.propertyId} className="rounded-lg border border-slate-800 bg-slate-900/60 p-3">
                                <div className="flex flex-wrap items-start justify-between gap-2">
                                  <div className="flex min-w-0 gap-3">
                                    {match.property.primaryImageUrl && (
                                      <img
                                        src={match.property.primaryImageUrl}
                                        alt=""
                                        className="h-20 w-28 flex-none rounded-md border border-slate-800 object-cover"
                                        loading="lazy"
                                      />
                                    )}
                                    <div className="min-w-0">
                                      <div className="flex flex-wrap items-center gap-2">
                                        <p className="truncate text-sm font-semibold text-slate-100">
                                          {match.property.title ||
                                            match.property.reference ||
                                            shortPropertyId(match.propertyId)}
                                        </p>
                                        {propertyUrl && (
                                          <a
                                            href={propertyUrl}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="text-xs text-primary-300 underline-offset-2 hover:underline"
                                          >
                                            {match.property.publicUrl ? "Åpne" : "Åpne i RealtyFlow"}
                                          </a>
                                        )}
                                      </div>
                                      {propertyFactsLine(match) && (
                                        <p className="mt-1 text-xs text-slate-400">{propertyFactsLine(match)}</p>
                                      )}
                                      <p className="mt-1 font-mono text-[11px] text-slate-500">
                                        ID {shortPropertyId(match.propertyId)}
                                      </p>
                                    </div>
                                  </div>
                                  <div className="flex flex-col items-end gap-2">
                                    <p className="text-sm text-slate-200">
                                      Score {match.score} · Data {match.dataQualityScore}
                                    </p>
                                    <Badge
                                      variant={
                                        match.eligibility === "eligible"
                                          ? "success"
                                          : match.eligibility === "rejected"
                                            ? "destructive"
                                            : "warning"
                                      }
                                    >
                                      {match.eligibility}
                                    </Badge>
                                    <Badge variant={matchReviewDecisionVariant(reviewDecision)}>
                                      {matchReviewDecisionLabel(reviewDecision)}
                                    </Badge>
                                  </div>
                                </div>
                                <div className="mt-3 rounded-lg border border-slate-800 bg-slate-950/60 p-3">
                                  <div className="flex flex-wrap items-center justify-between gap-2">
                                    <label htmlFor={`match-review-${match.propertyId}`} className="text-xs font-semibold text-slate-300">
                                      Manuell vurdering
                                    </label>
                                    <select
                                      id={`match-review-${match.propertyId}`}
                                      value={reviewDecision}
                                      onChange={(event) => {
                                        setMatchReviewDecisions((current) => ({
                                          ...current,
                                          [match.propertyId]: event.target.value as MatchReviewDecision,
                                        }));
                                        setShortlistSaveError(null);
                                        setShortlistSaveResult(null);
                                        clearPresentationDraftState();
                                      }}
                                      className="h-9 rounded-lg border border-slate-700 bg-slate-950 px-2 text-xs text-slate-100"
                                    >
                                      <option value="system">Systemforslag</option>
                                      <option value="current">Aktuell</option>
                                      <option value="maybe">Kanskje</option>
                                      <option value="needs_research">Må undersøkes</option>
                                      <option value="rejected">Avvist</option>
                                    </select>
                                  </div>
                                  {manualDecisionOverridesRejected && (
                                    <p className="mt-2 rounded border border-amber-500/30 bg-amber-500/10 p-2 text-xs text-amber-100">
                                      Denne boligen er fortsatt avvist av systemreglene. Den kan bare tas med som
                                      «Må undersøkes», og risiko/avvik blir lagret sammen med shortlist-utkastet.
                                    </p>
                                  )}
                                </div>
                                <div className="mt-3 grid gap-3 lg:grid-cols-3">
                                  <MatchList
                                    title="Hvorfor match"
                                    items={humanizedMatchReasonItems(match.reasonsForMatch, 4)}
                                    emptyLabel="Ingen positive matchgrunner."
                                  />
                                  <MatchList title="Risiko/avvik" items={match.concerns} emptyLabel="Ingen tydelige avvik." />
                                  <MatchList title="Må verifiseres" items={match.questionsToVerify} emptyLabel="Ingen åpne verifikasjonsspørsmål." />
                                </div>
                                {match.budgetResult && (
                                  <p className="mt-3 rounded border border-slate-700 bg-slate-950/60 p-2 text-xs text-slate-300">
                                    Budsjett: {match.budgetResult.outcome} · {match.budgetResult.reason}
                                  </p>
                                )}
                              </div>
                            );
                          })}
                        </div>

                        <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-3">
                          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                            <div>
                              <p className="text-sm font-semibold text-slate-200">Shortlist-utkast</p>
                              <p className="mt-1 text-xs text-slate-500">
                                Valgte boliger: {selectedShortlistItems.length}. Utkastet lagrer bare Freddys
                                shortlistvalg. Det oppretter ikke presentasjon, e-post, lead eller kontakt.
                              </p>
                            </div>
                            <Button
                              type="button"
                              onClick={saveShortlistDraft}
                              disabled={shortlistSaveLoading || selectedShortlistItems.length === 0}
                            >
                              {shortlistSaveLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                              Lagre shortlist-utkast
                            </Button>
                          </div>

                          {selectedShortlistItems.length === 0 && (
                            <p className="mt-2 text-xs text-amber-200">
                              Marker minst én bolig som Aktuell, Kanskje eller Må undersøkes før shortlist-utkast kan lagres.
                            </p>
                          )}

                          {shortlistSaveResult && (
                            <div className="mt-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-100">
                              <p className="font-semibold">
                                {shortlistSaveResult.result.duplicate
                                  ? "Identisk shortlist-utkast var allerede lagret."
                                  : "Shortlist-utkast lagret uten eksterne sideeffekter."}
                              </p>
                              <p className="mt-1 text-emerald-100/80">
                                Shortlist {shortlistSaveResult.result.shortlistId} · Boliger {shortlistSaveResult.result.itemCount}
                              </p>
                              <p className="mt-1 text-xs text-emerald-100/70">
                                E-post sendt: nei · Leads opprettet: nei · Kontakter opprettet: nei ·
                                Presentasjon opprettet: nei · Property matching-jobb startet: nei
                              </p>
                            </div>
                          )}

                          {shortlistPresentation && shortlistEmailDraft && (
                            <div className="mt-3 space-y-4 rounded-lg border border-primary-500/30 bg-slate-950/70 p-4">
                              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                                <div>
                                  <p className="flex items-center gap-2 text-sm font-semibold text-primary-100">
                                    <MessageSquareText className="h-4 w-4" />
                                    Profesjonelt presentasjonsutkast
                                  </p>
                                  <p className="mt-1 text-xs text-primary-100/75">
                                    {shortlistPresentation.title} · {shortlistPresentation.subtitle}
                                  </p>
                                  <p className="mt-1 text-xs text-slate-400">
                                    Dette er bare en preview basert på shortlist-utkastet. Ingen e-post er sendt,
                                    og ingen presentasjon er lagret eller publisert.
                                  </p>
                                </div>
                                <div className="flex flex-col gap-2 sm:flex-row">
                                  <Button
                                    type="button"
                                    size="sm"
                                    onClick={savePresentationDraft}
                                    disabled={presentationDraftLoading}
                                  >
                                    {presentationDraftLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                                    Lagre presentasjonsutkast
                                  </Button>
                                  <Button type="button" variant="outline" size="sm" onClick={copyPresentationDraft}>
                                    <Clipboard className="mr-2 h-4 w-4" />
                                    Kopier presentasjon
                                  </Button>
                                  <Button type="button" variant="outline" size="sm" onClick={copyEmailDraftText}>
                                    <Clipboard className="mr-2 h-4 w-4" />
                                    Kopier e-postutkast
                                  </Button>
                                </div>
                              </div>

                              <div className="grid gap-3 lg:grid-cols-3">
                                <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
                                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                                    Kundens behov
                                  </p>
                                  <ul className="mt-3 space-y-2 text-sm text-slate-200">
                                    {shortlistPresentation.needBullets.map((item) => (
                                      <li key={item} className="flex gap-2">
                                        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />
                                        <span>{item}</span>
                                      </li>
                                    ))}
                                  </ul>
                                </div>

                                <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
                                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                                    Før videre deling må dette avklares
                                  </p>
                                  <ul className="mt-3 space-y-2 text-sm text-slate-200">
                                    {shortlistPresentation.verificationBullets.slice(0, 5).map((item) => (
                                      <li key={item} className="flex gap-2">
                                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
                                        <span>{item}</span>
                                      </li>
                                    ))}
                                  </ul>
                                </div>

                                <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
                                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                                    Sikkerhetsstatus
                                  </p>
                                  <div className="mt-3 space-y-2 text-sm text-slate-200">
                                    <p>E-post sendt: nei</p>
                                    <p>Leads opprettet: nei</p>
                                    <p>Kontakter opprettet: nei</p>
                                    <p>Presentasjon publisert: nei</p>
                                  </div>
                                  {presentationCopyState === "copied" && (
                                    <p className="mt-3 text-xs text-emerald-300">Presentasjonstekst kopiert.</p>
                                  )}
                                  {presentationCopyState === "failed" && (
                                    <p className="mt-3 text-xs text-red-300">Kunne ikke kopiere presentasjonen.</p>
                                  )}
                                </div>
                              </div>

                              {presentationDraftResult && (
                                <div className="space-y-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-100">
                                  <div>
                                    <p className="font-semibold">
                                      {presentationDraftResult.result.loadedFromHistory
                                        ? "Lagret presentasjonsutkast hentet read-only."
                                        : presentationDraftResult.result.duplicate
                                        ? "Identisk presentasjonsutkast var allerede lagret."
                                        : "Presentasjonsutkast lagret som draft uten eksterne sideeffekter."}
                                    </p>
                                    <p className="mt-1 text-emerald-100/80">
                                      Presentation {presentationDraftResult.result.presentationId} · Message draft {presentationDraftResult.result.messageDraftId}
                                    </p>
                                    <p className="mt-1 text-xs text-emerald-100/70">
                                      Status: {presentationDraftResult.result.status} · E-poststatus: {presentationDraftResult.result.messageStatus} ·
                                      E-post sendt: nei · Leads opprettet: nei · Kontakter opprettet: nei ·
                                      Presentasjon publisert: nei · Property matching-jobb startet: nei
                                    </p>
                                  </div>

                                  <InternalPresentationPreview
                                    preview={presentationDraftResult.result.presentationPreview}
                                    returnTo={presentationDraftReturnUrl}
                                  />

                                  <div className="rounded-lg border border-emerald-400/20 bg-slate-950/70 p-3">
                                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                                      <div>
                                        <p className="text-xs font-semibold uppercase tracking-wide text-emerald-200/70">
                                          Rediger e-postutkast lokalt
                                        </p>
                                        <p className="mt-1 text-xs text-emerald-100/70">
                                          Endringene lagres ikke i databasen. Kopier tekst bruker teksten du redigerer her.
                                        </p>
                                      </div>
                                      <div className="flex flex-wrap gap-2">
                                        <Button type="button" variant="outline" size="sm" onClick={copyEmailDraftText}>
                                          <Clipboard className="mr-2 h-4 w-4" />
                                          Kopier tekst
                                        </Button>
                                        {presentationDraftResult.result.messageDraft.bodyHtml && (
                                          <Button type="button" variant="outline" size="sm" onClick={copyEmailDraftHtml}>
                                            <Clipboard className="mr-2 h-4 w-4" />
                                            Kopier HTML
                                          </Button>
                                        )}
                                      </div>
                                    </div>
                                    <div className="mt-3 space-y-3">
                                      <label className="block text-xs font-semibold text-slate-300" htmlFor="lead-intelligence-email-subject">
                                        Emne
                                      </label>
                                      <input
                                        id="lead-intelligence-email-subject"
                                        value={editableEmailSubject}
                                        onChange={(event) => {
                                          setEditableEmailSubject(event.target.value);
                                          resetDraftCopyState();
                                        }}
                                        className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-primary-500"
                                      />
                                      <label className="block text-xs font-semibold text-slate-300" htmlFor="lead-intelligence-email-body">
                                        E-posttekst
                                      </label>
                                      <textarea
                                        id="lead-intelligence-email-body"
                                        value={editableEmailBody}
                                        onChange={(event) => {
                                          setEditableEmailBody(event.target.value);
                                          resetDraftCopyState();
                                        }}
                                        rows={14}
                                        className="w-full resize-y rounded-lg border border-slate-700 bg-slate-950 px-3 py-3 font-mono text-xs text-slate-100 outline-none focus:border-primary-500"
                                      />
                                    </div>
                                    {presentationDraftResult.result.messageDraft.bodyHtml && (
                                      <details className="mt-3 rounded border border-slate-800 bg-slate-950/60 p-3">
                                        <summary className="cursor-pointer text-xs font-semibold text-emerald-100">
                                          HTML-versjon
                                        </summary>
                                        <pre className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap text-xs text-slate-100">
                                          {presentationDraftResult.result.messageDraft.bodyHtml}
                                        </pre>
                                      </details>
                                    )}
                                    <p className="mt-2 text-xs text-emerald-100/70">
                                      Dette er kun et draft-preview. Det finnes ingen send-knapp i denne fasen.
                                    </p>
                                    {emailDraftCopyState === "copied" && (
                                      <p className="mt-2 text-xs text-emerald-300">Lagret e-posttekst kopiert.</p>
                                    )}
                                    {emailDraftCopyState === "failed" && (
                                      <p className="mt-2 text-xs text-red-300">Kunne ikke kopiere lagret e-posttekst.</p>
                                    )}
                                    {emailDraftHtmlCopyState === "copied" && (
                                      <p className="mt-2 text-xs text-emerald-300">Lagret HTML-utkast kopiert.</p>
                                    )}
                                    {emailDraftHtmlCopyState === "failed" && (
                                      <p className="mt-2 text-xs text-red-300">Kunne ikke kopiere lagret HTML-utkast.</p>
                                    )}
                                  </div>
                                </div>
                              )}

                              {presentationDraftError && (
                                <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-100">
                                  <p className="font-semibold">{presentationDraftError.code}</p>
                                  <p className="mt-1">{presentationDraftError.message}</p>
                                  {presentationDraftError.details && (
                                    <pre className="mt-2 max-h-48 overflow-auto rounded bg-red-950/50 p-2 text-xs text-red-50">
                                      {prettyJson(presentationDraftError.details)}
                                    </pre>
                                  )}
                                  <p className="mt-2 text-xs text-red-100/70">
                                    Correlation ID: {presentationDraftError.correlationId}
                                  </p>
                                </div>
                              )}

                              <div className="space-y-3">
                                <div className="flex flex-wrap items-end justify-between gap-2">
                                  <div>
                                    <p className="text-sm font-semibold text-slate-100">Boligkort</p>
                                    <p className="mt-1 text-xs text-slate-500">
                                      Kortene er et internt utkast Freddy kan kvalitetssikre før noe deles med kunden.
                                    </p>
                                  </div>
                                  <Badge variant="outline">{selectedShortlistMatches.length} valgt</Badge>
                                </div>

                                <div className="grid gap-3 xl:grid-cols-2">
                                  {selectedShortlistMatches.map((match) => {
                                    const verification = uniquePresentationItems([
                                      ...match.concerns.slice(0, 2),
                                      ...match.questionsToVerify.slice(0, 2),
                                    ], 4);
                                    const reasons = humanizedMatchReasonItems(match.reasonsForMatch, 3);
                                    const propertyUrl = match.property.publicUrl;
                                    const cardContent = (
                                      <>
                                        {match.property.primaryImageUrl ? (
                                          <img
                                            src={match.property.primaryImageUrl}
                                            alt={propertyDisplayName(match)}
                                            className="h-44 w-full object-cover"
                                          />
                                        ) : (
                                          <div className="flex h-44 items-center justify-center bg-slate-900 text-sm text-slate-500">
                                            Ingen bilde i eiendomsdata
                                          </div>
                                        )}
                                        <div className="space-y-3 p-3">
                                          <div className="flex flex-wrap items-start justify-between gap-2">
                                            <div>
                                              <p className="text-sm font-semibold text-slate-100">{propertyDisplayName(match)}</p>
                                              {propertyFactsLine(match) && (
                                                <p className="mt-1 text-xs text-slate-400">{propertyFactsLine(match)}</p>
                                              )}
                                            </div>
                                            <Badge variant={matchReviewDecisionVariant(match.decision)}>
                                              {decisionLabelForPresentation(match.decision)}
                                            </Badge>
                                          </div>
                                          <div className="flex flex-wrap gap-2 text-xs">
                                            <Badge variant="outline">Score {match.score}</Badge>
                                            <Badge variant="outline">Data {match.dataQualityScore}</Badge>
                                            <Badge
                                              variant={
                                                match.eligibility === "eligible"
                                                  ? "success"
                                                  : match.eligibility === "rejected"
                                                    ? "destructive"
                                                    : "warning"
                                              }
                                            >
                                              {match.eligibility}
                                            </Badge>
                                          </div>
                                          {propertyUrl && (
                                            <div className="flex items-center gap-1 text-xs font-semibold text-primary-300">
                                              <ExternalLink className="h-3.5 w-3.5" />
                                              <span>Åpne boligside</span>
                                            </div>
                                          )}
                                          <div>
                                            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                                              Hvorfor den passer
                                            </p>
                                            <ul className="mt-2 space-y-1 text-xs text-slate-200">
                                              {(reasons.length > 0 ? reasons : ["Matcher deler av behovet."]).map((reason) => (
                                                <li key={reason} className="flex gap-2">
                                                  <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-300" />
                                                  <span>{reason}</span>
                                                </li>
                                              ))}
                                            </ul>
                                          </div>
                                          <div>
                                            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                                              Må avklares
                                            </p>
                                            <ul className="mt-2 space-y-1 text-xs text-amber-100">
                                              {(verification.length > 0
                                                ? verification
                                                : ["Pris, tilgjengelighet og nøkkelfakta må bekreftes."]).map((item) => (
                                                <li key={item} className="flex gap-2">
                                                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-300" />
                                                  <span>{item}</span>
                                                </li>
                                              ))}
                                            </ul>
                                          </div>
                                        </div>
                                      </>
                                    );

                                    return propertyUrl ? (
                                      <a
                                        key={match.propertyId}
                                        href={propertyUrl}
                                        target="_blank"
                                        rel="noreferrer"
                                        aria-label={`Åpne boligside for ${propertyDisplayName(match)}`}
                                        className="block overflow-hidden rounded-lg border border-slate-800 bg-slate-950/60 transition hover:border-primary-500/60 hover:bg-slate-900/70 focus:outline-none focus:ring-2 focus:ring-primary-500/70"
                                      >
                                        {cardContent}
                                      </a>
                                    ) : (
                                      <div key={match.propertyId} className="overflow-hidden rounded-lg border border-slate-800 bg-slate-950/60">
                                        {cardContent}
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>

                              <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
                                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                                  <div>
                                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                                      E-postutkast
                                    </p>
                                    <p className="mt-3 text-sm font-semibold text-slate-100">{shortlistEmailDraft.subject}</p>
                                  </div>
                                  <Button type="button" variant="outline" size="sm" onClick={copyEmailDraftText}>
                                    <Clipboard className="mr-2 h-4 w-4" />
                                    Kopier e-postutkast
                                  </Button>
                                </div>
                                <pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap rounded border border-slate-800 bg-slate-950/80 p-3 text-xs text-slate-200">{shortlistEmailDraft.body}</pre>
                                {emailDraftCopyState === "copied" && (
                                  <p className="mt-2 text-xs text-emerald-300">E-postutkast kopiert.</p>
                                )}
                                {emailDraftCopyState === "failed" && (
                                  <p className="mt-2 text-xs text-red-300">Kunne ikke kopiere e-postutkastet.</p>
                                )}
                              </div>
                            </div>
                          )}

                          {shortlistSaveError && (
                            <div className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-100">
                              <p className="font-semibold">{shortlistSaveError.code}</p>
                              <p className="mt-1">{shortlistSaveError.message}</p>
                              {shortlistSaveError.details && (
                                <pre className="mt-2 max-h-48 overflow-auto rounded bg-red-950/50 p-2 text-xs text-red-50">
                                  {prettyJson(shortlistSaveError.details)}
                                </pre>
                              )}
                              <p className="mt-2 text-xs text-red-100/80">Correlation ID: {shortlistSaveError.correlationId}</p>
                            </div>
                          )}
                        </div>

                        {(propertyMatchResult.result.missingPropertyReferences.length > 0 ||
                          propertyMatchResult.result.skippedProperties.length > 0) && (
                          <JsonSection
                            title="Diagnostics"
                            value={{
                              missingPropertyReferences: propertyMatchResult.result.missingPropertyReferences,
                              skippedProperties: propertyMatchResult.result.skippedProperties,
                            }}
                          />
                        )}

                        <p className="text-xs text-slate-500">
                          E-post sendt: nei · Leads opprettet: nei · Kontakter opprettet: nei ·
                          Matcher lagret: nei · Correlation ID: {propertyMatchResult.correlationId}
                        </p>
                      </div>
                    )}
                  </div>
                )}

                <div className="space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 className="text-sm font-semibold text-slate-200">Rediger hele AI-forslaget lokalt</h2>
                    <Button type="button" variant="outline" size="sm" onClick={copyJson}>
                      <Clipboard className="mr-2 h-4 w-4" />
                      Kopier JSON
                    </Button>
                  </div>
                  <textarea
                    value={editableJson}
                    onChange={(event) => {
                      setEditableJson(event.target.value);
                      clearContactCandidates();
                      setSaveResult(null);
                    }}
                    rows={18}
                    className="w-full resize-y rounded-lg border border-slate-600 bg-slate-950 px-3 py-3 font-mono text-xs text-slate-100 outline-none focus:border-primary-500"
                  />
                  <div className="flex items-center gap-2 text-xs">
                    {jsonEditor.error ? (
                      <span className="text-amber-300">JSON er ikke gyldig: {jsonEditor.error}</span>
                    ) : (
                      <span className="flex items-center gap-1 text-emerald-300">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Lokalt preview er gyldig JSON.
                      </span>
                    )}
                    {copyState === "copied" && <span className="text-primary-300">Kopiert.</span>}
                    {copyState === "failed" && <span className="text-red-300">Kunne ikke kopiere.</span>}
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
