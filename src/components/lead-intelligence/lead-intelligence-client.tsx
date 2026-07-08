"use client";

import { useEffect, useRef, useState } from "react";
import {
  generateClientCorrelationId,
} from "@/components/lead-intelligence/lead-intelligence-client-helpers";
import {
  LeadIntelligenceRequestCard,
  type LeadIntelligenceSource,
} from "@/components/lead-intelligence/lead-intelligence-request-card";
import { LeadIntelligenceErrorAlert } from "@/components/lead-intelligence/lead-intelligence-error-alert";
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
import { useLeadIntelligenceContactFlow } from "@/components/lead-intelligence/use-lead-intelligence-contact-flow";
import { useLeadIntelligenceReviewEditor } from "@/components/lead-intelligence/use-lead-intelligence-review-editor";
import type {
  LeadAnalysisResponse,
  LeadIntelligenceClientProps,
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
  const [saveLoading, setSaveLoading] = useState(false);
  const [saveError, setSaveError] = useState<SafeErrorResponse["error"] | null>(null);
  const [saveResult, setSaveResult] = useState<ReviewSaveResponse | null>(null);
  const returnUrlHydratedRef = useRef(false);
  const clearPresentationDraftStateRef = useRef<() => void>(() => {});
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

  const {
    editableJson,
    copyState,
    criterionReviews,
    jsonEditor,
    edited,
    reviewCriteria,
    reviewedCount,
    allCriteriaReviewed,
    loadAnalysisResult,
    clearReviewEditor,
    updateEditableJson,
    updateEdited,
    updateCriterionReview,
    copyJson,
  } = useLeadIntelligenceReviewEditor({
    response,
    onEditedChanged: () => {
      clearContactCandidates();
    },
    onCriterionReviewChanged: () => {
      setSaveError(null);
      setSaveResult(null);
      clearWorklistSelection();
      clearPropertyMatchPreview();
    },
  });
  const {
    candidateLoading,
    contactCandidatesLoaded,
    contactCandidates,
    contactCandidateError,
    contactDecision,
    selectedContactId,
    crmContextLoading,
    crmContextError,
    crmContextResult,
    clearContactCandidatesState,
    selectExistingContact,
    changeContactDecision,
    loadContactCandidates,
    loadCrmContext,
  } = useLeadIntelligenceContactFlow({
    brand,
    edited,
    persistenceEnabled,
    onReviewResultInvalidated: () => {
      setSaveResult(null);
    },
    onReviewSelectionChanged: () => {
      setSaveError(null);
      setSaveResult(null);
    },
  });
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

  const clearContactCandidates = () => {
    clearContactCandidatesState();
    setSaveError(null);
    setSaveResult(null);
    clearWorklistSelection();
    clearActiveProfileActions();
    clearPropertyMatchPreview();
  };

  const analyze = async () => {
    setLoading(true);
    setError(null);

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
      loadAnalysisResult(body.result);
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
    clearReviewEditor();
    clearContactCandidatesState();
    setSaveError(null);
    setSaveResult(null);
    clearWorklistSelection();
    resetPropertyMatchFlow();
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
    clearReviewEditor();
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
              onSelectExistingContact={selectExistingContact}
              onContactDecisionChange={changeContactDecision}
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
              onEditableJsonChange={updateEditableJson}
            />
          )}
        </LeadIntelligenceAnalysisPreviewCard>
      </div>
    </div>
  );
}
