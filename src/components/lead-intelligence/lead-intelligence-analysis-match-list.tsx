"use client";

import {
  MatchList,
  MatchReviewDecisionBadge,
  PropertyEligibilityBadge,
  PropertyMatchThumbnail,
  propertyFactsLine,
  shortPropertyId,
  type LeadIntelligencePropertyMatch,
  type MatchReviewDecision,
} from "@/components/lead-intelligence/property-match-display";
import {
  PropertyNavigationLinks,
  leadIntelligenceMatchAnchor,
  leadIntelligenceMatchReturnUrl,
} from "@/components/lead-intelligence/presentation-preview-panel";
import {
  PropertyQualityReviewControls,
  defaultPropertyQualityReview,
  type PropertyQualityReviewState,
  type PropertyQualityReviewStatus,
} from "@/components/lead-intelligence/property-quality-review-controls";
import { LeadIntelligenceMatchReviewSelect } from "@/components/lead-intelligence/lead-intelligence-match-review-select";
import { humanizedMatchReasonItems } from "@/components/lead-intelligence/shortlist-presentation-drafts";

interface LeadIntelligenceAnalysisMatchListProps {
  matches: LeadIntelligencePropertyMatch[];
  matchReviewDecisions: Record<string, MatchReviewDecision>;
  highlightedMatchId: string | null;
  returnBaseUrl: string;
  qualityReviews: Record<string, PropertyQualityReviewState>;
  onMatchReviewDecisionChange: (propertyId: string, decision: MatchReviewDecision) => void;
  onQualityReviewStatusChange: (propertyId: string, status: PropertyQualityReviewStatus) => void;
  onQualityReviewNoteChange: (propertyId: string, note: string) => void;
}

export function LeadIntelligenceAnalysisMatchList({
  matches,
  matchReviewDecisions,
  highlightedMatchId,
  returnBaseUrl,
  qualityReviews,
  onMatchReviewDecisionChange,
  onQualityReviewStatusChange,
  onQualityReviewNoteChange,
}: LeadIntelligenceAnalysisMatchListProps) {
  return (
    <div className="space-y-3">
      {matches.map((match) => {
        const reviewDecision = matchReviewDecisions[match.propertyId] || "system";
        const manualDecisionOverridesRejected =
          match.eligibility === "rejected" &&
          (reviewDecision === "current" || reviewDecision === "maybe");
        const isHighlightedMatch = highlightedMatchId === match.propertyId;

        return (
          <div
            key={match.propertyId}
            id={leadIntelligenceMatchAnchor(match.propertyId) || undefined}
            className={`scroll-mt-28 rounded-lg border p-3 transition-all duration-500 ${
              isHighlightedMatch
                ? "border-primary-300 bg-primary-500/10 ring-2 ring-primary-300/70"
                : "border-slate-800 bg-slate-900/60"
            }`}
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="flex min-w-0 gap-3">
                <PropertyMatchThumbnail match={match} />
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-sm font-semibold text-slate-100">
                      {match.property.title || match.property.reference || shortPropertyId(match.propertyId)}
                    </p>
                  </div>
                  {propertyFactsLine(match) && (
                    <p className="mt-1 text-xs text-slate-400">{propertyFactsLine(match)}</p>
                  )}
                  <p className="mt-1 font-mono text-[11px] text-slate-500">
                    ID {shortPropertyId(match.propertyId)}
                  </p>
                  <div className="mt-2">
                    <PropertyNavigationLinks
                      propertyId={match.propertyId}
                      publicUrl={match.property.publicUrl}
                      returnTo={leadIntelligenceMatchReturnUrl(returnBaseUrl, match.propertyId)}
                    />
                  </div>
                </div>
              </div>
              <div className="flex flex-col items-end gap-2">
                <p className="text-sm text-slate-200">
                  Score {match.score} · Data {match.dataQualityScore}
                </p>
                <PropertyEligibilityBadge eligibility={match.eligibility} />
                <MatchReviewDecisionBadge decision={reviewDecision} />
              </div>
            </div>
            <div className="mt-3 rounded-lg border border-slate-800 bg-slate-950/60 p-3">
              <LeadIntelligenceMatchReviewSelect
                idPrefix="match-review"
                propertyId={match.propertyId}
                value={reviewDecision}
                onChange={(decision) => onMatchReviewDecisionChange(match.propertyId, decision)}
              />
              {manualDecisionOverridesRejected && (
                <p className="mt-2 rounded border border-amber-500/30 bg-amber-500/10 p-2 text-xs text-amber-100">
                  Denne boligen er fortsatt avvist av systemreglene. Den kan bare tas med som
                  «Må undersøkes», og risiko/avvik blir lagret sammen med shortlist-utkastet.
                </p>
              )}
            </div>
            <PropertyQualityReviewControls
              propertyId={match.propertyId}
              idPrefix="match"
              review={qualityReviews[match.propertyId] || defaultPropertyQualityReview()}
              onStatusChange={onQualityReviewStatusChange}
              onNoteChange={onQualityReviewNoteChange}
            />
            <div className="mt-3 grid gap-3 lg:grid-cols-3">
              <MatchList
                title="Hvorfor match"
                items={humanizedMatchReasonItems(match.reasonsForMatch, 4)}
                emptyLabel="Ingen positive matchgrunner."
              />
              <MatchList title="Risiko/avvik" items={match.concerns} emptyLabel="Ingen tydelige avvik." />
              <MatchList
                title="Må verifiseres"
                items={match.questionsToVerify}
                emptyLabel="Ingen åpne verifikasjonsspørsmål."
              />
            </div>
            {match.budgetResult && (
              <p className="mt-3 rounded border border-slate-700 bg-slate-950/60 p-2 text-xs text-slate-300">
                Budsjett: {match.budgetResult.outcome} · {match.budgetResult.reason}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
