"use client";

import { useCallback, useEffect, useState } from "react";
import type { LeadIntelligenceWorklistItem } from "@/components/lead-intelligence/lead-intelligence-worklist-history-panel";
import type {
  PresentationDraftResponse,
  PropertyMatchPreviewResponse,
} from "@/components/lead-intelligence/lead-intelligence-client-types";

interface UseLeadIntelligencePropertyMatchHighlightParams {
  activeWorklistItem: LeadIntelligenceWorklistItem | null;
  propertyMatchResult: PropertyMatchPreviewResponse | null;
  presentationDraftResult: PresentationDraftResponse | null;
}

export function useLeadIntelligencePropertyMatchHighlight({
  activeWorklistItem,
  propertyMatchResult,
  presentationDraftResult,
}: UseLeadIntelligencePropertyMatchHighlightParams) {
  const [highlightedMatchId, setHighlightedMatchId] = useState<string | null>(null);

  const clearHighlightedMatch = useCallback(() => {
    setHighlightedMatchId(null);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const hash = window.location.hash;
    if (!hash.startsWith("#lead-intelligence-match-")) return;

    const targetId = decodeURIComponent(hash.slice(1));
    const propertyId = targetId.replace(/^lead-intelligence-match-/, "");
    let clearHighlightTimer: number | undefined;

    const scrollTimer = window.setTimeout(() => {
      const target = document.getElementById(targetId);
      if (!target) return;
      setHighlightedMatchId(propertyId);
      target.scrollIntoView({ behavior: "smooth", block: "center" });
      clearHighlightTimer = window.setTimeout(() => {
        setHighlightedMatchId((current) => (current === propertyId ? null : current));
      }, 3500);
    }, 150);

    return () => {
      window.clearTimeout(scrollTimer);
      if (clearHighlightTimer) window.clearTimeout(clearHighlightTimer);
    };
  }, [activeWorklistItem, propertyMatchResult, presentationDraftResult]);

  return {
    highlightedMatchId,
    clearHighlightedMatch,
  };
}
