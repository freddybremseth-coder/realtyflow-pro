"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { type ExtractedLead } from "@/services/lead-intelligence/contracts";
import {
  TextInput,
  flattenReviewCriteria,
  generateClientCorrelationId,
  parseJsonEditor,
  prettyJson,
} from "@/components/lead-intelligence/lead-intelligence-client-helpers";
import {
  LeadIntelligenceRequestCard,
  type LeadIntelligenceSource,
} from "@/components/lead-intelligence/lead-intelligence-request-card";
import { LeadIntelligenceErrorAlert } from "@/components/lead-intelligence/lead-intelligence-error-alert";
import {
  type CriterionReviewState,
} from "@/components/lead-intelligence/lead-intelligence-criteria-review-panel";
import {
  type LeadContactCandidatePreview,
  type LeadContactDecision,
} from "@/components/lead-intelligence/lead-intelligence-contact-candidates-panel";
import {
  LeadIntelligenceWorklistHistoryPanel,
  type LeadIntelligenceWorklistItem,
} from "@/components/lead-intelligence/lead-intelligence-worklist-history-panel";
import { LeadIntelligenceEnvironmentAlerts } from "@/components/lead-intelligence/lead-intelligence-environment-alerts";
import { LeadIntelligencePageHeader } from "@/components/lead-intelligence/lead-intelligence-page-header";
import { LeadIntelligenceAnalysisPreviewCard } from "@/components/lead-intelligence/lead-intelligence-analysis-preview-card";
import { LeadIntelligenceWorklistResultNotice } from "@/components/lead-intelligence/lead-intelligence-worklist-result-notice";
import { LeadIntelligenceWorklistCard } from "@/components/lead-intelligence/lead-intelligence-worklist-card";
import { LeadIntelligenceActiveWorklistProfilePanel } from "@/components/lead-intelligence/lead-intelligence-active-worklist-profile-panel";
import { LeadIntelligenceAnalysisResultPanel } from "@/components/lead-intelligence/lead-intelligence-analysis-result-panel";
import {
  leadIntelligenceDraftReturnUrl,
  realEstateBrands,
  sourceOptions,
} from "@/components/lead-intelligence/lead-intelligence-client-config";
import { useLeadIntelligenceShortlistDerivedState } from "@/components/lead-intelligence/use-lead-intelligence-shortlist-derived-state";
import { useLeadIntelligencePresentationDrafts } from "@/components/lead-intelligence/use-lead-intelligence-presentation-drafts";
import { useLeadIntelligenceActiveProfileActions } from "@/components/lead-intelligence/use-lead-intelligence-active-profile-actions";
import { useLeadIntelligencePropertyMatchFlow } from "@/components/lead-intelligence/use-lead-intelligence-property-match-flow";
import { useLeadIntelligenceWorklist } from "@/components/lead-intelligence/use-lead-intelligence-worklist";
import type {
  ContactCandidatesResponse,
  LeadAnalysisResponse,
  LeadIntelligenceClientProps,
  LeadIntelligenceCrmContextResponse,
  ReviewSaveResponse,
  SafeErrorResponse,
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
  const returnUrlHydratedRef = useRef(false);
  const clearPresentationDraftStateRef = useRef<() => void>(() => {});
  const [crmContextLoading, setCrmContextLoading] = useState(false);
  const [crmContextError, setCrmContextError] = useState<SafeErrorResponse["error"] | null>(null);
  const [crmContextResult, setCrmContextResult] = useState<LeadIntelligenceCrmContextResponse | null>(null);
  const [highlightedMatchId, setHighlightedMatchId] = useState<string | null>(null);
  const {
    worklistLoading,
    worklistError,
    worklistResult,
    activeWorklistItem,
    worklistHistoryExpanded,
    setActiveWorklistItem,
    setWorklistHistoryExpanded,
    clearWorklistSelection,
    resetWorklist,
    loadWorklist,
  } = useLeadIntelligenceWorklist({
    brand,
    persistenceEnabled,
  });

  const jsonEditor = useMemo(() => parseJsonEditor(editableJson), [editableJson]);
  const edited = jsonEditor.parsed || response?.result || null;
  const reviewCriteria = useMemo(() => flattenReviewCriteria(edited), [edited]);
  const reviewedCount = reviewCriteria.filter(
    (criterion) => criterionReviews[criterion.id]?.approvalStatus && criterionReviews[criterion.id].approvalStatus !== "pending",
  ).length;
  const allCriteriaReviewed = reviewCriteria.length > 0 && reviewedCount === reviewCriteria.length;
  const {
    propertyReferencesText,
    parsedPropertyReferences,
    propertyMatchLoading,
    propertyMatchError,
    propertyMatchResult,
    matchReviewDecisions,
    propertyQualityReviews,
    shortlistSaveLoading,
    shortlistSaveError,
    shortlistSaveResult,
    clearPropertyMatchPreview,
    resetPropertyMatchFlow,
    updatePropertyReferencesText,
    updatePropertyQualityReviewStatus,
    updatePropertyQualityReviewNote,
    updateMatchReviewDecision,
    loadShortlistSaveResult,
    previewPropertyMatches,
    saveShortlistDraft,
  } = useLeadIntelligencePropertyMatchFlow({
    brand,
    propertyMatchingEnabled,
    saveResult,
    onPresentationDraftInvalidated: () => clearPresentationDraftStateRef.current(),
    onHighlightedMatchCleared: () => setHighlightedMatchId(null),
  });
  const {
    selectedShortlistItems,
    clientReadyShortlistItems,
    selectedShortlistMatches,
    shortlistPresentation,
    shortlistPresentationText,
    shortlistEmailDraft,
  } = useLeadIntelligenceShortlistDerivedState({
    edited,
    propertyMatchResult,
    propertyQualityReviews,
    matchReviewDecisions,
    shortlistSaveResult,
  });
  const {
    emailDraftCopyState,
    emailDraftHtmlCopyState,
    presentationCopyState,
    presentationDraftLoading,
    presentationDraftError,
    presentationDraftResult,
    presentationDraftHistoryLoading,
    presentationDraftHistoryError,
    presentationDraftHistoryResult,
    editableEmailSubject,
    editableEmailBody,
    clearPresentationDraftState,
    updateEditableEmailSubject,
    updateEditableEmailBody,
    copyEmailDraftText,
    copyEmailDraftHtml,
    copyPresentationDraft,
    savePresentationDraft,
    loadPresentationDraftById,
    loadLatestPresentationDraft,
    loadPresentationDraftHistory,
  } = useLeadIntelligencePresentationDrafts({
    brand,
    language,
    activeWorklistItem,
    saveResult,
    shortlistSaveResult,
    shortlistPresentation,
    shortlistPresentationText,
    shortlistEmailDraft,
    onShortlistSaveResultLoaded: loadShortlistSaveResult,
  });

  useEffect(() => {
    clearPresentationDraftStateRef.current = clearPresentationDraftState;
  }, [clearPresentationDraftState]);

  const {
    profileContactCandidatesLoading,
    profileContactCandidatesError,
    profileContactCandidatesResult,
    profileSelectedContactId,
    profileContactLinkLoading,
    profileContactLinkError,
    profileContactLinkResult,
    profileContactCreateLoading,
    profileContactCreateError,
    profileContactCreateResult,
    profileArchiveLoading,
    profileArchiveError,
    profileArchiveResult,
    clearActiveProfileActions,
    selectProfileContactCandidate,
    loadSavedProfileContactCandidates,
    linkSavedProfileContact,
    createContactFromSavedProfile,
    archiveActiveProfile,
  } = useLeadIntelligenceActiveProfileActions({
    brand,
    activeWorklistItem,
    persistenceEnabled,
    connectExistingEnabled,
    createContactEnabled,
    onContactCandidatesLoaded: (result) => {
      if (!result.result.linkedContact) return;
      setActiveWorklistItem((current) =>
        current && current.buyerProfileId === result.result.buyerProfileId
          ? {
              ...current,
              contactLinked: true,
              linkedContact: result.result.linkedContact,
            }
          : current,
      );
    },
    onContactLinked: (result) => {
      setActiveWorklistItem((current) =>
        current && current.buyerProfileId === result.result.buyerProfileId
          ? {
              ...current,
              contactLinked: true,
              linkedContact: result.result.linkedContact,
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
                  selectedContactId: result.result.contactId,
                  decision: "connect_existing",
                  linkedContact: true,
                  duplicate: result.result.duplicate,
                },
              },
            }
          : current,
      );
      void loadWorklist();
    },
    onContactCreated: (result) => {
      setActiveWorklistItem((current) =>
        current && current.buyerProfileId === result.result.buyerProfileId
          ? {
              ...current,
              contactLinked: true,
              linkedContact: result.result.linkedContact,
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
                  selectedContactId: result.result.contactId,
                  decision: "create_new",
                  linkedContact: true,
                  duplicate: result.result.duplicate,
                },
              },
            }
          : current,
      );
      void loadWorklist();
    },
    onProfileArchived: () => {
      setSaveResult(null);
      clearPropertyMatchPreview();
      clearWorklistSelection();
      void loadWorklist();
    },
  });

  const clearCrmContext = () => {
    setCrmContextLoading(false);
    setCrmContextError(null);
    setCrmContextResult(null);
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
    clearWorklistSelection();
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
    clearWorklistSelection();
    resetPropertyMatchFlow();
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
    clearWorklistSelection();
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
      clearWorklistSelection();
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
  const saveSelectedShortlistDraft = () => {
    void saveShortlistDraft(selectedShortlistItems);
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <LeadIntelligencePageHeader />

      <LeadIntelligenceEnvironmentAlerts
        featureEnabled={featureEnabled}
        persistenceEnabled={persistenceEnabled}
      />

      {featureEnabled && (
        <LeadIntelligenceWorklistCard
          persistenceEnabled={persistenceEnabled}
          worklistLoading={worklistLoading}
          onLoadWorklist={loadWorklist}
        >
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
                <LeadIntelligenceActiveWorklistProfilePanel
                  activeWorklistItem={activeWorklistItem}
                  propertyMatchingEnabled={propertyMatchingEnabled}
                  persistenceEnabled={persistenceEnabled}
                  connectExistingEnabled={connectExistingEnabled}
                  createContactEnabled={createContactEnabled}
                  profileContactCandidatesResult={profileContactCandidatesResult}
                  profileSelectedContactId={profileSelectedContactId}
                  profileContactCandidatesLoading={profileContactCandidatesLoading}
                  profileContactLinkLoading={profileContactLinkLoading}
                  profileContactCreateLoading={profileContactCreateLoading}
                  profileArchiveLoading={profileArchiveLoading}
                  profileContactCandidatesError={profileContactCandidatesError}
                  profileContactLinkError={profileContactLinkError}
                  profileContactCreateError={profileContactCreateError}
                  profileArchiveError={profileArchiveError}
                  profileContactCreateResult={profileContactCreateResult}
                  profileContactLinkResult={profileContactLinkResult}
                  profileArchiveResult={profileArchiveResult}
                  presentationDraftHistoryResult={presentationDraftHistoryResult}
                  presentationDraftHistoryError={presentationDraftHistoryError}
                  presentationDraftLoading={presentationDraftLoading}
                  presentationDraftHistoryLoading={presentationDraftHistoryLoading}
                  presentationDraftResult={presentationDraftResult}
                  presentationDraftReturnUrl={presentationDraftReturnUrl}
                  presentationDraftError={presentationDraftError}
                  highlightedMatchId={highlightedMatchId}
                  editableEmailSubject={editableEmailSubject}
                  editableEmailBody={editableEmailBody}
                  emailDraftCopyState={emailDraftCopyState}
                  emailDraftHtmlCopyState={emailDraftHtmlCopyState}
                  propertyReferencesText={propertyReferencesText}
                  parsedPropertyReferences={parsedPropertyReferences}
                  propertyMatchLoading={propertyMatchLoading}
                  propertyMatchError={propertyMatchError}
                  propertyMatchResult={propertyMatchResult}
                  selectedShortlistCount={selectedShortlistItems.length}
                  clientReadyShortlistCount={clientReadyShortlistItems.length}
                  shortlistSaveLoading={shortlistSaveLoading}
                  shortlistSaveResult={shortlistSaveResult}
                  shortlistSaveError={shortlistSaveError}
                  propertyMatchReturnBaseUrl={propertyMatchReturnBaseUrl}
                  matchReviewDecisions={matchReviewDecisions}
                  propertyQualityReviews={propertyQualityReviews}
                  onLoadContactCandidates={loadSavedProfileContactCandidates}
                  onCreateContact={createContactFromSavedProfile}
                  onArchiveProfile={archiveActiveProfile}
                  onSelectContactCandidate={selectProfileContactCandidate}
                  onLinkContact={linkSavedProfileContact}
                  onLoadLatestPresentationDraft={loadLatestPresentationDraft}
                  onLoadPresentationDraftHistory={loadPresentationDraftHistory}
                  onLoadPresentationDraftById={loadPresentationDraftById}
                  onCopyEmailDraftText={copyEmailDraftText}
                  onCopyEmailDraftHtml={copyEmailDraftHtml}
                  onEmailSubjectChange={updateEditableEmailSubject}
                  onEmailBodyChange={updateEditableEmailBody}
                  onPropertyReferencesChange={updatePropertyReferencesText}
                  onPreviewPropertyMatches={previewPropertyMatches}
                  onMatchReviewDecisionChange={updateMatchReviewDecision}
                  onQualityReviewStatusChange={updatePropertyQualityReviewStatus}
                  onQualityReviewNoteChange={updatePropertyQualityReviewNote}
                  onSaveShortlistDraft={saveSelectedShortlistDraft}
                  onSavePresentationDraft={savePresentationDraft}
                />
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
        </LeadIntelligenceWorklistCard>
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
            resetWorklist();
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
            <LeadIntelligenceAnalysisResultPanel
              response={response}
              edited={edited}
              sourceLabel={sourceOptions.find((option) => option.value === source)?.label || "Ikke satt"}
              brandLabel={realEstateBrands.find((item) => item.id === brand)?.name || brand}
              language={language}
              rawText={rawText}
              reviewCriteria={reviewCriteria}
              criterionReviews={criterionReviews}
              reviewedCount={reviewedCount}
              allCriteriaReviewed={allCriteriaReviewed}
              persistenceEnabled={persistenceEnabled}
              connectExistingEnabled={connectExistingEnabled}
              candidateLoading={candidateLoading}
              crmContextLoading={crmContextLoading}
              contactCandidatesLoaded={contactCandidatesLoaded}
              contactCandidates={contactCandidates}
              contactCandidateError={contactCandidateError}
              crmContextError={crmContextError}
              crmContextResult={crmContextResult}
              contactDecision={contactDecision}
              selectedContactId={selectedContactId}
              saveLoading={saveLoading}
              hasJsonError={Boolean(jsonEditor.error)}
              saveError={saveError}
              saveResult={saveResult}
              hasActiveWorklistItem={Boolean(activeWorklistItem)}
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
              editableJson={editableJson}
              jsonEditorError={jsonEditor.error}
              jsonCopyState={copyState}
              onUpdateEdited={updateEdited}
              onReviewChange={updateCriterionReview}
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
              onSave={saveReview}
              onPropertyReferencesChange={updatePropertyReferencesText}
              onPreviewPropertyMatches={previewPropertyMatches}
              onMatchReviewDecisionChange={updateMatchReviewDecision}
              onQualityReviewStatusChange={updatePropertyQualityReviewStatus}
              onQualityReviewNoteChange={updatePropertyQualityReviewNote}
              onSaveShortlistDraft={saveSelectedShortlistDraft}
              onSavePresentationDraft={savePresentationDraft}
              onCopyPresentationDraft={copyPresentationDraft}
              onCopyEmailDraftText={copyEmailDraftText}
              onCopyEmailDraftHtml={copyEmailDraftHtml}
              onEmailSubjectChange={updateEditableEmailSubject}
              onEmailBodyChange={updateEditableEmailBody}
              onCopyJson={copyJson}
              onEditableJsonChange={(value) => {
                setEditableJson(value);
                clearContactCandidates();
                setSaveResult(null);
              }}
            />
          )}
        </LeadIntelligenceAnalysisPreviewCard>
      </div>
    </div>
  );
}
