"use client";

import { useMemo, useState } from "react";
import { LEAD_INTELLIGENCE_LIMITS } from "@/services/lead-intelligence/contracts";
import { parsePropertyReferences } from "@/components/lead-intelligence/lead-intelligence-client-helpers";
import type {
  PropertyMatchPreviewResponse,
  ReviewSaveResponse,
  SafeErrorResponse,
  ShortlistSaveResponse,
} from "@/components/lead-intelligence/lead-intelligence-client-types";
import type { MatchReviewDecision } from "@/components/lead-intelligence/property-match-display";
import {
  defaultPropertyQualityReview,
  type PropertyQualityReviewState,
  type PropertyQualityReviewStatus,
} from "@/components/lead-intelligence/property-quality-review-controls";
import type { SelectedShortlistItem } from "@/components/lead-intelligence/use-lead-intelligence-shortlist-derived-state";

type PropertyMatchPreviewMode = "auto" | "explicit";

interface UseLeadIntelligencePropertyMatchFlowParams {
  brand: string;
  propertyMatchingEnabled: boolean;
  saveResult: ReviewSaveResponse | null;
  onPresentationDraftInvalidated: () => void;
  onHighlightedMatchCleared: () => void;
}

export function useLeadIntelligencePropertyMatchFlow({
  brand,
  propertyMatchingEnabled,
  saveResult,
  onPresentationDraftInvalidated,
  onHighlightedMatchCleared,
}: UseLeadIntelligencePropertyMatchFlowParams) {
  const [propertyReferencesText, setPropertyReferencesText] = useState("");
  const [propertyMatchLoading, setPropertyMatchLoading] = useState(false);
  const [propertyMatchError, setPropertyMatchError] = useState<SafeErrorResponse["error"] | null>(null);
  const [propertyMatchResult, setPropertyMatchResult] = useState<PropertyMatchPreviewResponse | null>(null);
  const [matchReviewDecisions, setMatchReviewDecisions] = useState<Record<string, MatchReviewDecision>>({});
  const [propertyQualityReviews, setPropertyQualityReviews] = useState<Record<string, PropertyQualityReviewState>>({});
  const [shortlistSaveLoading, setShortlistSaveLoading] = useState(false);
  const [shortlistSaveError, setShortlistSaveError] = useState<SafeErrorResponse["error"] | null>(null);
  const [shortlistSaveResult, setShortlistSaveResult] = useState<ShortlistSaveResponse | null>(null);

  const parsedPropertyReferences = useMemo(
    () => parsePropertyReferences(propertyReferencesText),
    [propertyReferencesText],
  );

  const clearShortlistAndPresentationState = () => {
    setShortlistSaveError(null);
    setShortlistSaveResult(null);
    onPresentationDraftInvalidated();
  };

  const clearPropertyMatchPreview = () => {
    setPropertyMatchError(null);
    setPropertyMatchResult(null);
    setMatchReviewDecisions({});
    setShortlistSaveError(null);
    setShortlistSaveResult(null);
    onHighlightedMatchCleared();
    onPresentationDraftInvalidated();
  };

  const resetPropertyMatchFlow = () => {
    setPropertyReferencesText("");
    clearPropertyMatchPreview();
  };

  const updatePropertyReferencesText = (value: string) => {
    setPropertyReferencesText(value);
    clearPropertyMatchPreview();
  };

  const updatePropertyQualityReviewStatus = (propertyId: string, status: PropertyQualityReviewStatus) => {
    setPropertyQualityReviews((current) => ({
      ...current,
      [propertyId]: {
        ...(current[propertyId] || defaultPropertyQualityReview()),
        status,
        checkedAt: status === "unreviewed" ? null : new Date().toISOString(),
        checkedBy: status === "unreviewed" ? null : "Freddy",
      },
    }));
    clearShortlistAndPresentationState();
  };

  const updatePropertyQualityReviewNote = (propertyId: string, note: string) => {
    setPropertyQualityReviews((current) => ({
      ...current,
      [propertyId]: {
        ...(current[propertyId] || defaultPropertyQualityReview()),
        note: note.slice(0, LEAD_INTELLIGENCE_LIMITS.mediumText),
      },
    }));
    clearShortlistAndPresentationState();
  };

  const updateMatchReviewDecision = (propertyId: string, decision: MatchReviewDecision) => {
    setMatchReviewDecisions((current) => ({
      ...current,
      [propertyId]: decision,
    }));
    clearShortlistAndPresentationState();
  };

  const loadShortlistSaveResult = (result: ShortlistSaveResponse) => {
    setShortlistSaveResult(result);
  };

  const previewPropertyMatches = async (mode: PropertyMatchPreviewMode) => {
    if (!saveResult || !propertyMatchingEnabled) return;
    if (mode === "explicit" && parsedPropertyReferences.error) return;
    setPropertyMatchLoading(true);
    setPropertyMatchError(null);
    setPropertyMatchResult(null);

    try {
      const res = await fetch("/api/lead-intelligence/property-matches/preview", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-correlation-id": saveResult.correlationId,
        },
        body: JSON.stringify({
          brand,
          buyerProfileId: saveResult.result.buyerProfile.id,
          ...(mode === "auto"
            ? {
                autoDiscover: true,
                candidateLimit: 120,
                maxResults: 10,
              }
            : {
                propertyReferences: parsedPropertyReferences.references,
                maxResults: parsedPropertyReferences.references.length,
              }),
        }),
      });
      const body = (await res.json()) as PropertyMatchPreviewResponse | SafeErrorResponse;
      if (!res.ok || !body.ok) {
        setPropertyMatchError((body as SafeErrorResponse).error || {
          correlationId: res.headers.get("x-correlation-id") || "unknown",
          code: "INTERNAL_ERROR",
          message: "Kunne ikke forhåndsvise eiendomsmatcher.",
        });
        return;
      }
      setPropertyMatchResult(body);
      setMatchReviewDecisions({});
      setPropertyQualityReviews({});
      setShortlistSaveError(null);
      setShortlistSaveResult(null);
      onPresentationDraftInvalidated();
    } catch {
      setPropertyMatchError({
        correlationId: "client",
        code: "INTERNAL_ERROR",
        message: "Kunne ikke kontakte property-match-preview-API-et.",
      });
    } finally {
      setPropertyMatchLoading(false);
    }
  };

  const saveShortlistDraft = async (selectedShortlistItems: SelectedShortlistItem[]) => {
    if (!saveResult || !propertyMatchResult || selectedShortlistItems.length === 0) return;
    setShortlistSaveLoading(true);
    setShortlistSaveError(null);
    setShortlistSaveResult(null);
    onPresentationDraftInvalidated();

    try {
      const res = await fetch("/api/lead-intelligence/shortlists", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-correlation-id": propertyMatchResult.correlationId,
        },
        body: JSON.stringify({
          brand,
          buyerProfileId: saveResult.result.buyerProfile.id,
          title: `Shortlist ${new Date().toLocaleDateString("nb-NO")}`,
          idempotencySeed: propertyMatchResult.correlationId,
          items: selectedShortlistItems,
        }),
      });
      const body = (await res.json()) as ShortlistSaveResponse | SafeErrorResponse;
      if (!res.ok || !body.ok) {
        setShortlistSaveError((body as SafeErrorResponse).error || {
          correlationId: res.headers.get("x-correlation-id") || "unknown",
          code: "INTERNAL_ERROR",
          message: "Kunne ikke lagre shortlist-utkast.",
        });
        return;
      }
      setShortlistSaveResult(body);
      onPresentationDraftInvalidated();
    } catch {
      setShortlistSaveError({
        correlationId: "client",
        code: "INTERNAL_ERROR",
        message: "Kunne ikke kontakte shortlist-API-et.",
      });
    } finally {
      setShortlistSaveLoading(false);
    }
  };

  return {
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
  };
}
