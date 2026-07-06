"use client";

import { Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LeadIntelligenceErrorAlert } from "@/components/lead-intelligence/lead-intelligence-error-alert";
import { LeadIntelligenceActiveProfileMatchList } from "@/components/lead-intelligence/lead-intelligence-active-profile-match-list";
import { LeadIntelligencePresentationDraftEmailPanel } from "@/components/lead-intelligence/lead-intelligence-presentation-draft-email-panel";
import { LeadIntelligencePropertyMatchAlerts } from "@/components/lead-intelligence/lead-intelligence-property-match-alerts";
import { LeadIntelligencePropertyMatchSummary } from "@/components/lead-intelligence/lead-intelligence-property-match-summary";
import { LeadIntelligenceShortlistDraftPanel } from "@/components/lead-intelligence/lead-intelligence-shortlist-draft-panel";
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

type CopyState = "idle" | "copied" | "failed";

interface LeadIntelligenceActiveProfilePropertyMatchPanelProps {
  propertyMatchResult: PropertyMatchPreviewResponse;
  selectedShortlistCount: number;
  clientReadyShortlistCount: number;
  shortlistSaveLoading: boolean;
  shortlistSaveResult: ShortlistSaveResponse | null;
  shortlistSaveError: SafeErrorResponse["error"] | null;
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
  onCopyEmailDraftText: () => void;
  onCopyEmailDraftHtml: () => void;
  onEmailSubjectChange: (value: string) => void;
  onEmailBodyChange: (value: string) => void;
}

export function LeadIntelligenceActiveProfilePropertyMatchPanel({
  propertyMatchResult,
  selectedShortlistCount,
  clientReadyShortlistCount,
  shortlistSaveLoading,
  shortlistSaveResult,
  shortlistSaveError,
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
  onCopyEmailDraftText,
  onCopyEmailDraftHtml,
  onEmailSubjectChange,
  onEmailBodyChange,
}: LeadIntelligenceActiveProfilePropertyMatchPanelProps) {
  return (
    <div className="space-y-3">
      <LeadIntelligencePropertyMatchSummary
        className="sm:grid-cols-4"
        stats={[
          { label: "Analysert", value: propertyMatchResult.result.analyzed },
          { label: "Aktuelle", value: propertyMatchResult.result.matched },
          { label: "Mangler", value: propertyMatchResult.result.missingPropertyReferences.length },
          { label: "Klar for kunde", value: clientReadyShortlistCount },
        ]}
      />

      <LeadIntelligencePropertyMatchAlerts
        variant="active-profile"
        bestEffort={propertyMatchResult.result.bestEffort}
        matched={propertyMatchResult.result.matched}
        matchCount={propertyMatchResult.result.matches.length}
      />

      <LeadIntelligenceActiveProfileMatchList
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
        description="Ingen e-post, lead eller kontakt opprettes."
        layout="md"
        onSave={onSaveShortlistDraft}
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
                  onClick={onSavePresentationDraft}
                  disabled={presentationDraftLoading}
                >
                  {presentationDraftLoading ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="mr-2 h-4 w-4" />
                  )}
                  Lagre presentasjonsutkast
                </Button>
              </div>

              {presentationDraftResult && (
                <LeadIntelligencePresentationDraftEmailPanel
                  variant="active-profile"
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
    </div>
  );
}
