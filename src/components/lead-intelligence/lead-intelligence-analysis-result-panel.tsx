"use client";

import type { ExtractedLead } from "@/services/lead-intelligence/contracts";
import { LeadIntelligenceAnalysisOverview } from "@/components/lead-intelligence/lead-intelligence-analysis-overview";
import { LeadIntelligenceAnalysisPropertyMatchPreviewCard } from "@/components/lead-intelligence/lead-intelligence-analysis-property-match-preview-card";
import {
  LeadIntelligenceContactCandidatesPanel,
  type LeadContactCandidatePreview,
  type LeadContactDecision,
} from "@/components/lead-intelligence/lead-intelligence-contact-candidates-panel";
import {
  LeadIntelligenceCriteriaReviewPanel,
  type CriterionReviewState,
} from "@/components/lead-intelligence/lead-intelligence-criteria-review-panel";
import { LeadIntelligenceJsonEditorPanel } from "@/components/lead-intelligence/lead-intelligence-json-editor-panel";
import { LeadIntelligenceReviewSavePanel } from "@/components/lead-intelligence/lead-intelligence-review-save-panel";
import type { ReviewCriterionRow } from "@/components/lead-intelligence/lead-intelligence-client-helpers";
import type {
  LeadAnalysisResponse,
  LeadIntelligenceCrmContextResponse,
  PresentationDraftResponse,
  PropertyMatchPreviewResponse,
  ReviewSaveResponse,
  SafeErrorResponse,
  ShortlistSaveResponse,
} from "@/components/lead-intelligence/lead-intelligence-client-types";
import type { MatchReviewDecision } from "@/components/lead-intelligence/property-match-display";
import type {
  PropertyQualityReviewState,
  PropertyQualityReviewStatus,
} from "@/components/lead-intelligence/property-quality-review-controls";
import type { SelectedShortlistMatch } from "@/components/lead-intelligence/shortlist-presentation-drafts";

type CopyState = "idle" | "copied" | "failed";
type PropertyMatchPreviewMode = "auto" | "explicit";

interface ParsedPropertyReferences {
  references: string[];
  error: string | null;
}

interface ShortlistPresentationPreview {
  title: string;
  subtitle: string;
  needBullets: string[];
  verificationBullets: string[];
}

interface ShortlistEmailDraftPreview {
  subject: string;
  body: string;
}

interface LeadIntelligenceAnalysisResultPanelProps {
  response: LeadAnalysisResponse;
  edited: ExtractedLead;
  sourceLabel: string;
  brandLabel: string;
  language: string;
  rawText: string;
  reviewCriteria: ReviewCriterionRow[];
  criterionReviews: Record<string, CriterionReviewState>;
  reviewedCount: number;
  allCriteriaReviewed: boolean;
  persistenceEnabled: boolean;
  connectExistingEnabled: boolean;
  candidateLoading: boolean;
  crmContextLoading: boolean;
  contactCandidatesLoaded: boolean;
  contactCandidates: LeadContactCandidatePreview[];
  contactCandidateError: SafeErrorResponse["error"] | null;
  crmContextError: SafeErrorResponse["error"] | null;
  crmContextResult: LeadIntelligenceCrmContextResponse | null;
  contactDecision: LeadContactDecision;
  selectedContactId: string | null;
  saveLoading: boolean;
  hasJsonError: boolean;
  saveError: SafeErrorResponse["error"] | null;
  saveResult: ReviewSaveResponse | null;
  hasActiveWorklistItem: boolean;
  propertyMatchingEnabled: boolean;
  propertyReferencesText: string;
  parsedPropertyReferences: ParsedPropertyReferences;
  propertyMatchLoading: boolean;
  propertyMatchError: SafeErrorResponse["error"] | null;
  propertyMatchResult: PropertyMatchPreviewResponse | null;
  selectedShortlistCount: number;
  clientReadyShortlistCount: number;
  selectedShortlistMatches: SelectedShortlistMatch[];
  shortlistSaveLoading: boolean;
  shortlistSaveResult: ShortlistSaveResponse | null;
  shortlistSaveError: SafeErrorResponse["error"] | null;
  shortlistPresentation: ShortlistPresentationPreview | null;
  shortlistEmailDraft: ShortlistEmailDraftPreview | null;
  presentationCopyState: CopyState;
  presentationDraftLoading: boolean;
  presentationDraftResult: PresentationDraftResponse | null;
  presentationDraftReturnUrl: string | null;
  presentationDraftError: SafeErrorResponse["error"] | null;
  highlightedMatchId: string | null;
  propertyMatchReturnBaseUrl: string;
  matchReviewDecisions: Record<string, MatchReviewDecision>;
  propertyQualityReviews: Record<string, PropertyQualityReviewState>;
  editableEmailSubject: string;
  editableEmailBody: string;
  emailDraftCopyState: CopyState;
  emailDraftHtmlCopyState: CopyState;
  editableJson: string;
  jsonEditorError: string | null;
  jsonCopyState: CopyState;
  onUpdateEdited: (updater: (current: ExtractedLead) => ExtractedLead) => void;
  onReviewChange: (id: string, patch: Partial<CriterionReviewState>) => void;
  onLoadContactCandidates: () => void;
  onLoadCrmContext: () => void;
  onSelectExistingContact: (contactId: string) => void;
  onContactDecisionChange: (decision: Exclude<LeadContactDecision, "connect_existing">) => void;
  onSave: () => void;
  onPropertyReferencesChange: (value: string) => void;
  onPreviewPropertyMatches: (mode: PropertyMatchPreviewMode) => void;
  onMatchReviewDecisionChange: (propertyId: string, decision: MatchReviewDecision) => void;
  onQualityReviewStatusChange: (propertyId: string, status: PropertyQualityReviewStatus) => void;
  onQualityReviewNoteChange: (propertyId: string, note: string) => void;
  onSaveShortlistDraft: () => void;
  onSavePresentationDraft: () => void;
  onCopyPresentationDraft: () => void;
  onCopyEmailDraftText: () => void;
  onCopyEmailDraftHtml: () => void;
  onEmailSubjectChange: (value: string) => void;
  onEmailBodyChange: (value: string) => void;
  onCopyJson: () => void;
  onEditableJsonChange: (value: string) => void;
}

export function LeadIntelligenceAnalysisResultPanel({
  response,
  edited,
  sourceLabel,
  brandLabel,
  language,
  rawText,
  reviewCriteria,
  criterionReviews,
  reviewedCount,
  allCriteriaReviewed,
  persistenceEnabled,
  connectExistingEnabled,
  candidateLoading,
  crmContextLoading,
  contactCandidatesLoaded,
  contactCandidates,
  contactCandidateError,
  crmContextError,
  crmContextResult,
  contactDecision,
  selectedContactId,
  saveLoading,
  hasJsonError,
  saveError,
  saveResult,
  hasActiveWorklistItem,
  propertyMatchingEnabled,
  propertyReferencesText,
  parsedPropertyReferences,
  propertyMatchLoading,
  propertyMatchError,
  propertyMatchResult,
  selectedShortlistCount,
  clientReadyShortlistCount,
  selectedShortlistMatches,
  shortlistSaveLoading,
  shortlistSaveResult,
  shortlistSaveError,
  shortlistPresentation,
  shortlistEmailDraft,
  presentationCopyState,
  presentationDraftLoading,
  presentationDraftResult,
  presentationDraftReturnUrl,
  presentationDraftError,
  highlightedMatchId,
  propertyMatchReturnBaseUrl,
  matchReviewDecisions,
  propertyQualityReviews,
  editableEmailSubject,
  editableEmailBody,
  emailDraftCopyState,
  emailDraftHtmlCopyState,
  editableJson,
  jsonEditorError,
  jsonCopyState,
  onUpdateEdited,
  onReviewChange,
  onLoadContactCandidates,
  onLoadCrmContext,
  onSelectExistingContact,
  onContactDecisionChange,
  onSave,
  onPropertyReferencesChange,
  onPreviewPropertyMatches,
  onMatchReviewDecisionChange,
  onQualityReviewStatusChange,
  onQualityReviewNoteChange,
  onSaveShortlistDraft,
  onSavePresentationDraft,
  onCopyPresentationDraft,
  onCopyEmailDraftText,
  onCopyEmailDraftHtml,
  onEmailSubjectChange,
  onEmailBodyChange,
  onCopyJson,
  onEditableJsonChange,
}: LeadIntelligenceAnalysisResultPanelProps) {
  return (
    <div className="space-y-5">
      <LeadIntelligenceAnalysisOverview
        response={response}
        edited={edited}
        sourceLabel={sourceLabel}
        brandLabel={brandLabel}
        language={language}
        rawText={rawText}
        onUpdateEdited={onUpdateEdited}
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <LeadIntelligenceCriteriaReviewPanel
          criteria={reviewCriteria}
          reviews={criterionReviews}
          reviewedCount={reviewedCount}
          allCriteriaReviewed={allCriteriaReviewed}
          onReviewChange={onReviewChange}
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
          onLoadContactCandidates={onLoadContactCandidates}
          onLoadCrmContext={onLoadCrmContext}
          onSelectExistingContact={onSelectExistingContact}
          onContactDecisionChange={onContactDecisionChange}
        />
      </div>

      <LeadIntelligenceReviewSavePanel
        saveLoading={saveLoading}
        persistenceEnabled={persistenceEnabled}
        hasJsonError={hasJsonError}
        allCriteriaReviewed={allCriteriaReviewed}
        contactDecision={contactDecision}
        selectedContactId={selectedContactId}
        saveError={saveError}
        saveResult={saveResult?.result ?? null}
        hasActiveWorklistItem={hasActiveWorklistItem}
        onSave={onSave}
      />

      {saveResult && (
        <LeadIntelligenceAnalysisPropertyMatchPreviewCard
          propertyMatchingEnabled={propertyMatchingEnabled}
          propertyReferencesText={propertyReferencesText}
          parsedPropertyReferences={parsedPropertyReferences}
          propertyMatchLoading={propertyMatchLoading}
          propertyMatchError={propertyMatchError}
          propertyMatchResult={propertyMatchResult}
          selectedShortlistCount={selectedShortlistCount}
          clientReadyShortlistCount={clientReadyShortlistCount}
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
          onPropertyReferencesChange={onPropertyReferencesChange}
          onPreviewPropertyMatches={onPreviewPropertyMatches}
          onMatchReviewDecisionChange={onMatchReviewDecisionChange}
          onQualityReviewStatusChange={onQualityReviewStatusChange}
          onQualityReviewNoteChange={onQualityReviewNoteChange}
          onSaveShortlistDraft={onSaveShortlistDraft}
          onSavePresentationDraft={onSavePresentationDraft}
          onCopyPresentationDraft={onCopyPresentationDraft}
          onCopyEmailDraftText={onCopyEmailDraftText}
          onCopyEmailDraftHtml={onCopyEmailDraftHtml}
          onEmailSubjectChange={onEmailSubjectChange}
          onEmailBodyChange={onEmailBodyChange}
        />
      )}

      <LeadIntelligenceJsonEditorPanel
        value={editableJson}
        error={jsonEditorError}
        copyState={jsonCopyState}
        onCopy={onCopyJson}
        onChange={onEditableJsonChange}
      />
    </div>
  );
}
