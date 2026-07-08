"use client";

import { useEffect, useRef } from "react";
import {
  LeadIntelligenceRequestCard,
} from "@/components/lead-intelligence/lead-intelligence-request-card";
import { LeadIntelligenceErrorAlert } from "@/components/lead-intelligence/lead-intelligence-error-alert";
import {
  LeadIntelligenceWorklistHistoryPanel,
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
import { useLeadIntelligencePropertyMatchFlow } from "@/components/lead-intelligence/use-lead-intelligence-property-match-flow";
import { useLeadIntelligenceWorklist } from "@/components/lead-intelligence/use-lead-intelligence-worklist";
import { useLeadIntelligenceContactFlow } from "@/components/lead-intelligence/use-lead-intelligence-contact-flow";
import { useLeadIntelligenceReviewEditor } from "@/components/lead-intelligence/use-lead-intelligence-review-editor";
import { useLeadIntelligenceReviewSave } from "@/components/lead-intelligence/use-lead-intelligence-review-save";
import { useLeadIntelligenceAnalysisFlow } from "@/components/lead-intelligence/use-lead-intelligence-analysis-flow";
import { useLeadIntelligenceWorklistNavigation } from "@/components/lead-intelligence/use-lead-intelligence-worklist-navigation";
import { useLeadIntelligenceActiveProfileFlow } from "@/components/lead-intelligence/use-lead-intelligence-active-profile-flow";
import { useLeadIntelligencePropertyMatchHighlight } from "@/components/lead-intelligence/use-lead-intelligence-property-match-highlight";
import type { LeadIntelligenceClientProps } from "@/components/lead-intelligence/lead-intelligence-client-types";

export function LeadIntelligenceClient({
  featureEnabled,
  persistenceEnabled,
  connectExistingEnabled,
  createContactEnabled,
  propertyMatchingEnabled,
}: LeadIntelligenceClientProps) {
  const clearPresentationDraftStateRef = useRef<() => void>(() => {});
  const clearHighlightedMatchRef = useRef<() => void>(() => {});
  const {
    source,
    brand,
    language,
    rawText,
    loading,
    response,
    error,
    changeSource,
    changeBrand,
    changeLanguage,
    changeRawText,
    clearAnalysisResult,
    analyze,
    reset,
  } = useLeadIntelligenceAnalysisFlow({
    defaultBrand: realEstateBrands[0]?.id || "soleada",
    onAnalysisLoaded: (result) => {
      loadAnalysisResult(result);
    },
    onAnalysisInvalidated: () => {
      clearContactCandidates();
    },
    onAnalysisReset: () => {
      clearReviewEditor();
      clearContactCandidatesState();
      clearSaveFeedback();
      clearWorklistSelection();
      resetPropertyMatchFlow();
    },
    onBrandChanged: () => {
      resetWorklist();
    },
  });
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
      clearSaveError();
      clearSaveResult();
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
      clearSaveResult();
    },
    onReviewSelectionChanged: () => {
      clearSaveError();
      clearSaveResult();
    },
  });
  const {
    saveLoading,
    saveError,
    saveResult,
    setSaveResult,
    clearSaveError,
    clearSaveResult,
    clearSaveFeedback,
    saveReview,
  } = useLeadIntelligenceReviewSave({
    brand,
    source,
    rawText,
    language,
    response,
    edited,
    persistenceEnabled,
    allCriteriaReviewed,
    hasJsonError: Boolean(jsonEditor.error),
    contactDecision,
    selectedContactId,
    reviewCriteria,
    criterionReviews,
    onReviewSaved: () => {
      clearWorklistSelection();
      clearPropertyMatchPreview();
      void loadWorklist();
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
    onHighlightedMatchCleared: () => clearHighlightedMatchRef.current(),
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
  } = useLeadIntelligenceActiveProfileFlow({
    brand,
    activeWorklistItem,
    persistenceEnabled,
    connectExistingEnabled,
    createContactEnabled,
    setActiveWorklistItem,
    setSaveResult,
    clearPropertyMatchPreview,
    clearWorklistSelection,
    loadWorklist,
  });
  const { highlightedMatchId, clearHighlightedMatch } = useLeadIntelligencePropertyMatchHighlight({
    activeWorklistItem,
    propertyMatchResult,
    presentationDraftResult,
  });

  const clearContactCandidates = () => {
    clearContactCandidatesState();
    clearSaveFeedback();
    clearWorklistSelection();
    clearActiveProfileActions();
    clearPropertyMatchPreview();
  };

  const { continueFromWorklistItem, scrollToActiveProfile } = useLeadIntelligenceWorklistNavigation({
    worklistResult,
    clearContactCandidates,
    clearActiveProfileActions,
    clearAnalysisResult,
    clearReviewEditor,
    setActiveWorklistItem,
    setWorklistHistoryExpanded,
    clearSaveError,
    setSaveResult,
    loadPresentationDraftById,
  });

  useEffect(() => {
    if (!featureEnabled || !persistenceEnabled) return;
    void loadWorklist();
    // Auto-refresh when the user changes brand; loadWorklist is intentionally not a dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [featureEnabled, persistenceEnabled, brand]);

  useEffect(() => {
    clearHighlightedMatchRef.current = clearHighlightedMatch;
  }, [clearHighlightedMatch]);

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
                onScrollToActiveProfile={scrollToActiveProfile}
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
          onSourceChange={changeSource}
          onBrandChange={changeBrand}
          onLanguageChange={changeLanguage}
          onRawTextChange={changeRawText}
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
