"use client";

import {
  MatchList,
  PropertyEligibilityBadge,
  PropertyMatchThumbnail,
  propertyDisplayName,
  propertyFactsLine,
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

interface LeadIntelligenceActiveProfileMatchListProps {
  matches: LeadIntelligencePropertyMatch[];
  matchReviewDecisions: Record<string, MatchReviewDecision>;
  highlightedMatchId: string | null;
  returnBaseUrl: string;
  qualityReviews: Record<string, PropertyQualityReviewState>;
  onMatchReviewDecisionChange: (propertyId: string, decision: MatchReviewDecision) => void;
  onQualityReviewStatusChange: (propertyId: string, status: PropertyQualityReviewStatus) => void;
  onQualityReviewNoteChange: (propertyId: string, note: string) => void;
}

export function LeadIntelligenceActiveProfileMatchList({
  matches,
  matchReviewDecisions,
  highlightedMatchId,
  returnBaseUrl,
  qualityReviews,
  onMatchReviewDecisionChange,
  onQualityReviewStatusChange,
  onQualityReviewNoteChange,
}: LeadIntelligenceActiveProfileMatchListProps) {
  return (
    <div className="max-h-[34rem] space-y-3 overflow-auto pr-1">
      {matches.map((match) => {
        const reviewDecision = matchReviewDecisions[match.propertyId] || "system";
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
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex min-w-0 gap-3">
                <PropertyMatchThumbnail match={match} />
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-100">
                    {propertyDisplayName(match)}
                  </p>
                  {propertyFactsLine(match) && (
                    <p className="mt-1 text-xs text-slate-400">{propertyFactsLine(match)}</p>
                  )}
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
                <p className="text-sm text-slate-200">Score {match.score}</p>
                <PropertyEligibilityBadge eligibility={match.eligibility} />
              </div>
            </div>
            <div className="mt-3">
              <LeadIntelligenceMatchReviewSelect
                idPrefix="active-match-review"
                propertyId={match.propertyId}
                value={reviewDecision}
                onChange={(decision) => onMatchReviewDecisionChange(match.propertyId, decision)}
              />
            </div>
            <PropertyQualityReviewControls
              propertyId={match.propertyId}
              idPrefix="active-match"
              review={qualityReviews[match.propertyId] || defaultPropertyQualityReview()}
              onStatusChange={onQualityReviewStatusChange}
              onNoteChange={onQualityReviewNoteChange}
            />
            <MatchList title="Risiko/avvik" items={match.concerns} emptyLabel="Ingen tydelige avvik." />
          </div>
        );
      })}
    </div>
  );
}
