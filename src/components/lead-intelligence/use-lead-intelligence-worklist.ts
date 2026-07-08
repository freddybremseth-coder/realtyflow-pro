"use client";

import { useState } from "react";
import type {
  LeadIntelligenceWorklistResponse,
  SafeErrorResponse,
} from "@/components/lead-intelligence/lead-intelligence-client-types";
import type { LeadIntelligenceWorklistItem } from "@/components/lead-intelligence/lead-intelligence-worklist-history-panel";

interface UseLeadIntelligenceWorklistParams {
  brand: string;
  persistenceEnabled: boolean;
}

export function useLeadIntelligenceWorklist({
  brand,
  persistenceEnabled,
}: UseLeadIntelligenceWorklistParams) {
  const [worklistLoading, setWorklistLoading] = useState(false);
  const [worklistError, setWorklistError] = useState<SafeErrorResponse["error"] | null>(null);
  const [worklistResult, setWorklistResult] = useState<LeadIntelligenceWorklistResponse | null>(null);
  const [activeWorklistItem, setActiveWorklistItem] = useState<LeadIntelligenceWorklistItem | null>(null);
  const [worklistHistoryExpanded, setWorklistHistoryExpanded] = useState(true);

  const loadWorklist = async () => {
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
        setWorklistError((body as SafeErrorResponse).error || {
          correlationId: res.headers.get("x-correlation-id") || "unknown",
          code: "INTERNAL_ERROR",
          message: "Kunne ikke hente arbeidslisten.",
        });
        return;
      }
      setWorklistResult(body);
    } catch {
      setWorklistError({
        correlationId: "client",
        code: "INTERNAL_ERROR",
        message: "Kunne ikke kontakte arbeidsliste-API-et.",
      });
    } finally {
      setWorklistLoading(false);
    }
  };

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
