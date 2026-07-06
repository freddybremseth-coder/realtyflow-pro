"use client";

import { LeadIntelligenceErrorAlert } from "@/components/lead-intelligence/lead-intelligence-error-alert";
import { LeadIntelligenceAnalysisMatchList } from "@/components/lead-intelligence/lead-intelligence-analysis-match-list";
import { LeadIntelligencePresentationDraftEmailPanel } from "@/components/lead-intelligence/lead-intelligence-presentation-draft-email-panel";
import { LeadIntelligencePropertyMatchAlerts } from "@/components/lead-intelligence/lead-intelligence-property-match-alerts";
import { LeadIntelligencePropertyMatchDiagnostics } from "@/components/lead-intelligence/lead-intelligence-property-match-diagnostics";
import { LeadIntelligencePropertyMatchSummary } from "@/components/lead-intelligence/lead-intelligence-property-match-summary";
import { LeadIntelligenceShortlistDraftPanel } from "@/components/lead-intelligence/lead-intelligence-shortlist-draft-panel";
import { LeadIntelligenceShortlistEmailDraftPanel } from "@/components/lead-intelligence/lead-intelligence-shortlist-email-draft-panel";
import { LeadIntelligenceShortlistPresentationPreviewPanel } from "@/components/lead-intelligence/lead-intelligence-shortlist-presentation-preview-panel";
import { LeadIntelligenceShortlistPropertyCards } from "@/components/lead-intelligence/lead-intelligence-shortlist-property-cards";
import { LeadIntelligenceShortlistSaveNotice } from "@/components/lead-intelligence/lead-intelligence-shortlist-save-notice";
import type {
  PresentationDraftResponse,
  PropertyMatchPreviewResponse,
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

interface LeadIntelligenceAnalysisPropertyMatchPanelProps {
  propertyMatchResult: PropertyMatchPreviewResponse;
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
}

export function LeadIntelligenceAnalysisPropertyMatchPanel({
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
}: LeadIntelligenceAnalysisPropertyMatchPanelProps) {
  return (
    <div className="mt-4 space-y-3">
      <p className="rounded-lg border border-slate-800 bg-slate-900/60 p-3 text-xs text-slate-400">
        Modus:{" "}
        {propertyMatchResult.result.discoveryMode === "auto"
          ? "Automatisk søk i eksisterende eiendommer"
          : "Valgte referanser"}
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

      <LeadIntelligenceAnalysisMatchList
        matches={propertyMatchResult.result.matches}
        matchReviewDecisions={matchReviewDecisions}
        highlightedMatchId={highlightedMatchId}
        returnBaseUrl={propertyMatchReturnBaseUrl}
        qualityReviews={propertyQualityReviews}
        onMatchReviewDecisionChange={onMatchReviewDecisionChange}
        onQualityReviewStatusChange={onQualityReviewStatusChange}
        onQualityReviewNoteChange={onQualityReviewNoteChange}
      />

      <LeadIntelligenceShortlistDraftPanel
        selectedCount={selectedShortlistCount}
        clientReadyCount={clientReadyShortlistCount}
        loading={shortlistSaveLoading}
        description={
          "Utkastet lagrer bare Freddys kvalitetssjekk. " +
          "Det oppretter ikke presentasjon, e-post, lead eller kontakt."
        }
        onSave={onSaveShortlistDraft}
      >
        {shortlistSaveResult && (
          <LeadIntelligenceShortlistSaveNotice
            result={shortlistSaveResult.result}
            summary="duplicate-aware"
          />
        )}

        {shortlistPresentation && shortlistEmailDraft && (
          <div className="mt-3 space-y-4 rounded-lg border border-primary-500/30 bg-slate-950/70 p-4">
            <LeadIntelligenceShortlistPresentationPreviewPanel
              title={shortlistPresentation.title}
              subtitle={shortlistPresentation.subtitle}
              needBullets={shortlistPresentation.needBullets}
              verificationBullets={shortlistPresentation.verificationBullets}
              copyState={presentationCopyState}
              loading={presentationDraftLoading}
              onSave={onSavePresentationDraft}
              onCopyPresentation={onCopyPresentationDraft}
              onCopyEmailDraft={onCopyEmailDraftText}
            />

            {presentationDraftResult && (
              <LeadIntelligencePresentationDraftEmailPanel
                variant="analysis-preview"
                draft={presentationDraftResult.result}
                returnTo={presentationDraftReturnUrl}
                anchorCards={false}
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

            {presentationDraftError && <LeadIntelligenceErrorAlert error={presentationDraftError} />}

            <LeadIntelligenceShortlistPropertyCards
              matches={selectedShortlistMatches}
              returnBaseUrl={propertyMatchReturnBaseUrl}
            />

            <LeadIntelligenceShortlistEmailDraftPanel
              subject={shortlistEmailDraft.subject}
              body={shortlistEmailDraft.body}
              copyState={emailDraftCopyState}
              onCopy={onCopyEmailDraftText}
            />
          </div>
        )}

        {shortlistSaveError && (
          <LeadIntelligenceErrorAlert error={shortlistSaveError} className="mt-3" />
        )}
      </LeadIntelligenceShortlistDraftPanel>

      <LeadIntelligencePropertyMatchDiagnostics
        missingPropertyReferences={propertyMatchResult.result.missingPropertyReferences}
        skippedProperties={propertyMatchResult.result.skippedProperties}
      />

      <p className="text-xs text-slate-500">
        E-post sendt: nei · Leads opprettet: nei · Kontakter opprettet: nei · Matcher lagret:
        nei · Correlation ID: {propertyMatchResult.correlationId}
      </p>
    </div>
  );
}
