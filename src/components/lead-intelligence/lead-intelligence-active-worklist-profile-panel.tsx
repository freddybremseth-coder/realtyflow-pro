"use client";

import { LeadIntelligenceActiveProfileHeader } from "@/components/lead-intelligence/lead-intelligence-active-profile-header";
import { LeadIntelligenceActiveProfileMatchControls } from "@/components/lead-intelligence/lead-intelligence-active-profile-match-controls";
import { LeadIntelligenceActiveProfileNextActionNotice } from "@/components/lead-intelligence/lead-intelligence-active-profile-next-action-notice";
import { LeadIntelligenceActiveProfilePropertyMatchPanel } from "@/components/lead-intelligence/lead-intelligence-active-profile-property-match-panel";
import { LeadIntelligenceErrorAlert } from "@/components/lead-intelligence/lead-intelligence-error-alert";
import { LeadIntelligenceLoadedPresentationDraftPanel } from "@/components/lead-intelligence/lead-intelligence-loaded-presentation-draft-panel";
import { LeadIntelligencePresentationHistoryPanel } from "@/components/lead-intelligence/lead-intelligence-presentation-history-panel";
import { LeadIntelligenceSavedProfileContactPanel } from "@/components/lead-intelligence/lead-intelligence-saved-profile-contact-panel";
import type {
  PresentationDraftHistoryResponse,
  PresentationDraftResponse,
  PropertyMatchPreviewResponse,
  SafeErrorResponse,
  SavedProfileArchiveResponse,
  SavedProfileContactCandidatesResponse,
  SavedProfileContactCreateResponse,
  SavedProfileContactLinkResponse,
  ShortlistSaveResponse,
} from "@/components/lead-intelligence/lead-intelligence-client-types";
import type { LeadIntelligenceWorklistItem } from "@/components/lead-intelligence/lead-intelligence-worklist-history-panel";
import type { MatchReviewDecision } from "@/components/lead-intelligence/property-match-display";
import type {
  PropertyQualityReviewState,
  PropertyQualityReviewStatus,
} from "@/components/lead-intelligence/property-quality-review-controls";

type CopyState = "idle" | "copied" | "failed";
type PropertyMatchPreviewMode = "auto" | "explicit";

interface ParsedPropertyReferences {
  references: string[];
  error: string | null;
}

interface LeadIntelligenceActiveWorklistProfilePanelProps {
  activeWorklistItem: LeadIntelligenceWorklistItem;
  propertyMatchingEnabled: boolean;
  persistenceEnabled: boolean;
  connectExistingEnabled: boolean;
  createContactEnabled: boolean;
  profileContactCandidatesResult: SavedProfileContactCandidatesResponse | null;
  profileSelectedContactId: string | null;
  profileContactCandidatesLoading: boolean;
  profileContactLinkLoading: boolean;
  profileContactCreateLoading: boolean;
  profileArchiveLoading: boolean;
  profileContactCandidatesError: SafeErrorResponse["error"] | null;
  profileContactLinkError: SafeErrorResponse["error"] | null;
  profileContactCreateError: SafeErrorResponse["error"] | null;
  profileArchiveError: SafeErrorResponse["error"] | null;
  profileContactCreateResult: SavedProfileContactCreateResponse | null;
  profileContactLinkResult: SavedProfileContactLinkResponse | null;
  profileArchiveResult: SavedProfileArchiveResponse | null;
  presentationDraftHistoryResult: PresentationDraftHistoryResponse | null;
  presentationDraftHistoryError: SafeErrorResponse["error"] | null;
  presentationDraftLoading: boolean;
  presentationDraftHistoryLoading: boolean;
  presentationDraftResult: PresentationDraftResponse | null;
  presentationDraftReturnUrl: string | null;
  presentationDraftError: SafeErrorResponse["error"] | null;
  highlightedMatchId: string | null;
  editableEmailSubject: string;
  editableEmailBody: string;
  emailDraftCopyState: CopyState;
  emailDraftHtmlCopyState: CopyState;
  propertyReferencesText: string;
  parsedPropertyReferences: ParsedPropertyReferences;
  propertyMatchLoading: boolean;
  propertyMatchError: SafeErrorResponse["error"] | null;
  propertyMatchResult: PropertyMatchPreviewResponse | null;
  selectedShortlistCount: number;
  clientReadyShortlistCount: number;
  shortlistSaveLoading: boolean;
  shortlistSaveResult: ShortlistSaveResponse | null;
  shortlistSaveError: SafeErrorResponse["error"] | null;
  propertyMatchReturnBaseUrl: string;
  matchReviewDecisions: Record<string, MatchReviewDecision>;
  propertyQualityReviews: Record<string, PropertyQualityReviewState>;
  onLoadContactCandidates: () => void;
  onCreateContact: () => void;
  onArchiveProfile: () => void;
  onSelectContactCandidate: (contactId: string) => void;
  onLinkContact: (contactId: string) => void;
  onLoadLatestPresentationDraft: () => void;
  onLoadPresentationDraftHistory: () => void;
  onLoadPresentationDraftById: (presentationId: string) => void;
  onCopyEmailDraftText: () => void;
  onCopyEmailDraftHtml: () => void;
  onEmailSubjectChange: (value: string) => void;
  onEmailBodyChange: (value: string) => void;
  onPropertyReferencesChange: (value: string) => void;
  onPreviewPropertyMatches: (mode: PropertyMatchPreviewMode) => void;
  onMatchReviewDecisionChange: (propertyId: string, decision: MatchReviewDecision) => void;
  onQualityReviewStatusChange: (propertyId: string, status: PropertyQualityReviewStatus) => void;
  onQualityReviewNoteChange: (propertyId: string, note: string) => void;
  onSaveShortlistDraft: () => void;
  onSavePresentationDraft: () => void;
}

export function LeadIntelligenceActiveWorklistProfilePanel({
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
  selectedShortlistCount,
  clientReadyShortlistCount,
  shortlistSaveLoading,
  shortlistSaveResult,
  shortlistSaveError,
  propertyMatchReturnBaseUrl,
  matchReviewDecisions,
  propertyQualityReviews,
  onLoadContactCandidates,
  onCreateContact,
  onArchiveProfile,
  onSelectContactCandidate,
  onLinkContact,
  onLoadLatestPresentationDraft,
  onLoadPresentationDraftHistory,
  onLoadPresentationDraftById,
  onCopyEmailDraftText,
  onCopyEmailDraftHtml,
  onEmailSubjectChange,
  onEmailBodyChange,
  onPropertyReferencesChange,
  onPreviewPropertyMatches,
  onMatchReviewDecisionChange,
  onQualityReviewStatusChange,
  onQualityReviewNoteChange,
  onSaveShortlistDraft,
  onSavePresentationDraft,
}: LeadIntelligenceActiveWorklistProfilePanelProps) {
  const contentGridClassName = propertyMatchResult
    ? "mt-4 grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]"
    : "mt-4 grid gap-4 lg:grid-cols-1";

  return (
    <div
      id="lead-intelligence-active-profile"
      className="rounded-lg border border-primary-400/60 bg-slate-950 p-4 shadow-lg shadow-primary-950/20"
    >
      <LeadIntelligenceActiveProfileHeader
        activeWorklistItem={activeWorklistItem}
        propertyMatchingEnabled={propertyMatchingEnabled}
      />

      <div className={contentGridClassName}>
        <div className="space-y-3">
          <LeadIntelligenceActiveProfileNextActionNotice />

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
            onLoadContactCandidates={onLoadContactCandidates}
            onCreateContact={onCreateContact}
            onArchiveProfile={onArchiveProfile}
            onSelectContactCandidate={onSelectContactCandidate}
            onLinkContact={onLinkContact}
          />

          <LeadIntelligencePresentationHistoryPanel
            latestPresentationId={activeWorklistItem.latestPresentationId}
            latestMessageDraftId={activeWorklistItem.latestMessageDraftId}
            history={presentationDraftHistoryResult?.result ?? null}
            historyError={presentationDraftHistoryError}
            showHistoryError={!propertyMatchResult}
            presentationDraftLoading={presentationDraftLoading}
            presentationDraftHistoryLoading={presentationDraftHistoryLoading}
            onLoadLatestPresentationDraft={onLoadLatestPresentationDraft}
            onLoadPresentationDraftHistory={onLoadPresentationDraftHistory}
            onLoadPresentationDraftById={onLoadPresentationDraftById}
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
              onCopyEmailText={onCopyEmailDraftText}
              onCopyEmailHtml={onCopyEmailDraftHtml}
              onEmailSubjectChange={onEmailSubjectChange}
              onEmailBodyChange={onEmailBodyChange}
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
            onPropertyReferencesChange={onPropertyReferencesChange}
            onPreviewPropertyMatches={onPreviewPropertyMatches}
          />
        </div>

        {propertyMatchResult && (
          <LeadIntelligenceActiveProfilePropertyMatchPanel
            propertyMatchResult={propertyMatchResult}
            selectedShortlistCount={selectedShortlistCount}
            clientReadyShortlistCount={clientReadyShortlistCount}
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
            onMatchReviewDecisionChange={onMatchReviewDecisionChange}
            onQualityReviewStatusChange={onQualityReviewStatusChange}
            onQualityReviewNoteChange={onQualityReviewNoteChange}
            onSaveShortlistDraft={onSaveShortlistDraft}
            onSavePresentationDraft={onSavePresentationDraft}
            onCopyEmailDraftText={onCopyEmailDraftText}
            onCopyEmailDraftHtml={onCopyEmailDraftHtml}
            onEmailSubjectChange={onEmailSubjectChange}
            onEmailBodyChange={onEmailBodyChange}
          />
        )}
      </div>
    </div>
  );
}
