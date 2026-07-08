"use client";

import { useMemo, useState } from "react";
import type { ExtractedLead } from "@/services/lead-intelligence/contracts";
import {
  flattenReviewCriteria,
  parseJsonEditor,
  prettyJson,
} from "@/components/lead-intelligence/lead-intelligence-client-helpers";
import type { CriterionReviewState } from "@/components/lead-intelligence/lead-intelligence-criteria-review-panel";
import type { LeadAnalysisResponse } from "@/components/lead-intelligence/lead-intelligence-client-types";

interface UseLeadIntelligenceReviewEditorParams {
  response: LeadAnalysisResponse | null;
  onEditedChanged: () => void;
  onCriterionReviewChanged: () => void;
}

export function useLeadIntelligenceReviewEditor({
  response,
  onEditedChanged,
  onCriterionReviewChanged,
}: UseLeadIntelligenceReviewEditorParams) {
  const [editableJson, setEditableJson] = useState("");
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const [criterionReviews, setCriterionReviews] = useState<Record<string, CriterionReviewState>>({});

  const jsonEditor = useMemo(() => parseJsonEditor(editableJson), [editableJson]);
  const edited = jsonEditor.parsed || response?.result || null;
  const reviewCriteria = useMemo(() => flattenReviewCriteria(edited), [edited]);
  const reviewedCount = reviewCriteria.filter(
    (criterion) => criterionReviews[criterion.id]?.approvalStatus && criterionReviews[criterion.id].approvalStatus !== "pending",
  ).length;
  const allCriteriaReviewed = reviewCriteria.length > 0 && reviewedCount === reviewCriteria.length;

  const loadAnalysisResult = (result: LeadAnalysisResponse["result"]) => {
    setEditableJson(prettyJson(result));
    setCriterionReviews(
      Object.fromEntries(
        flattenReviewCriteria(result).map((criterion) => [
          criterion.id,
          { approvalStatus: "pending", customerConfirmed: false },
        ]),
      ),
    );
  };

  const clearReviewEditor = () => {
    setEditableJson("");
    setCopyState("idle");
    setCriterionReviews({});
  };

  const updateEditableJson = (value: string) => {
    setEditableJson(value);
    onEditedChanged();
  };

  const updateEdited = (updater: (current: ExtractedLead) => ExtractedLead) => {
    if (!edited) return;
    const next = updater(edited);
    setEditableJson(prettyJson(next));
    onEditedChanged();
  };

  const updateCriterionReview = (id: string, patch: Partial<CriterionReviewState>) => {
    setCriterionReviews((current) => ({
      ...current,
      [id]: {
        approvalStatus: current[id]?.approvalStatus || "pending",
        customerConfirmed: current[id]?.customerConfirmed || false,
        ...patch,
      },
    }));
    onCriterionReviewChanged();
  };

  const copyJson = async () => {
    try {
      await navigator.clipboard.writeText(editableJson);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
  };

  return {
    editableJson,
    copyState,
    criterionReviews,
    jsonEditor,
    edited,
    reviewCriteria,
    reviewedCount,
    allCriteriaReviewed,
    loadAnalysisResult,
    clearReviewEditor,
    updateEditableJson,
    updateEdited,
    updateCriterionReview,
    copyJson,
  };
}
