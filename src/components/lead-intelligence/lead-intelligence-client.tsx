"use client";

import { useEffect, useRef } from "react";
import {
  LeadIntelligenceRequestCard,
} from "@/components/lead-intelligence/lead-intelligence-request-card";
import { LeadIntelligenceEnvironmentAlerts } from "@/components/lead-intelligence/lead-intelligence-environment-alerts";
import { LeadIntelligencePageHeader } from "@/components/lead-intelligence/lead-intelligence-page-header";
import { LeadIntelligenceAnalysisPreviewCard } from "@/components/lead-intelligence/lead-intelligence-analysis-preview-card";
import { LeadIntelligenceWorklistSection } from "@/components/lead-intelligence/lead-intelligence-worklist-section";
import { LeadIntelligenceAnalysisResultPanel } from "@/components/lead-intelligence/lead-intelligence-analysis-result-panel";
import {
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
import { useLeadIntelligencePresentationActions } from "@/components/lead-intelligence/use-lead-intelligence-presentation-actions";
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
    featureEnabled,
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
    clearHighlightedMatchRef.current = clearHighlightedMatch;
  }, [clearHighlightedMatch]);

  const {
    presentationDraftReturnUrl,
    propertyMatchReturnBaseUrl,
    saveSelectedShortlistDraft,
  } = useLeadIntelligencePresentationActions({
    activeWorklistItem,
    saveResult,
    presentationDraftResult,
    selectedShortlistItems,
    saveShortlistDraft,
  });

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <LeadIntelligencePageHeader />

      <LeadIntelligenceEnvironmentAlerts
        featureEnabled={featureEnabled}
        persistenceEnabled={persistenceEnabled}
      />

      <LeadIntelligenceWorklistSection
        featureEnabled={featureEnabled}
        persistenceEnabled={persistenceEnabled}
        worklistLoading={worklistLoading}
        worklistError={worklistError}
        worklistResult={worklistResult}
        archivedBuyerProfileId={profileArchiveResult?.result.buyerProfileId ?? null}
        hasActiveWorklistItem={Boolean(activeWorklistItem)}
        onLoadWorklist={loadWorklist}
        activeProfilePanelProps={
          activeWorklistItem && saveResult
            ? {
                activeWorklistItem,
                propertyMatchingEnabled,
                persistenceEnabled,
                connectExistingEnabled,
                createContactEnabled,
                profileContactCandidatesResult,
                profileSelectedContactId,
                profileContactCandidatesLoading,
                profileContactLinkLoading,
                profileContactCreateLoading,
                profileArchiveLoading,
                profileContactCandidatesError,
                profileContactLinkError,
                profileContactCreateError,
                profileArchiveError,
                profileContactCreateResult,
                profileContactLinkResult,
                profileArchiveResult,
                presentationDraftHistoryResult,
                presentationDraftHistoryError,
                presentationDraftLoading,
                presentationDraftHistoryLoading,
                presentationDraftResult,
                presentationDraftReturnUrl,
                presentationDraftError,
                highlightedMatchId,
                editableEmailSubject,
                editableEmailBody,
                emailDraftCopyState,
                emailDraftHtmlCopyState,
                propertyReferencesText,
                parsedPropertyReferences,
                propertyMatchLoading,
                propertyMatchError,
                propertyMatchResult,
                selectedShortlistCount: selectedShortlistItems.length,
                clientReadyShortlistCount: clientReadyShortlistItems.length,
                shortlistSaveLoading,
                shortlistSaveResult,
                shortlistSaveError,
                propertyMatchReturnBaseUrl,
                matchReviewDecisions,
                propertyQualityReviews,
                onLoadContactCandidates: loadSavedProfileContactCandidates,
                onCreateContact: createContactFromSavedProfile,
                onArchiveProfile: archiveActiveProfile,
                onSelectContactCandidate: selectProfileContactCandidate,
                onLinkContact: linkSavedProfileContact,
                onLoadLatestPresentationDraft: loadLatestPresentationDraft,
                onLoadPresentationDraftHistory: loadPresentationDraftHistory,
                onLoadPresentationDraftById: loadPresentationDraftById,
                onCopyEmailDraftText: copyEmailDraftText,
                onCopyEmailDraftHtml: copyEmailDraftHtml,
                onEmailSubjectChange: updateEditableEmailSubject,
                onEmailBodyChange: updateEditableEmailBody,
                onPropertyReferencesChange: updatePropertyReferencesText,
                onPreviewPropertyMatches: previewPropertyMatches,
                onMatchReviewDecisionChange: updateMatchReviewDecision,
                onQualityReviewStatusChange: updatePropertyQualityReviewStatus,
                onQualityReviewNoteChange: updatePropertyQualityReviewNote,
                onSaveShortlistDraft: saveSelectedShortlistDraft,
                onSavePresentationDraft: savePresentationDraft,
              }
            : null
        }
        historyPanelProps={
          worklistResult
            ? {
                items: worklistResult.result.items,
                activeBuyerProfileId: activeWorklistItem?.buyerProfileId ?? null,
                expanded: worklistHistoryExpanded,
                sourceOptions,
                onToggleExpanded: () => setWorklistHistoryExpanded((current) => !current),
                onScrollToActiveProfile: scrollToActiveProfile,
                onContinueFromItem: continueFromWorklistItem,
              }
            : null
        }
      />

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
