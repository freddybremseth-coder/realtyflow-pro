"use client";

import { useCallback, useEffect, useRef, type Dispatch, type SetStateAction } from "react";
import { generateClientCorrelationId } from "@/components/lead-intelligence/lead-intelligence-client-helpers";
import type { LeadIntelligenceWorklistItem } from "@/components/lead-intelligence/lead-intelligence-worklist-history-panel";
import type {
  LeadIntelligenceWorklistResponse,
  ReviewSaveResponse,
} from "@/components/lead-intelligence/lead-intelligence-client-types";

interface UseLeadIntelligenceWorklistNavigationParams {
  worklistResult: LeadIntelligenceWorklistResponse | null;
  clearContactCandidates: () => void;
  clearActiveProfileActions: () => void;
  clearAnalysisResult: () => void;
  clearReviewEditor: () => void;
  setActiveWorklistItem: Dispatch<SetStateAction<LeadIntelligenceWorklistItem | null>>;
  setWorklistHistoryExpanded: Dispatch<SetStateAction<boolean>>;
  clearSaveError: () => void;
  setSaveResult: Dispatch<SetStateAction<ReviewSaveResponse | null>>;
  loadPresentationDraftById: (presentationId: string) => void | Promise<void>;
}

function buildContinuedWorklistSaveResult(
  item: LeadIntelligenceWorklistItem,
  analysisRunId: string,
): ReviewSaveResponse {
  return {
    ok: true,
    correlationId: generateClientCorrelationId(),
    result: {
      status: {
        newlySaved: false,
        duplicate: true,
        conflict: false,
      },
      intake: {
        id: item.intakeId,
        duplicate: true,
      },
      analysisRun: {
        id: analysisRunId,
        duplicate: true,
      },
      buyerProfile: {
        id: item.buyerProfileId,
        criterionCount: item.criterionCount,
        duplicate: true,
      },
      contactCandidates: {
        recorded: 0,
        selectedContactId: null,
        decision: "continue_without_contact",
        createdContact: false,
        linkedContact: item.contactLinked,
        duplicate: true,
      },
    },
    sideEffects: {
      contactsCreated: false,
      contactUpdated: false,
      emailSent: false,
      propertyMatchingStarted: false,
    },
  };
}

export function useLeadIntelligenceWorklistNavigation({
  worklistResult,
  clearContactCandidates,
  clearActiveProfileActions,
  clearAnalysisResult,
  clearReviewEditor,
  setActiveWorklistItem,
  setWorklistHistoryExpanded,
  clearSaveError,
  setSaveResult,
  loadPresentationDraftById,
}: UseLeadIntelligenceWorklistNavigationParams) {
  const returnUrlHydratedRef = useRef(false);

  const scrollToActiveProfile = useCallback(() => {
    document.getElementById("lead-intelligence-active-profile")?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }, []);

  const continueFromWorklistItem = useCallback(
    (item: LeadIntelligenceWorklistItem) => {
      const analysisRunId = item.analysisRunId;
      if (!analysisRunId) return;
      clearContactCandidates();
      clearActiveProfileActions();
      clearAnalysisResult();
      clearReviewEditor();
      setActiveWorklistItem(item);
      setWorklistHistoryExpanded(false);
      clearSaveError();
      setSaveResult(buildContinuedWorklistSaveResult(item, analysisRunId));
      window.setTimeout(scrollToActiveProfile, 50);
    },
    [
      clearActiveProfileActions,
      clearAnalysisResult,
      clearContactCandidates,
      clearReviewEditor,
      clearSaveError,
      scrollToActiveProfile,
      setActiveWorklistItem,
      setSaveResult,
      setWorklistHistoryExpanded,
    ],
  );

  useEffect(() => {
    if (returnUrlHydratedRef.current || !worklistResult || typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const buyerProfileId = params.get("buyerProfileId");
    const presentationId = params.get("presentationId");
    if (!buyerProfileId && !presentationId) return;

    const item = worklistResult.result.items.find((candidate) =>
      (buyerProfileId && candidate.buyerProfileId === buyerProfileId) ||
      (presentationId && candidate.latestPresentationId === presentationId),
    );
    if (!item) return;

    returnUrlHydratedRef.current = true;
    continueFromWorklistItem(item);
    if (presentationId) {
      void loadPresentationDraftById(presentationId);
    } else if (item.latestPresentationId) {
      void loadPresentationDraftById(item.latestPresentationId);
    }
  }, [continueFromWorklistItem, loadPresentationDraftById, worklistResult]);

  return {
    continueFromWorklistItem,
    scrollToActiveProfile,
  };
}
