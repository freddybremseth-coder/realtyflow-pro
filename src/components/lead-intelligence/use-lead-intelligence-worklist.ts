"use client";

import { useCallback, useEffect, useState } from "react";
import type {
  LeadIntelligenceWorklistResponse,
  SafeErrorResponse,
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

  const resetWorklist = () => {
    setWorklistResult(null);
    setWorklistError(null);
    clearWorklistSelection();
  };

  return {
    worklistLoading,
    worklistError,
    worklistResult,
    activeWorklistItem,
    worklistHistoryExpanded,
    setActiveWorklistItem,
    setWorklistHistoryExpanded,
    clearWorklistSelection,
    resetWorklist,
    loadWorklist,
  };
}
