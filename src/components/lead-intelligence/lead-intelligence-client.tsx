"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { LEAD_INTELLIGENCE_LIMITS, type ExtractedLead } from "@/services/lead-intelligence/contracts";
import {
  TextInput,
  flattenReviewCriteria,
  generateClientCorrelationId,
  parseJsonEditor,
  parsePropertyReferences,
  prettyJson,
} from "@/components/lead-intelligence/lead-intelligence-client-helpers";
import {
  type MatchReviewDecision,
  type SelectedShortlistDecision,
} from "@/components/lead-intelligence/property-match-display";
import {
  buildShortlistEmailDraft,
  buildShortlistPresentation,
  buildShortlistPresentationText,
  type SelectedShortlistMatch,
} from "@/components/lead-intelligence/shortlist-presentation-drafts";
import {
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
import { LeadIntelligenceActiveProfilePropertyMatchPanel } from "@/components/lead-intelligence/lead-intelligence-active-profile-property-match-panel";
import { LeadIntelligenceAnalysisPropertyMatchPreviewCard } from "@/components/lead-intelligence/lead-intelligence-analysis-property-match-preview-card";
import { LeadIntelligenceJsonEditorPanel } from "@/components/lead-intelligence/lead-intelligence-json-editor-panel";
import { LeadIntelligenceEnvironmentAlerts } from "@/components/lead-intelligence/lead-intelligence-environment-alerts";
import { LeadIntelligencePageHeader } from "@/components/lead-intelligence/lead-intelligence-page-header";
import { LeadIntelligenceActiveProfileHeader } from "@/components/lead-intelligence/lead-intelligence-active-profile-header";
import { LeadIntelligenceWorklistCardHeader } from "@/components/lead-intelligence/lead-intelligence-worklist-card-header";
import { LeadIntelligenceAnalysisPreviewCard } from "@/components/lead-intelligence/lead-intelligence-analysis-preview-card";
import { LeadIntelligenceWorklistResultNotice } from "@/components/lead-intelligence/lead-intelligence-worklist-result-notice";
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
      <LeadIntelligencePageHeader />

      <LeadIntelligenceEnvironmentAlerts
        featureEnabled={featureEnabled}
        persistenceEnabled={persistenceEnabled}
      />

      {featureEnabled && (
        <Card>
          <LeadIntelligenceWorklistCardHeader
            persistenceEnabled={persistenceEnabled}
            worklistLoading={worklistLoading}
            onLoadWorklist={loadWorklist}
          />
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
                <LeadIntelligenceWorklistResultNotice
                  itemCount={worklistResult.result.items.length}
                  archivedBuyerProfileId={profileArchiveResult?.result.buyerProfileId ?? null}
                  hasActiveWorklistItem={Boolean(activeWorklistItem)}
                />
                {activeWorklistItem && saveResult && (
                  <div
                    id="lead-intelligence-active-profile"
                    className="rounded-lg border border-primary-400/60 bg-slate-950 p-4 shadow-lg shadow-primary-950/20"
                  >
                    <LeadIntelligenceActiveProfileHeader
                      activeWorklistItem={activeWorklistItem}
                      propertyMatchingEnabled={propertyMatchingEnabled}
                    />

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
                        <LeadIntelligenceActiveProfilePropertyMatchPanel
                          propertyMatchResult={propertyMatchResult}
                          selectedShortlistCount={selectedShortlistItems.length}
                          clientReadyShortlistCount={clientReadyShortlistItems.length}
                          shortlistSaveLoading={shortlistSaveLoading}
                          shortlistSaveResult={shortlistSaveResult}
                          shortlistSaveError={shortlistSaveError}
                          presentationDraftLoading={presentationDraftLoading}
                          presentationDraftResult={presentationDraftResult}
                          presentationDraftReturnUrl={presentationDraftReturnUrl}
                          presentationDraftError={presentationDraftError}
                          highlightedMatchId={highlightedMatchId}
                          propertyMatchReturnBaseUrl={propertyMatchReturnBaseUrl}
                          matchReviewDecisions={matchReviewDecisions}
                          propertyQualityReviews={propertyQualityReviews}
                          editableEmailSubject={editableEmailSubject}
                          editableEmailBody={editableEmailBody}
                          emailDraftCopyState={emailDraftCopyState}
                          emailDraftHtmlCopyState={emailDraftHtmlCopyState}
                          onMatchReviewDecisionChange={updateMatchReviewDecision}
                          onQualityReviewStatusChange={updatePropertyQualityReviewStatus}
                          onQualityReviewNoteChange={updatePropertyQualityReviewNote}
                          onSaveShortlistDraft={saveShortlistDraft}
                          onSavePresentationDraft={savePresentationDraft}
                          onCopyEmailDraftText={copyEmailDraftText}
                          onCopyEmailDraftHtml={copyEmailDraftHtml}
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

        <LeadIntelligenceAnalysisPreviewCard loading={loading} hasResponse={Boolean(response)}>
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
                  <LeadIntelligenceAnalysisPropertyMatchPreviewCard
                    propertyMatchingEnabled={propertyMatchingEnabled}
                    propertyReferencesText={propertyReferencesText}
                    parsedPropertyReferences={parsedPropertyReferences}
                    propertyMatchLoading={propertyMatchLoading}
                    propertyMatchError={propertyMatchError}
                    propertyMatchResult={propertyMatchResult}
                    selectedShortlistCount={selectedShortlistItems.length}
                    clientReadyShortlistCount={clientReadyShortlistItems.length}
                    selectedShortlistMatches={selectedShortlistMatches}
                    shortlistSaveLoading={shortlistSaveLoading}
                    shortlistSaveResult={shortlistSaveResult}
                    shortlistSaveError={shortlistSaveError}
                    shortlistPresentation={shortlistPresentation}
                    shortlistEmailDraft={shortlistEmailDraft}
                    presentationCopyState={presentationCopyState}
                    presentationDraftLoading={presentationDraftLoading}
                    presentationDraftResult={presentationDraftResult}
                    presentationDraftReturnUrl={presentationDraftReturnUrl}
                    presentationDraftError={presentationDraftError}
                    highlightedMatchId={highlightedMatchId}
                    propertyMatchReturnBaseUrl={propertyMatchReturnBaseUrl}
                    matchReviewDecisions={matchReviewDecisions}
                    propertyQualityReviews={propertyQualityReviews}
                    editableEmailSubject={editableEmailSubject}
                    editableEmailBody={editableEmailBody}
                    emailDraftCopyState={emailDraftCopyState}
                    emailDraftHtmlCopyState={emailDraftHtmlCopyState}
                    onPropertyReferencesChange={updatePropertyReferencesText}
                    onPreviewPropertyMatches={previewPropertyMatches}
                    onMatchReviewDecisionChange={updateMatchReviewDecision}
                    onQualityReviewStatusChange={updatePropertyQualityReviewStatus}
                    onQualityReviewNoteChange={updatePropertyQualityReviewNote}
                    onSaveShortlistDraft={saveShortlistDraft}
                    onSavePresentationDraft={savePresentationDraft}
                    onCopyPresentationDraft={copyPresentationDraft}
                    onCopyEmailDraftText={copyEmailDraftText}
                    onCopyEmailDraftHtml={copyEmailDraftHtml}
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

                <LeadIntelligenceJsonEditorPanel
                  value={editableJson}
                  error={jsonEditor.error}
                  copyState={copyState}
                  onCopy={copyJson}
                  onChange={(value) => {
                    setEditableJson(value);
                    clearContactCandidates();
                    setSaveResult(null);
                  }}
                />
              </div>
            )}
        </LeadIntelligenceAnalysisPreviewCard>
      </div>
    </div>
  );
}
