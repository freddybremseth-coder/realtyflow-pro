"use client";

import type { Dispatch, SetStateAction } from "react";
import { useLeadIntelligenceActiveProfileActions } from "@/components/lead-intelligence/use-lead-intelligence-active-profile-actions";
import type { LeadIntelligenceWorklistItem } from "@/components/lead-intelligence/lead-intelligence-worklist-history-panel";
import type { ReviewSaveResponse } from "@/components/lead-intelligence/lead-intelligence-client-types";

interface UseLeadIntelligenceActiveProfileFlowParams {
  brand: string;
  activeWorklistItem: LeadIntelligenceWorklistItem | null;
  persistenceEnabled: boolean;
  connectExistingEnabled: boolean;
  createContactEnabled: boolean;
  setActiveWorklistItem: Dispatch<SetStateAction<LeadIntelligenceWorklistItem | null>>;
  setSaveResult: Dispatch<SetStateAction<ReviewSaveResponse | null>>;
  clearPropertyMatchPreview: () => void;
  clearWorklistSelection: () => void;
  loadWorklist: () => void | Promise<void>;
}

export function useLeadIntelligenceActiveProfileFlow({
  brand,
  activeWorklistItem,
  persistenceEnabled,
  connectExistingEnabled,
  createContactEnabled,
  setActiveWorklistItem,
  setSaveResult,
  clearPropertyMatchPreview,
  clearWorklistSelection,
  loadWorklist,
}: UseLeadIntelligenceActiveProfileFlowParams) {
  return useLeadIntelligenceActiveProfileActions({
    brand,
    activeWorklistItem,
    persistenceEnabled,
    connectExistingEnabled,
    createContactEnabled,
    onContactCandidatesLoaded: (result) => {
      if (!result.result.linkedContact) return;
      setActiveWorklistItem((current) =>
        current && current.buyerProfileId === result.result.buyerProfileId
          ? {
              ...current,
              contactLinked: true,
              linkedContact: result.result.linkedContact,
            }
          : current,
      );
    },
    onContactLinked: (result) => {
      setActiveWorklistItem((current) =>
        current && current.buyerProfileId === result.result.buyerProfileId
          ? {
              ...current,
              contactLinked: true,
              linkedContact: result.result.linkedContact,
            }
          : current,
      );
      setSaveResult((current) =>
        current
          ? {
              ...current,
              result: {
                ...current.result,
                contactCandidates: {
                  ...current.result.contactCandidates,
                  selectedContactId: result.result.contactId,
                  decision: "connect_existing",
                  linkedContact: true,
                  duplicate: result.result.duplicate,
                },
              },
            }
          : current,
      );
      void loadWorklist();
    },
    onContactCreated: (result) => {
      setActiveWorklistItem((current) =>
        current && current.buyerProfileId === result.result.buyerProfileId
          ? {
              ...current,
              contactLinked: true,
              linkedContact: result.result.linkedContact,
            }
          : current,
      );
      setSaveResult((current) =>
        current
          ? {
              ...current,
              result: {
                ...current.result,
                contactCandidates: {
                  ...current.result.contactCandidates,
                  selectedContactId: result.result.contactId,
                  decision: "create_new",
                  linkedContact: true,
                  duplicate: result.result.duplicate,
                },
              },
            }
          : current,
      );
      void loadWorklist();
    },
    onProfileArchived: () => {
      setSaveResult(null);
      clearPropertyMatchPreview();
      clearWorklistSelection();
      void loadWorklist();
    },
  });
}
