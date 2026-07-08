"use client";

import { leadIntelligenceDraftReturnUrl } from "@/components/lead-intelligence/lead-intelligence-client-config";
import type { SelectedShortlistItem } from "@/components/lead-intelligence/use-lead-intelligence-shortlist-derived-state";
import type { LeadIntelligenceWorklistItem } from "@/components/lead-intelligence/lead-intelligence-worklist-history-panel";
import type {
  PresentationDraftResponse,
  ReviewSaveResponse,
} from "@/components/lead-intelligence/lead-intelligence-client-types";

interface UseLeadIntelligencePresentationActionsParams {
  activeWorklistItem: LeadIntelligenceWorklistItem | null;
  saveResult: ReviewSaveResponse | null;
  presentationDraftResult: PresentationDraftResponse | null;
  selectedShortlistItems: SelectedShortlistItem[];
  saveShortlistDraft: (selectedShortlistItems: SelectedShortlistItem[]) => void | Promise<void>;
}

export function useLeadIntelligencePresentationActions({
  activeWorklistItem,
  saveResult,
  presentationDraftResult,
  selectedShortlistItems,
  saveShortlistDraft,
}: UseLeadIntelligencePresentationActionsParams) {
  const presentationDraftReturnUrl = presentationDraftResult
    ? leadIntelligenceDraftReturnUrl({
        buyerProfileId: presentationDraftResult.result.buyerProfileId,
        presentationId: presentationDraftResult.result.presentationId,
        messageDraftId: presentationDraftResult.result.messageDraftId,
      })
    : null;

  const propertyMatchReturnBaseUrl =
    presentationDraftReturnUrl ||
    leadIntelligenceDraftReturnUrl({
      buyerProfileId: activeWorklistItem?.buyerProfileId || saveResult?.result.buyerProfile.id || null,
    });

  const saveSelectedShortlistDraft = () => {
    void saveShortlistDraft(selectedShortlistItems);
  };

  return {
    presentationDraftReturnUrl,
    propertyMatchReturnBaseUrl,
    saveSelectedShortlistDraft,
  };
}
