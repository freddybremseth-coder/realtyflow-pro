"use client";

import { useMemo } from "react";
import type { ExtractedLead } from "@/services/lead-intelligence/contracts";
import { savedPropertyQualityDecision } from "@/components/lead-intelligence/lead-intelligence-client-config";
import type { PropertyMatchPreviewResponse, ShortlistSaveResponse } from "@/components/lead-intelligence/lead-intelligence-client-types";
import type {
  MatchReviewDecision,
  SelectedShortlistDecision,
} from "@/components/lead-intelligence/property-match-display";
import {
  defaultPropertyQualityReview,
  type PropertyQualityReviewState,
  type SavedPropertyQualityReviewStatus,
} from "@/components/lead-intelligence/property-quality-review-controls";
import {
  buildShortlistEmailDraft,
  buildShortlistPresentation,
  buildShortlistPresentationText,
  type SelectedShortlistMatch,
} from "@/components/lead-intelligence/shortlist-presentation-drafts";

interface UseLeadIntelligenceShortlistDerivedStateParams {
  edited: ExtractedLead | null;
  propertyMatchResult: PropertyMatchPreviewResponse | null;
  propertyQualityReviews: Record<string, PropertyQualityReviewState>;
  matchReviewDecisions: Record<string, MatchReviewDecision>;
  shortlistSaveResult: ShortlistSaveResponse | null;
}

export type SelectedShortlistItem = {
  propertyId: string;
  decision: SelectedShortlistDecision;
  qualityReview: {
    status: SavedPropertyQualityReviewStatus;
    note: string | null;
    checkedAt: string;
    checkedBy: string;
  };
};

export function useLeadIntelligenceShortlistDerivedState({
  edited,
  propertyMatchResult,
  propertyQualityReviews,
  matchReviewDecisions,
  shortlistSaveResult,
}: UseLeadIntelligenceShortlistDerivedStateParams) {
  const selectedShortlistItems = useMemo(() => {
    if (!propertyMatchResult) return [];
    return propertyMatchResult.result.matches
      .map((match) => {
        const qualityReview = propertyQualityReviews[match.propertyId] || defaultPropertyQualityReview();
        if (qualityReview.status === "unreviewed") return null;
        const reviewDecision = matchReviewDecisions[match.propertyId] || "system";
        return {
          propertyId: match.propertyId,
          decision: savedPropertyQualityDecision(qualityReview.status, reviewDecision),
          qualityReview: {
            status: qualityReview.status,
            note: qualityReview.note.trim() || null,
            checkedAt: qualityReview.checkedAt || new Date().toISOString(),
            checkedBy: qualityReview.checkedBy || "Freddy",
          },
        };
      })
      .filter((item): item is SelectedShortlistItem => Boolean(item));
  }, [matchReviewDecisions, propertyMatchResult, propertyQualityReviews]);

  const clientReadyShortlistItems = useMemo(
    () => selectedShortlistItems.filter((item) => item.qualityReview.status === "client_ready"),
    [selectedShortlistItems],
  );

  const selectedShortlistMatches = useMemo(() => {
    if (!propertyMatchResult) return [];
    const selectedById = new Map(clientReadyShortlistItems.map((item) => [item.propertyId, item]));
    return propertyMatchResult.result.matches
      .map((match) => {
        const selected = selectedById.get(match.propertyId);
        return selected
          ? {
              ...match,
              decision: selected.decision,
              qualityReview: {
                status: "client_ready" as const,
                note: selected.qualityReview.note || "",
                checkedAt: selected.qualityReview.checkedAt,
                checkedBy: selected.qualityReview.checkedBy,
              },
            }
          : null;
      })
      .filter((match): match is SelectedShortlistMatch => Boolean(match));
  }, [clientReadyShortlistItems, propertyMatchResult]);

  const shortlistPresentation = useMemo(() => {
    if (!shortlistSaveResult || !edited || selectedShortlistMatches.length === 0) return null;
    return buildShortlistPresentation(edited, selectedShortlistMatches);
  }, [edited, selectedShortlistMatches, shortlistSaveResult]);

  const shortlistPresentationText = useMemo(() => {
    if (!shortlistSaveResult || !edited || selectedShortlistMatches.length === 0) return null;
    return buildShortlistPresentationText(edited, selectedShortlistMatches);
  }, [edited, selectedShortlistMatches, shortlistSaveResult]);

  const shortlistEmailDraft = useMemo(() => {
    if (!shortlistSaveResult || !edited || selectedShortlistMatches.length === 0) return null;
    return buildShortlistEmailDraft(edited, selectedShortlistMatches);
  }, [edited, selectedShortlistMatches, shortlistSaveResult]);

  return {
    selectedShortlistItems,
    clientReadyShortlistItems,
    selectedShortlistMatches,
    shortlistPresentation,
    shortlistPresentationText,
    shortlistEmailDraft,
  };
}
