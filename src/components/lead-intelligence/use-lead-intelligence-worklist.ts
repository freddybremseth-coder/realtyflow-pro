"use client";

import { useCallback, useEffect, useState } from "react";
import type {
  LeadIntelligenceWorklistResponse,
  SafeErrorResponse,
  SavedProfilesDeleteResponse,
} from "@/components/lead-intelligence/lead-intelligence-client-types";
import {
  apiResponseError,
  clientApiError,
} from "@/components/lead-intelligence/lead-intelligence-client-errors";
import type { LeadIntelligenceWorklistItem } from "@/components/lead-intelligence/lead-intelligence-worklist-history-panel";

interface UseLeadIntelligenceWorklistParams {
  brand: string;
  featureEnabled: boolean;
  persistenceEnabled: boolean;
}

export function useLeadIntelligenceWorklist({
  brand,
  featureEnabled,
  persistenceEnabled,
}: UseLeadIntelligenceWorklistParams) {
  const [worklistLoading, setWorklistLoading] = useState(false);
  const [worklistError, setWorklistError] = useState<SafeErrorResponse["error"] | null>(null);
  const [worklistResult, setWorklistResult] = useState<LeadIntelligenceWorklistResponse | null>(null);
  const [activeWorklistItem, setActiveWorklistItem] = useState<LeadIntelligenceWorklistItem | null>(null);
  const [worklistHistoryExpanded, setWorklistHistoryExpanded] = useState(true);
  const [selectedBuyerProfileIds, setSelectedBuyerProfileIds] = useState<string[]>([]);
  const [worklistDeleteLoading, setWorklistDeleteLoading] = useState(false);
  const [worklistDeleteError, setWorklistDeleteError] = useState<SafeErrorResponse["error"] | null>(null);
  const [worklistDeleteResult, setWorklistDeleteResult] = useState<SavedProfilesDeleteResponse | null>(null);

  const loadWorklist = useCallback(async () => {
    if (!persistenceEnabled) return;
    setWorklistLoading(true);
    setWorklistError(null);

    try {
      const params = new URLSearchParams({
        brand,
        limit: "20",
      });
      const res = await fetch(`/api/lead-intelligence/worklist?${params.toString()}`, {
        method: "GET",
        headers: { accept: "application/json" },
      });
      const body = (await res.json()) as LeadIntelligenceWorklistResponse | SafeErrorResponse;
      if (!res.ok || !body.ok) {
        setWorklistError(apiResponseError(res, body, "Kunne ikke hente arbeidslisten."));
        return;
      }
      setWorklistResult(body);
    } catch {
      setWorklistError(clientApiError("Kunne ikke kontakte arbeidsliste-API-et."));
    } finally {
      setWorklistLoading(false);
    }
  }, [brand, persistenceEnabled]);

  useEffect(() => {
    if (!featureEnabled || !persistenceEnabled) return;
    void loadWorklist();
  }, [featureEnabled, loadWorklist, persistenceEnabled]);

  const clearWorklistSelection = () => {
    setActiveWorklistItem(null);
    setWorklistHistoryExpanded(true);
  };

  const clearSelectedBuyerProfiles = () => {
    setSelectedBuyerProfileIds([]);
  };

  const toggleBuyerProfileSelection = (buyerProfileId: string) => {
    setWorklistDeleteError(null);
    setWorklistDeleteResult(null);
    setSelectedBuyerProfileIds((current) =>
      current.includes(buyerProfileId)
        ? current.filter((id) => id !== buyerProfileId)
        : [...current, buyerProfileId],
    );
  };

  const selectAllVisibleBuyerProfiles = () => {
    const visibleIds = worklistResult?.result.items.map((item) => item.buyerProfileId) || [];
    setWorklistDeleteError(null);
    setWorklistDeleteResult(null);
    setSelectedBuyerProfileIds(visibleIds);
  };

  const deleteSelectedBuyerProfiles = async () => {
    const buyerProfileIds = Array.from(new Set(selectedBuyerProfileIds));
    if (!persistenceEnabled || buyerProfileIds.length === 0) return;

    const confirmed = window.confirm(
      `Slette ${buyerProfileIds.length} valgt(e) buyer profile permanent? Dette fjerner også tilhørende kriterier, shortlist og presentasjonsutkast. CRM-kontakter slettes ikke.`,
    );
    if (!confirmed) return;

    setWorklistDeleteLoading(true);
    setWorklistDeleteError(null);
    setWorklistDeleteResult(null);

    try {
      const res = await fetch("/api/lead-intelligence/buyer-profiles/delete", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ brand, buyerProfileIds }),
      });
      const body = (await res.json()) as SavedProfilesDeleteResponse | SafeErrorResponse;
      if (!res.ok || !body.ok) {
        setWorklistDeleteError(apiResponseError(res, body, "Kunne ikke slette valgte buyer profiles."));
        return;
      }

      setWorklistDeleteResult(body);
      setSelectedBuyerProfileIds((current) =>
        current.filter((id) => !body.result.deletedBuyerProfileIds.includes(id)),
      );
      setActiveWorklistItem((current) =>
        current && body.result.deletedBuyerProfileIds.includes(current.buyerProfileId) ? null : current,
      );
      setWorklistResult((current) =>
        current
          ? {
              ...current,
              result: {
                ...current.result,
                items: current.result.items.filter(
                  (item) => !body.result.deletedBuyerProfileIds.includes(item.buyerProfileId),
                ),
              },
            }
          : current,
      );
      void loadWorklist();
    } catch {
      setWorklistDeleteError(clientApiError("Kunne ikke kontakte slette-API-et."));
    } finally {
      setWorklistDeleteLoading(false);
    }
  };

  const resetWorklist = () => {
    setWorklistResult(null);
    setWorklistError(null);
    setWorklistDeleteError(null);
    setWorklistDeleteResult(null);
    clearSelectedBuyerProfiles();
    clearWorklistSelection();
  };

  return {
    worklistLoading,
    worklistError,
    worklistResult,
    activeWorklistItem,
    worklistHistoryExpanded,
    selectedBuyerProfileIds,
    worklistDeleteLoading,
    worklistDeleteError,
    worklistDeleteResult,
    setActiveWorklistItem,
    setWorklistHistoryExpanded,
    clearWorklistSelection,
    clearSelectedBuyerProfiles,
    toggleBuyerProfileSelection,
    selectAllVisibleBuyerProfiles,
    deleteSelectedBuyerProfiles,
    resetWorklist,
    loadWorklist,
  };
}
