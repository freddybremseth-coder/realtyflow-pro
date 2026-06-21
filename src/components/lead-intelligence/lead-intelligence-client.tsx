"use client";

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clipboard,
  Loader2,
  MessageSquareText,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  ShieldCheck,
  Sparkles,
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

interface PropertyMatchPreviewResponse {
  ok: true;
  correlationId: string;
  result: {
    buyerProfileId: string;
    analyzed: number;
    matched: number;
    missingPropertyIds: string[];
    skippedProperties: Array<{
      propertyId: string;
      reason: "PROPERTY_BRAND_MISMATCH" | "PROPERTY_NORMALIZATION_FAILED";
    }>;
    matches: Array<{
      propertyId: string;
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

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function parsePropertyIds(value: string) {
  const ids = value
    .split(/[\s,;]+/)
    .map((item) => item.trim())
    .filter(Boolean);
  const unique = Array.from(new Set(ids));

  if (ids.length !== unique.length) {
    return { ids: unique, error: "Property IDs må være unike." };
  }

  if (unique.length > 20) {
    return { ids: unique.slice(0, 20), error: "Maks 20 property IDs kan forhåndsvises samtidig." };
  }

  const invalid = unique.find((id) => !uuidPattern.test(id));
  if (invalid) {
    return { ids: unique, error: `Ugyldig property UUID: ${invalid}` };
  }

  return { ids: unique, error: null };
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
  const [propertyIdsText, setPropertyIdsText] = useState("");
  const [propertyMatchLoading, setPropertyMatchLoading] = useState(false);
  const [propertyMatchError, setPropertyMatchError] = useState<SafeErrorResponse["error"] | null>(null);
  const [propertyMatchResult, setPropertyMatchResult] = useState<PropertyMatchPreviewResponse | null>(null);

  const jsonEditor = useMemo(() => parseJsonEditor(editableJson), [editableJson]);
  const edited = jsonEditor.parsed || response?.result || null;
  const phoneBadge = response ? badgeForPhone(response.meta.phoneNormalization.status) : null;
  const remaining = LEAD_INTELLIGENCE_LIMITS.bodyText - rawText.length;
  const reviewCriteria = useMemo(() => flattenReviewCriteria(edited), [edited]);
  const reviewedCount = reviewCriteria.filter(
    (criterion) => criterionReviews[criterion.id]?.approvalStatus && criterionReviews[criterion.id].approvalStatus !== "pending",
  ).length;
  const allCriteriaReviewed = reviewCriteria.length > 0 && reviewedCount === reviewCriteria.length;
  const parsedPropertyIds = useMemo(() => parsePropertyIds(propertyIdsText), [propertyIdsText]);

  const clearPropertyMatchPreview = () => {
    setPropertyMatchError(null);
    setPropertyMatchResult(null);
  };

  const clearContactCandidates = () => {
    setContactCandidatesLoaded(false);
    setContactCandidates([]);
    setContactCandidateError(null);
    setContactDecision("continue_without_contact");
    setSelectedContactId(null);
    setSaveError(null);
    setSaveResult(null);
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
    setContactDecision("continue_without_contact");
    setSelectedContactId(null);
    setSaveError(null);
    setSaveResult(null);
    setPropertyIdsText("");
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
      clearPropertyMatchPreview();
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

  const previewPropertyMatches = async () => {
    if (!saveResult || !propertyMatchingEnabled || parsedPropertyIds.error) return;
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
          propertyIds: parsedPropertyIds.ids,
          maxResults: parsedPropertyIds.ids.length,
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
                            {saveResult.result.status.duplicate
                              ? "Identisk review var allerede lagret."
                              : "Review lagret uten eksterne sideeffekter."}
                          </p>
                          <p className="mt-1 text-emerald-100/80">
                            Intake {saveResult.result.intake.id} · Buyer profile {saveResult.result.buyerProfile.id} ·
                            kriterier {saveResult.result.buyerProfile.criterionCount}
                          </p>
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
                        <h2 className="text-sm font-semibold text-slate-200">Eiendomsmatch-preview</h2>
                        <p className="mt-1 text-xs text-slate-500">
                          Lim inn eksplisitte property-ID-er for å forhåndsvise deterministisk match mot denne
                          kjøperprofilen. Resultatet lagres ikke og lager ingen shortlist.
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
                      <FieldLabel>Property IDs</FieldLabel>
                      <textarea
                        value={propertyIdsText}
                        onChange={(event) => {
                          setPropertyIdsText(event.target.value);
                          clearPropertyMatchPreview();
                        }}
                        rows={4}
                        placeholder="Én UUID per linje, eller separert med komma..."
                        className="w-full resize-y rounded-lg border border-slate-600 bg-slate-950 px-3 py-3 font-mono text-xs text-slate-100 outline-none focus:border-primary-500"
                      />
                      <p className="text-xs text-slate-500">
                        Maks 20 eksplisitte property-ID-er. UI-et gjør ikke automatisk inventory-søk.
                      </p>
                    </div>

                    {parsedPropertyIds.error && (
                      <p className="mt-2 text-sm text-amber-300">{parsedPropertyIds.error}</p>
                    )}

                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={previewPropertyMatches}
                        disabled={
                          propertyMatchLoading ||
                          !propertyMatchingEnabled ||
                          !saveResult ||
                          parsedPropertyIds.ids.length === 0 ||
                          Boolean(parsedPropertyIds.error)
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
                        <div className="grid gap-3 md:grid-cols-4">
                          <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3">
                            <p className="text-xs uppercase tracking-wide text-slate-500">Analysert</p>
                            <p className="mt-1 text-lg font-semibold text-slate-100">{propertyMatchResult.result.analyzed}</p>
                          </div>
                          <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3">
                            <p className="text-xs uppercase tracking-wide text-slate-500">Matcher</p>
                            <p className="mt-1 text-lg font-semibold text-slate-100">{propertyMatchResult.result.matched}</p>
                          </div>
                          <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3">
                            <p className="text-xs uppercase tracking-wide text-slate-500">Mangler</p>
                            <p className="mt-1 text-lg font-semibold text-slate-100">{propertyMatchResult.result.missingPropertyIds.length}</p>
                          </div>
                          <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3">
                            <p className="text-xs uppercase tracking-wide text-slate-500">Skipped</p>
                            <p className="mt-1 text-lg font-semibold text-slate-100">{propertyMatchResult.result.skippedProperties.length}</p>
                          </div>
                        </div>

                        <div className="space-y-3">
                          {propertyMatchResult.result.matches.map((match) => (
                            <div key={match.propertyId} className="rounded-lg border border-slate-800 bg-slate-900/60 p-3">
                              <div className="flex flex-wrap items-start justify-between gap-2">
                                <div>
                                  <p className="font-mono text-xs text-slate-400">{match.propertyId}</p>
                                  <p className="mt-1 text-sm text-slate-200">
                                    Score {match.score} · Data {match.dataQualityScore}
                                  </p>
                                </div>
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
                              <div className="mt-3 grid gap-3 lg:grid-cols-3">
                                <MatchList title="Hvorfor match" items={match.reasonsForMatch} emptyLabel="Ingen positive matchgrunner." />
                                <MatchList title="Risiko/avvik" items={match.concerns} emptyLabel="Ingen tydelige avvik." />
                                <MatchList title="Må verifiseres" items={match.questionsToVerify} emptyLabel="Ingen åpne verifikasjonsspørsmål." />
                              </div>
                              {match.budgetResult && (
                                <p className="mt-3 rounded border border-slate-700 bg-slate-950/60 p-2 text-xs text-slate-300">
                                  Budsjett: {match.budgetResult.outcome} · {match.budgetResult.reason}
                                </p>
                              )}
                            </div>
                          ))}
                        </div>

                        {(propertyMatchResult.result.missingPropertyIds.length > 0 ||
                          propertyMatchResult.result.skippedProperties.length > 0) && (
                          <JsonSection
                            title="Diagnostics"
                            value={{
                              missingPropertyIds: propertyMatchResult.result.missingPropertyIds,
                              skippedProperties: propertyMatchResult.result.skippedProperties,
                            }}
                          />
                        )}

                        <p className="text-xs text-slate-500">
                          E-post sendt: nei · Leads opprettet: nei · Kontakter opprettet: nei ·
                          Matcher lagret: nei · Shortlist opprettet: nei · Correlation ID: {propertyMatchResult.correlationId}
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
