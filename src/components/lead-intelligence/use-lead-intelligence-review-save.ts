"use client";

import { useState } from "react";
import type { ExtractedLead } from "@/services/lead-intelligence/contracts";
import type { ReviewCriterionRow } from "@/components/lead-intelligence/lead-intelligence-client-helpers";
import type { LeadContactDecision } from "@/components/lead-intelligence/lead-intelligence-contact-candidates-panel";
import type { CriterionReviewState } from "@/components/lead-intelligence/lead-intelligence-criteria-review-panel";
import type { LeadIntelligenceSource } from "@/components/lead-intelligence/lead-intelligence-request-card";
import type {
  LeadAnalysisResponse,
  ReviewSaveResponse,
  SafeErrorResponse,
} from "@/components/lead-intelligence/lead-intelligence-client-types";

interface UseLeadIntelligenceReviewSaveParams {
  brand: string;
  source: LeadIntelligenceSource;
  rawText: string;
  language: string;
  response: LeadAnalysisResponse | null;
  edited: ExtractedLead | null;
  persistenceEnabled: boolean;
  allCriteriaReviewed: boolean;
  hasJsonError: boolean;
  contactDecision: LeadContactDecision;
  selectedContactId: string | null;
  reviewCriteria: ReviewCriterionRow[];
  criterionReviews: Record<string, CriterionReviewState>;
  onReviewSaved: () => void;
}

export function useLeadIntelligenceReviewSave({
  brand,
  source,
  rawText,
  language,
  response,
  edited,
  persistenceEnabled,
  allCriteriaReviewed,
  hasJsonError,
  contactDecision,
  selectedContactId,
  reviewCriteria,
  criterionReviews,
  onReviewSaved,
}: UseLeadIntelligenceReviewSaveParams) {
  const [saveLoading, setSaveLoading] = useState(false);
  const [saveError, setSaveError] = useState<SafeErrorResponse["error"] | null>(null);
  const [saveResult, setSaveResult] = useState<ReviewSaveResponse | null>(null);

  const clearSaveError = () => {
    setSaveError(null);
  };

  const clearSaveResult = () => {
    setSaveResult(null);
  };

  const clearSaveFeedback = () => {
    setSaveError(null);
    setSaveResult(null);
  };

  const saveReview = async () => {
    if (!edited || !response || !persistenceEnabled || !allCriteriaReviewed || hasJsonError) return;
    setSaveLoading(true);
    setSaveError(null);
    setSaveResult(null);

    try {
      const res = await fetch("/api/lead-intelligence/review", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-correlation-id": response.correlationId,
        },
        body: JSON.stringify({
          brand,
          source,
          rawText,
          language: language.trim() || null,
          idempotencySeed: response.correlationId,
          analysis: edited,
          analysisMeta: {
            model: response.meta.model,
            promptVersion: response.meta.promptVersion,
            durationMs: response.meta.durationMs,
            repaired: response.meta.repaired,
          },
          contactDecision: {
            action: contactDecision,
            contactId: contactDecision === "connect_existing" ? selectedContactId : null,
            explicitApproval: true,
          },
          reviewedCriteria: reviewCriteria.map((criterion) => ({
            criterionType: criterion.criterionType,
            fingerprint: criterion.fingerprint,
            approvalStatus: criterionReviews[criterion.id]?.approvalStatus,
            customerConfirmed: criterionReviews[criterion.id]?.customerConfirmed || false,
          })),
        }),
      });
      const body = (await res.json()) as ReviewSaveResponse | SafeErrorResponse;
      if (!res.ok || !body.ok) {
        setSaveError((body as SafeErrorResponse).error || {
          correlationId: res.headers.get("x-correlation-id") || "unknown",
          code: "INTERNAL_ERROR",
          message: "Kunne ikke lagre review.",
        });
        return;
      }
      setSaveResult(body);
      onReviewSaved();
    } catch {
      setSaveError({
        correlationId: "client",
        code: "INTERNAL_ERROR",
        message: "Kunne ikke kontakte review-API-et.",
      });
    } finally {
      setSaveLoading(false);
    }
  };

  return {
    saveLoading,
    saveError,
    saveResult,
    setSaveResult,
    clearSaveError,
    clearSaveResult,
    clearSaveFeedback,
    saveReview,
  };
}
