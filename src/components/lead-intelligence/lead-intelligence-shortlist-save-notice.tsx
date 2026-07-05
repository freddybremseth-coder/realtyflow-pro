"use client";

import type { ReactNode } from "react";
import type { ShortlistSaveResponse } from "@/components/lead-intelligence/lead-intelligence-client-types";

type ShortlistSaveResult = ShortlistSaveResponse["result"];
type ShortlistSaveSummary = "saved-count" | "duplicate-aware";

const shortlistSideEffectText =
  "E-post sendt: nei · Leads opprettet: nei · Kontakter opprettet: nei · " +
  "Presentasjon opprettet: nei · Property matching-jobb startet: nei";

interface LeadIntelligenceShortlistSaveNoticeProps {
  result: ShortlistSaveResult;
  summary: ShortlistSaveSummary;
  className?: string;
  children?: ReactNode;
}

export function LeadIntelligenceShortlistSaveNotice({
  result,
  summary,
  className = "",
  children,
}: LeadIntelligenceShortlistSaveNoticeProps) {
  return (
    <div
      className={`mt-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-100 ${className}`}
    >
      <div>
        <p className="font-semibold">
          {summary === "saved-count"
            ? `Shortlist ${result.shortlistId} lagret med ${result.itemCount} bolig(er).`
            : result.duplicate
            ? "Identisk shortlist-utkast var allerede lagret."
            : "Shortlist-utkast lagret uten eksterne sideeffekter."}
        </p>
        {summary === "duplicate-aware" && (
          <p className="mt-1 text-emerald-100/80">
            Shortlist {result.shortlistId} · Boliger {result.itemCount}
          </p>
        )}
        <p className="mt-1 text-xs text-emerald-100/70">{shortlistSideEffectText}</p>
      </div>

      {children}
    </div>
  );
}
