"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clipboard,
  Loader2,
  MessageSquareText,
  RefreshCw,
  Save,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LEAD_INTELLIGENCE_LIMITS, type ExtractedLead } from "@/services/lead-intelligence/contracts";
import {
  JsonSection,
  TextInput,
  flattenReviewCriteria,
  generateClientCorrelationId,
  parseJsonEditor,
  parsePropertyReferences,
  prettyJson,
} from "@/components/lead-intelligence/lead-intelligence-client-helpers";
import {
  MatchList,
  MatchReviewDecisionBadge,
  PropertyEligibilityBadge,
  PropertyMatchHeroImage,
  PropertyMatchThumbnail,
  formatCurrency,
  propertyDisplayName,
  propertyFactsLine,
  shortPropertyId,
  type MatchReviewDecision,
  type SelectedShortlistDecision,
} from "@/components/lead-intelligence/property-match-display";
import {
  buildShortlistEmailDraft,
  buildShortlistPresentation,
  buildShortlistPresentationText,
  humanizedMatchReasonItems,
  uniquePresentationItems,
  type SelectedShortlistMatch,
} from "@/components/lead-intelligence/shortlist-presentation-drafts";
import {
  InternalPresentationPreview,
  PropertyNavigationLinks,
  leadIntelligenceMatchAnchor,
  leadIntelligenceMatchReturnUrl,
} from "@/components/lead-intelligence/presentation-preview-panel";
import {
  PropertyQualityReviewControls,
  defaultPropertyQualityReview,
  type PropertyQualityReviewState,
  type PropertyQualityReviewStatus,
  type SavedPropertyQualityReviewStatus,
} from "@/components/lead-intelligence/property-quality-review-controls";
import {
  LeadIntelligenceRequestCard,
  type LeadIntelligenceSource,
} from "@/components/lead-intelligence/lead-intelligence-request-card";
import { LeadIntelligenceErrorAlert } from "@/components/lead-intelligence/lead-intelligence-error-alert";
import { LeadIntelligenceShortlistDraftPanel } from "@/components/lead-intelligence/lead-intelligence-shortlist-draft-panel";
import { LeadIntelligenceShortlistSaveNotice } from "@/components/lead-intelligence/lead-intelligence-shortlist-save-notice";
import { LeadIntelligenceAnalysisOverview } from "@/components/lead-intelligence/lead-intelligence-analysis-overview";
import {
  LeadIntelligenceCriteriaReviewPanel,
  type CriterionReviewState,
} from "@/components/lead-intelligence/lead-intelligence-criteria-review-panel";
import {
  LeadIntelligenceContactCandidatesPanel,
  type LeadContactCandidatePreview,
  type LeadContactDecision,
} from "@/components/lead-intelligence/lead-intelligence-contact-candidates-panel";
import { LeadIntelligenceReviewSavePanel } from "@/components/lead-intelligence/lead-intelligence-review-save-panel";
import {
  LeadIntelligenceWorklistHistoryPanel,
  type LeadIntelligenceWorklistItem,
} from "@/components/lead-intelligence/lead-intelligence-worklist-history-panel";
import { LeadIntelligenceSavedProfileContactPanel } from "@/components/lead-intelligence/lead-intelligence-saved-profile-contact-panel";
import { LeadIntelligencePresentationHistoryPanel } from "@/components/lead-intelligence/lead-intelligence-presentation-history-panel";
import { LeadIntelligenceLoadedPresentationDraftPanel } from "@/components/lead-intelligence/lead-intelligence-loaded-presentation-draft-panel";
import { LeadIntelligenceActiveProfileMatchControls } from "@/components/lead-intelligence/lead-intelligence-active-profile-match-controls";
import { LeadIntelligencePropertyMatchSummary } from "@/components/lead-intelligence/lead-intelligence-property-match-summary";
import { LeadIntelligenceMatchReviewSelect } from "@/components/lead-intelligence/lead-intelligence-match-review-select";
import { LeadIntelligencePropertyMatchAlerts } from "@/components/lead-intelligence/lead-intelligence-property-match-alerts";
import {
  leadIntelligenceDraftReturnUrl,
  realEstateBrands,
  savedPropertyQualityDecision,
  sourceOptions,
} from "@/components/lead-intelligence/lead-intelligence-client-config";
import type {
  ContactCandidatesResponse,
  LeadAnalysisResponse,
  LeadIntelligenceClientProps,
  LeadIntelligenceCrmContextResponse,
  LeadIntelligenceWorklistResponse,
  PresentationDraftHistoryResponse,
  PresentationDraftResponse,
  PropertyMatchPreviewResponse,
  ReviewSaveResponse,
  SafeErrorResponse,
  SavedProfileArchiveResponse,
  SavedProfileContactCandidatesResponse,
  SavedProfileContactCreateResponse,
  SavedProfileContactLinkResponse,
  ShortlistSaveResponse,
} from "@/components/lead-intelligence/lead-intelligence-client-types";

type Source = LeadIntelligenceSource;

export function LeadIntelligenceClient({
  featureEnabled,
  persistenceEnabled,
  connectExistingEnabled,
  createContactEnabled,
  propertyMatchingEnabled,
}: LeadIntelligenceClientProps) {
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
  const [contactDecision, setContactDecision] = useState<LeadContactDecision>("continue_without_contact");
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);
  const [saveLoading, setSaveLoading] = useState(false);
  const [saveError, setSaveError] = useState<SafeErrorResponse["error"] | null>(null);
  const [saveResult, setSaveResult] = useState<ReviewSaveResponse | null>(null);
  const [propertyReferencesText, setPropertyReferencesText] = useState("");
  const [propertyMatchLoading, setPropertyMatchLoading] = useState(false);
  const [propertyMatchError, setPropertyMatchError] = useState<SafeErrorResponse["error"] | null>(null);
  const [propertyMatchResult, setPropertyMatchResult] = useState<PropertyMatchPreviewResponse | null>(null);
  const [matchReviewDecisions, setMatchReviewDecisions] = useState<Record<string, MatchReviewDecision>>({});
  const [propertyQualityReviews, setPropertyQualityReviews] = useState<Record<string, PropertyQualityReviewState>>({});
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
  const [profileContactCreateLoading, setProfileContactCreateLoading] = useState(false);
  const [profileContactCreateError, setProfileContactCreateError] = useState<SafeErrorResponse["error"] | null>(null);
  const [profileContactCreateResult, setProfileContactCreateResult] = useState<SavedProfileContactCreateResponse | null>(null);
  const [profileArchiveLoading, setProfileArchiveLoading] = useState(false);
  const [profileArchiveError, setProfileArchiveError] = useState<SafeErrorResponse["error"] | null>(null);
  const [profileArchiveResult, setProfileArchiveResult] = useState<SavedProfileArchiveResponse | null>(null);
  const [highlightedMatchId, setHighlightedMatchId] = useState<string | null>(null);

  const jsonEditor = useMemo(() => parseJsonEditor(editableJson), [editableJson]);
  const edited = jsonEditor.parsed || response?.result || null;
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
      .map((match) => {
        const qualityReview = propertyQualityReviews[match.propertyId] || defaultPropertyQualityReview();
        if (qualityReview.status === "unreviewed") return null;
        const reviewDecision = matchReviewDecisions[match.propertyId] || "system";
        return {
          propertyId: match.propertyId,
          decision: savedPropertyQualityDecision(qualityReview.status, reviewDecision),
          qualityReview: {
            status: qualityReview.status,
            note: qualityReview.note.trim() || null,
            checkedAt: qualityReview.checkedAt || new Date().toISOString(),
            checkedBy: qualityReview.checkedBy || "Freddy",
          },
        };
      })
      .filter((item): item is {
        propertyId: string;
        decision: SelectedShortlistDecision;
        qualityReview: {
          status: SavedPropertyQualityReviewStatus;
          note: string | null;
          checkedAt: string;
          checkedBy: string;
        };
      } => Boolean(item));
  }, [matchReviewDecisions, propertyMatchResult, propertyQualityReviews]);
  const clientReadyShortlistItems = useMemo(
    () => selectedShortlistItems.filter((item) => item.qualityReview.status === "client_ready"),
    [selectedShortlistItems],
  );
  const selectedShortlistMatches = useMemo(() => {
    if (!propertyMatchResult) return [];
    const selectedById = new Map(clientReadyShortlistItems.map((item) => [item.propertyId, item]));
    return propertyMatchResult.result.matches
      .map((match) => {
        const selected = selectedById.get(match.propertyId);
        return selected
          ? {
              ...match,
              decision: selected.decision,
              qualityReview: {
                status: "client_ready" as const,
                note: selected.qualityReview.note || "",
                checkedAt: selected.qualityReview.checkedAt,
                checkedBy: selected.qualityReview.checkedBy,
              },
            }
          : null;
      })
      .filter((match): match is SelectedShortlistMatch =>
        Boolean(match),
      );
  }, [clientReadyShortlistItems, propertyMatchResult]);
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

  const clearShortlistAndPresentationState = () => {
    setShortlistSaveError(null);
    setShortlistSaveResult(null);
    clearPresentationDraftState();
  };

  const updatePropertyQualityReviewStatus = (propertyId: string, status: PropertyQualityReviewStatus) => {
    setPropertyQualityReviews((current) => ({
      ...current,
      [propertyId]: {
        ...(current[propertyId] || defaultPropertyQualityReview()),
        status,
        checkedAt: status === "unreviewed" ? null : new Date().toISOString(),
        checkedBy: status === "unreviewed" ? null : "Freddy",
      },
    }));
    clearShortlistAndPresentationState();
  };

  const updatePropertyQualityReviewNote = (propertyId: string, note: string) => {
    setPropertyQualityReviews((current) => ({
      ...current,
      [propertyId]: {
        ...(current[propertyId] || defaultPropertyQualityReview()),
        note: note.slice(0, LEAD_INTELLIGENCE_LIMITS.mediumText),
      },
    }));
    clearShortlistAndPresentationState();
  };

  const updateMatchReviewDecision = (propertyId: string, decision: MatchReviewDecision) => {
    setMatchReviewDecisions((current) => ({
      ...current,
      [propertyId]: decision,
    }));
    clearShortlistAndPresentationState();
  };

  const updatePropertyReferencesText = (value: string) => {
    setPropertyReferencesText(value);
    clearPropertyMatchPreview();
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
    setHighlightedMatchId(null);
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
    setProfileContactCreateLoading(false);
    setProfileContactCreateError(null);
    setProfileContactCreateResult(null);
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
      setPropertyQualityReviews({});
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
    setProfileContactCreateError(null);
    setProfileContactCreateResult(null);
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

  const createContactFromSavedProfile = async () => {
    if (!activeWorklistItem || !persistenceEnabled || !createContactEnabled) return;
    const confirmed = window.confirm(
      "Opprett ny CRM-kontakt fra denne godkjente buyer profile? Dette oppretter én kontakt og kobler profilen, men oppretter ikke lead, e-post eller matchingjobb.",
    );
    if (!confirmed) return;

    setProfileContactCreateLoading(true);
    setProfileContactCreateError(null);
    setProfileContactCreateResult(null);

    try {
      const res = await fetch(
        `/api/lead-intelligence/buyer-profiles/${activeWorklistItem.buyerProfileId}/contact-create`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ brand }),
        },
      );
      const body = (await res.json()) as SavedProfileContactCreateResponse | SafeErrorResponse;
      if (!res.ok || !body.ok) {
        setProfileContactCreateError((body as SafeErrorResponse).error || {
          correlationId: res.headers.get("x-correlation-id") || "unknown",
          code: "INTERNAL_ERROR",
          message: "Kunne ikke opprette CRM-kontakt.",
        });
        return;
      }

      setProfileContactCreateResult(body);
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
                  decision: "create_new",
                  linkedContact: true,
                  duplicate: body.result.duplicate,
                },
              },
            }
          : current,
      );
      void loadWorklist();
    } catch {
      setProfileContactCreateError({
        correlationId: "client",
        code: "INTERNAL_ERROR",
        message: "Kunne ikke kontakte kontaktopprettings-API-et.",
      });
    } finally {
      setProfileContactCreateLoading(false);
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

  useEffect(() => {
    if (typeof window === "undefined") return;
    const hash = window.location.hash;
    if (!hash.startsWith("#lead-intelligence-match-")) return;

    const targetId = decodeURIComponent(hash.slice(1));
    const propertyId = targetId.replace(/^lead-intelligence-match-/, "");
    let clearHighlightTimer: number | undefined;

    const scrollTimer = window.setTimeout(() => {
      const target = document.getElementById(targetId);
      if (!target) return;
      setHighlightedMatchId(propertyId);
      target.scrollIntoView({ behavior: "smooth", block: "center" });
      clearHighlightTimer = window.setTimeout(() => {
        setHighlightedMatchId((current) => (current === propertyId ? null : current));
      }, 3500);
    }, 150);

    return () => {
      window.clearTimeout(scrollTimer);
      if (clearHighlightTimer) window.clearTimeout(clearHighlightTimer);
    };
  }, [activeWorklistItem, propertyMatchResult, presentationDraftResult]);

  const presentationDraftReturnUrl = presentationDraftResult
    ? leadIntelligenceDraftReturnUrl({
        buyerProfileId: presentationDraftResult.result.buyerProfileId,
        presentationId: presentationDraftResult.result.presentationId,
        messageDraftId: presentationDraftResult.result.messageDraftId,
      })
    : null;
  const propertyMatchReturnBaseUrl =
    presentationDraftReturnUrl ||
    leadIntelligenceDraftReturnUrl({
      buyerProfileId: activeWorklistItem?.buyerProfileId || saveResult?.result.buyerProfile.id || null,
    });

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
              <LeadIntelligenceErrorAlert
                error={worklistError}
                className="p-4"
                detailsClassName="mt-3 max-h-40 border border-red-400/20 bg-red-950/30 text-red-100/90"
              />
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

                        <LeadIntelligenceSavedProfileContactPanel
                          activeWorklistItem={activeWorklistItem}
                          persistenceEnabled={persistenceEnabled}
                          connectExistingEnabled={connectExistingEnabled}
                          createContactEnabled={createContactEnabled}
                          contactCandidates={profileContactCandidatesResult?.result.candidates ?? null}
                          selectedContactId={profileSelectedContactId}
                          contactCandidatesLoading={profileContactCandidatesLoading}
                          contactLinkLoading={profileContactLinkLoading}
                          contactCreateLoading={profileContactCreateLoading}
                          profileArchiveLoading={profileArchiveLoading}
                          contactCandidatesError={profileContactCandidatesError}
                          contactLinkError={profileContactLinkError}
                          contactCreateError={profileContactCreateError}
                          profileArchiveError={profileArchiveError}
                          contactCreateResult={profileContactCreateResult}
                          contactLinkResult={profileContactLinkResult}
                          profileArchiveResult={profileArchiveResult}
                          onLoadContactCandidates={loadSavedProfileContactCandidates}
                          onCreateContact={createContactFromSavedProfile}
                          onArchiveProfile={archiveActiveProfile}
                          onSelectContactCandidate={(contactId) => {
                            setProfileSelectedContactId(contactId);
                            setProfileContactLinkError(null);
                            setProfileContactLinkResult(null);
                          }}
                          onLinkContact={linkSavedProfileContact}
                        />

                        <LeadIntelligencePresentationHistoryPanel
                          latestPresentationId={activeWorklistItem.latestPresentationId}
                          latestMessageDraftId={activeWorklistItem.latestMessageDraftId}
                          history={presentationDraftHistoryResult?.result ?? null}
                          historyError={presentationDraftHistoryError}
                          showHistoryError={!propertyMatchResult}
                          presentationDraftLoading={presentationDraftLoading}
                          presentationDraftHistoryLoading={presentationDraftHistoryLoading}
                          onLoadLatestPresentationDraft={loadLatestPresentationDraft}
                          onLoadPresentationDraftHistory={loadPresentationDraftHistory}
                          onLoadPresentationDraftById={loadPresentationDraftById}
                        />

                        {presentationDraftResult?.result.loadedFromHistory && (
                          <LeadIntelligenceLoadedPresentationDraftPanel
                            draft={presentationDraftResult.result}
                            returnTo={presentationDraftReturnUrl}
                            anchorCards={!propertyMatchResult}
                            highlightedMatchId={highlightedMatchId}
                            editableEmailSubject={editableEmailSubject}
                            editableEmailBody={editableEmailBody}
                            emailDraftCopyState={emailDraftCopyState}
                            emailDraftHtmlCopyState={emailDraftHtmlCopyState}
                            onCopyEmailText={copyEmailDraftText}
                            onCopyEmailHtml={copyEmailDraftHtml}
                            onEmailSubjectChange={(value) => {
                              setEditableEmailSubject(value);
                              resetDraftCopyState();
                            }}
                            onEmailBodyChange={(value) => {
                              setEditableEmailBody(value);
                              resetDraftCopyState();
                            }}
                          />
                        )}

                        {presentationDraftError && !propertyMatchResult && (
                          <LeadIntelligenceErrorAlert
                            error={presentationDraftError}
                            detailsClassName="max-h-40 bg-red-950/50 text-red-50"
                          />
                        )}

                        <LeadIntelligenceActiveProfileMatchControls
                          propertyReferencesText={propertyReferencesText}
                          parsedPropertyReferences={parsedPropertyReferences}
                          propertyMatchLoading={propertyMatchLoading}
                          propertyMatchingEnabled={propertyMatchingEnabled}
                          propertyMatchError={propertyMatchError}
                          onPropertyReferencesChange={updatePropertyReferencesText}
                          onPreviewPropertyMatches={previewPropertyMatches}
                        />
                      </div>

                      {propertyMatchResult && (
                        <div className="space-y-3">
                          <>
                            <LeadIntelligencePropertyMatchSummary
                              className="sm:grid-cols-4"
                              stats={[
                                { label: "Analysert", value: propertyMatchResult.result.analyzed },
                                { label: "Aktuelle", value: propertyMatchResult.result.matched },
                                { label: "Mangler", value: propertyMatchResult.result.missingPropertyReferences.length },
                                { label: "Klar for kunde", value: clientReadyShortlistItems.length },
                              ]}
                            />

                            <LeadIntelligencePropertyMatchAlerts
                              variant="active-profile"
                              bestEffort={propertyMatchResult.result.bestEffort}
                              matched={propertyMatchResult.result.matched}
                              matchCount={propertyMatchResult.result.matches.length}
                            />

                            <div className="max-h-[34rem] space-y-3 overflow-auto pr-1">
                              {propertyMatchResult.result.matches.map((match) => {
                                const reviewDecision = matchReviewDecisions[match.propertyId] || "system";
                                const isHighlightedMatch = highlightedMatchId === match.propertyId;
                                return (
                                  <div
                                    key={match.propertyId}
                                    id={leadIntelligenceMatchAnchor(match.propertyId) || undefined}
                                    className={`scroll-mt-28 rounded-lg border p-3 transition-all duration-500 ${
                                      isHighlightedMatch
                                        ? "border-primary-300 bg-primary-500/10 ring-2 ring-primary-300/70"
                                        : "border-slate-800 bg-slate-900/60"
                                    }`}
                                  >
                                    <div className="flex flex-wrap items-start justify-between gap-3">
                                      <div className="flex min-w-0 gap-3">
                                        <PropertyMatchThumbnail match={match} />
                                        <div className="min-w-0">
                                        <p className="truncate text-sm font-semibold text-slate-100">
                                          {propertyDisplayName(match)}
                                        </p>
                                        {propertyFactsLine(match) && (
                                          <p className="mt-1 text-xs text-slate-400">{propertyFactsLine(match)}</p>
                                        )}
                                        <div className="mt-2">
                                          <PropertyNavigationLinks
                                            propertyId={match.propertyId}
                                            publicUrl={match.property.publicUrl}
                                            returnTo={leadIntelligenceMatchReturnUrl(propertyMatchReturnBaseUrl, match.propertyId)}
                                          />
                                        </div>
                                        </div>
                                      </div>
                                      <div className="flex flex-col items-end gap-2">
                                        <p className="text-sm text-slate-200">Score {match.score}</p>
                                        <PropertyEligibilityBadge eligibility={match.eligibility} />
                                      </div>
                                    </div>
                                    <div className="mt-3">
                                      <LeadIntelligenceMatchReviewSelect
                                        idPrefix="active-match-review"
                                        propertyId={match.propertyId}
                                        value={reviewDecision}
                                        onChange={(decision) => updateMatchReviewDecision(match.propertyId, decision)}
                                      />
                                    </div>
                                    <PropertyQualityReviewControls
                                      propertyId={match.propertyId}
                                      idPrefix="active-match"
                                      review={propertyQualityReviews[match.propertyId] || defaultPropertyQualityReview()}
                                      onStatusChange={updatePropertyQualityReviewStatus}
                                      onNoteChange={updatePropertyQualityReviewNote}
                                    />
                                    <MatchList title="Risiko/avvik" items={match.concerns} emptyLabel="Ingen tydelige avvik." />
                                  </div>
                                );
                              })}
                            </div>

                            <LeadIntelligenceShortlistDraftPanel
                              selectedCount={selectedShortlistItems.length}
                              clientReadyCount={clientReadyShortlistItems.length}
                              loading={shortlistSaveLoading}
                              description="Ingen e-post, lead eller kontakt opprettes."
                              layout="md"
                              onSave={saveShortlistDraft}
                            >
                              {shortlistSaveResult && (
                                <LeadIntelligenceShortlistSaveNotice
                                  result={shortlistSaveResult.result}
                                  summary="saved-count"
                                  className="space-y-3"
                                >
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
                                          anchorCards={!propertyMatchResult}
                                          highlightedMatchId={highlightedMatchId}
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
                                      <LeadIntelligenceErrorAlert error={presentationDraftError} className="mt-3" />
                                    )}
                                  </div>
                                </LeadIntelligenceShortlistSaveNotice>
                              )}

                              {shortlistSaveError && (
                                <LeadIntelligenceErrorAlert error={shortlistSaveError} className="mt-3" />
                              )}
                            </LeadIntelligenceShortlistDraftPanel>
                          </>
                        </div>
                      )}
                    </div>
                  </div>
                )}
                <LeadIntelligenceWorklistHistoryPanel
                  items={worklistResult.result.items}
                  activeBuyerProfileId={activeWorklistItem?.buyerProfileId ?? null}
                  expanded={worklistHistoryExpanded}
                  sourceOptions={sourceOptions}
                  onToggleExpanded={() => setWorklistHistoryExpanded((current) => !current)}
                  onScrollToActiveProfile={() => {
                    document.getElementById("lead-intelligence-active-profile")?.scrollIntoView({
                      behavior: "smooth",
                      block: "start",
                    });
                  }}
                  onContinueFromItem={continueFromWorklistItem}
                />
              </>
            )}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <LeadIntelligenceRequestCard
          source={source}
          sourceOptions={sourceOptions}
          brand={brand}
          brandOptions={realEstateBrands}
          language={language}
          rawText={rawText}
          featureEnabled={featureEnabled}
          loading={loading}
          hasResponse={Boolean(response)}
          error={error}
          onSourceChange={(nextSource) => {
            setSource(nextSource);
            clearContactCandidates();
          }}
          onBrandChange={(nextBrand) => {
            setBrand(nextBrand);
            clearContactCandidates();
            setSaveResult(null);
            setWorklistResult(null);
            setWorklistError(null);
          }}
          onLanguageChange={(value) => {
            setLanguage(value);
            clearContactCandidates();
          }}
          onRawTextChange={(value) => {
            setRawText(value);
            clearContactCandidates();
            setSaveResult(null);
          }}
          onAnalyze={analyze}
          onReset={reset}
        />

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
                <LeadIntelligenceAnalysisOverview
                  response={response}
                  edited={edited}
                  sourceLabel={sourceOptions.find((option) => option.value === source)?.label || "Ikke satt"}
                  brandLabel={realEstateBrands.find((item) => item.id === brand)?.name || brand}
                  language={language}
                  rawText={rawText}
                  onUpdateEdited={updateEdited}
                />

                <div className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
                  <LeadIntelligenceCriteriaReviewPanel
                    criteria={reviewCriteria}
                    reviews={criterionReviews}
                    reviewedCount={reviewedCount}
                    allCriteriaReviewed={allCriteriaReviewed}
                    onReviewChange={updateCriterionReview}
                  />

                  <LeadIntelligenceContactCandidatesPanel
                    hasEditableLead={Boolean(edited)}
                    persistenceEnabled={persistenceEnabled}
                    connectExistingEnabled={connectExistingEnabled}
                    candidateLoading={candidateLoading}
                    crmContextLoading={crmContextLoading}
                    contactCandidatesLoaded={contactCandidatesLoaded}
                    contactCandidates={contactCandidates}
                    contactCandidateError={contactCandidateError}
                    crmContextError={crmContextError}
                    crmContextItems={crmContextResult?.result.context ?? null}
                    contactDecision={contactDecision}
                    selectedContactId={selectedContactId}
                    onLoadContactCandidates={loadContactCandidates}
                    onLoadCrmContext={loadCrmContext}
                    onSelectExistingContact={(contactId) => {
                      setContactDecision("connect_existing");
                      setSelectedContactId(contactId);
                      setSaveError(null);
                      setSaveResult(null);
                    }}
                    onContactDecisionChange={(decision) => {
                      setContactDecision(decision);
                      setSelectedContactId(null);
                      setSaveError(null);
                      setSaveResult(null);
                    }}
                  />
                </div>

                <LeadIntelligenceReviewSavePanel
                  saveLoading={saveLoading}
                  persistenceEnabled={persistenceEnabled}
                  hasJsonError={Boolean(jsonEditor.error)}
                  allCriteriaReviewed={allCriteriaReviewed}
                  contactDecision={contactDecision}
                  selectedContactId={selectedContactId}
                  saveError={saveError}
                  saveResult={saveResult?.result ?? null}
                  hasActiveWorklistItem={Boolean(activeWorklistItem)}
                  onSave={saveReview}
                />

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

                    <LeadIntelligenceActiveProfileMatchControls
                      className="mt-4"
                      fieldLabel="Eiendomsreferanser"
                      helpText="Valgfritt. Maks 20 eksplisitte eiendomsreferanser hvis du vil teste bestemte boliger."
                      rows={4}
                      autoButtonVariant="outline"
                      errorDetailsClassName="max-h-48 bg-red-950/50 text-red-50"
                      propertyReferencesText={propertyReferencesText}
                      parsedPropertyReferences={parsedPropertyReferences}
                      propertyMatchLoading={propertyMatchLoading}
                      propertyMatchingEnabled={propertyMatchingEnabled}
                      propertyMatchError={propertyMatchError}
                      onPropertyReferencesChange={updatePropertyReferencesText}
                      onPreviewPropertyMatches={previewPropertyMatches}
                    />

                    {propertyMatchResult && (
                      <div className="mt-4 space-y-3">
                        <p className="rounded-lg border border-slate-800 bg-slate-900/60 p-3 text-xs text-slate-400">
                          Modus: {propertyMatchResult.result.discoveryMode === "auto" ? "Automatisk søk i eksisterende eiendommer" : "Valgte referanser"}
                          {propertyMatchResult.result.candidateLimit
                            ? ` · Kandidatgrense ${propertyMatchResult.result.candidateLimit}`
                            : ""}
                        </p>
                        <LeadIntelligencePropertyMatchSummary
                          stats={[
                            { label: "Analysert", value: propertyMatchResult.result.analyzed },
                            { label: "Aktuelle", value: propertyMatchResult.result.matched },
                            { label: "Mangler", value: propertyMatchResult.result.missingPropertyReferences.length },
                            { label: "Skipped", value: propertyMatchResult.result.skippedProperties.length },
                          ]}
                        />

                        <LeadIntelligencePropertyMatchAlerts
                          variant="analysis-preview"
                          bestEffort={propertyMatchResult.result.bestEffort}
                          matched={propertyMatchResult.result.matched}
                          matchCount={propertyMatchResult.result.matches.length}
                        />

                        <div className="space-y-3">
                          {propertyMatchResult.result.matches.map((match) => {
                            const reviewDecision = matchReviewDecisions[match.propertyId] || "system";
                            const manualDecisionOverridesRejected =
                              match.eligibility === "rejected" &&
                              (reviewDecision === "current" || reviewDecision === "maybe");

                            const isHighlightedMatch = highlightedMatchId === match.propertyId;
                            return (
                              <div
                                key={match.propertyId}
                                id={leadIntelligenceMatchAnchor(match.propertyId) || undefined}
                                className={`scroll-mt-28 rounded-lg border p-3 transition-all duration-500 ${
                                  isHighlightedMatch
                                    ? "border-primary-300 bg-primary-500/10 ring-2 ring-primary-300/70"
                                    : "border-slate-800 bg-slate-900/60"
                                }`}
                              >
                                <div className="flex flex-wrap items-start justify-between gap-2">
                                  <div className="flex min-w-0 gap-3">
                                    <PropertyMatchThumbnail match={match} />
                                    <div className="min-w-0">
                                      <div className="flex flex-wrap items-center gap-2">
                                        <p className="truncate text-sm font-semibold text-slate-100">
                                          {match.property.title ||
                                            match.property.reference ||
                                            shortPropertyId(match.propertyId)}
                                        </p>
                                      </div>
                                      {propertyFactsLine(match) && (
                                        <p className="mt-1 text-xs text-slate-400">{propertyFactsLine(match)}</p>
                                      )}
                                      <p className="mt-1 font-mono text-[11px] text-slate-500">
                                        ID {shortPropertyId(match.propertyId)}
                                      </p>
                                      <div className="mt-2">
                                        <PropertyNavigationLinks
                                          propertyId={match.propertyId}
                                          publicUrl={match.property.publicUrl}
                                          returnTo={leadIntelligenceMatchReturnUrl(propertyMatchReturnBaseUrl, match.propertyId)}
                                        />
                                      </div>
                                    </div>
                                  </div>
                                  <div className="flex flex-col items-end gap-2">
                                    <p className="text-sm text-slate-200">
                                      Score {match.score} · Data {match.dataQualityScore}
                                    </p>
                                    <PropertyEligibilityBadge eligibility={match.eligibility} />
                                    <MatchReviewDecisionBadge decision={reviewDecision} />
                                  </div>
                                </div>
                                <div className="mt-3 rounded-lg border border-slate-800 bg-slate-950/60 p-3">
                                  <LeadIntelligenceMatchReviewSelect
                                    idPrefix="match-review"
                                    propertyId={match.propertyId}
                                    value={reviewDecision}
                                    onChange={(decision) => updateMatchReviewDecision(match.propertyId, decision)}
                                  />
                                {manualDecisionOverridesRejected && (
                                  <p className="mt-2 rounded border border-amber-500/30 bg-amber-500/10 p-2 text-xs text-amber-100">
                                    Denne boligen er fortsatt avvist av systemreglene. Den kan bare tas med som
                                     «Må undersøkes», og risiko/avvik blir lagret sammen med shortlist-utkastet.
                                  </p>
                                )}
                              </div>
                              <PropertyQualityReviewControls
                                propertyId={match.propertyId}
                                idPrefix="match"
                                review={propertyQualityReviews[match.propertyId] || defaultPropertyQualityReview()}
                                onStatusChange={updatePropertyQualityReviewStatus}
                                onNoteChange={updatePropertyQualityReviewNote}
                              />
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

                        <LeadIntelligenceShortlistDraftPanel
                          selectedCount={selectedShortlistItems.length}
                          clientReadyCount={clientReadyShortlistItems.length}
                          loading={shortlistSaveLoading}
                          description={
                            "Utkastet lagrer bare Freddys kvalitetssjekk. " +
                            "Det oppretter ikke presentasjon, e-post, lead eller kontakt."
                          }
                          onSave={saveShortlistDraft}
                        >
                          {shortlistSaveResult && (
                            <LeadIntelligenceShortlistSaveNotice
                              result={shortlistSaveResult.result}
                              summary="duplicate-aware"
                            />
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
                                    anchorCards={!propertyMatchResult}
                                    highlightedMatchId={highlightedMatchId}
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
                                <LeadIntelligenceErrorAlert error={presentationDraftError} />
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
                                    const cardContent = (
                                      <>
                                        <PropertyMatchHeroImage match={match} />
                                        <div className="space-y-3 p-3">
                                          <div className="flex flex-wrap items-start justify-between gap-2">
                                            <div>
                                              <p className="text-sm font-semibold text-slate-100">{propertyDisplayName(match)}</p>
                                              {propertyFactsLine(match) && (
                                                <p className="mt-1 text-xs text-slate-400">{propertyFactsLine(match)}</p>
                                              )}
                                            </div>
                                            <MatchReviewDecisionBadge decision={match.decision} />
                                          </div>
                                          <div className="flex flex-wrap gap-2 text-xs">
                                            <Badge variant="outline">Score {match.score}</Badge>
                                            <Badge variant="outline">Data {match.dataQualityScore}</Badge>
                                            <PropertyEligibilityBadge eligibility={match.eligibility} />
                                          </div>
                                          <PropertyNavigationLinks
                                            propertyId={match.propertyId}
                                            publicUrl={match.property.publicUrl}
                                            returnTo={leadIntelligenceMatchReturnUrl(propertyMatchReturnBaseUrl, match.propertyId)}
                                          />
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

                                    return (
                                      <div
                                        key={match.propertyId}
                                        className="overflow-hidden rounded-lg border border-slate-800 bg-slate-950/60"
                                      >
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
                            <LeadIntelligenceErrorAlert error={shortlistSaveError} className="mt-3" />
                          )}
                        </LeadIntelligenceShortlistDraftPanel>

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
