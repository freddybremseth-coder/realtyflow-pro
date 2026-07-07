"use client";

import { Badge } from "@/components/ui/badge";
import { LeadIntelligenceActiveProfileMatchControls } from "@/components/lead-intelligence/lead-intelligence-active-profile-match-controls";
import { LeadIntelligenceAnalysisPropertyMatchPanel } from "@/components/lead-intelligence/lead-intelligence-analysis-property-match-panel";
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

interface ParsedPropertyReferences {
  references: string[];
  error: string | null;
}

interface LeadIntelligenceAnalysisPropertyMatchPreviewCardProps {
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
  onPropertyReferencesChange: (value: string) => void;
  onPreviewPropertyMatches: (mode: "auto" | "explicit") => void;
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

export function LeadIntelligenceAnalysisPropertyMatchPreviewCard({
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
}: LeadIntelligenceAnalysisPropertyMatchPreviewCardProps) {
  return (
    <div className="rounded-lg border border-slate-700/60 bg-slate-950 p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 id="lead-intelligence-property-match" className="text-sm font-semibold text-slate-200">
            Eiendomsmatch-preview
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            La systemet søke i eksisterende eiendommer, eller lim inn eksplisitte referanser som
            N8513 for en kontrollert test. Matchpreviewen lagres ikke; shortlist-utkast lagres
            bare etter eksplisitt valg.
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
        onPropertyReferencesChange={onPropertyReferencesChange}
        onPreviewPropertyMatches={onPreviewPropertyMatches}
      />

      {propertyMatchResult && (
        <LeadIntelligenceAnalysisPropertyMatchPanel
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
    </div>
  );
}
