"use client";

import type { MatchReviewDecision } from "@/components/lead-intelligence/property-match-display";

const matchReviewOptions: Array<{ value: MatchReviewDecision; label: string }> = [
  { value: "system", label: "Systemforslag" },
  { value: "current", label: "Aktuell" },
  { value: "maybe", label: "Kanskje" },
  { value: "needs_research", label: "Må undersøkes" },
  { value: "rejected", label: "Avvist" },
];

interface LeadIntelligenceMatchReviewSelectProps {
  idPrefix: string;
  propertyId: string;
  value: MatchReviewDecision;
  onChange: (decision: MatchReviewDecision) => void;
}

export function LeadIntelligenceMatchReviewSelect({
  idPrefix,
  propertyId,
  value,
  onChange,
}: LeadIntelligenceMatchReviewSelectProps) {
  const selectId = `${idPrefix}-${propertyId}`;

  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <label htmlFor={selectId} className="text-xs font-semibold text-slate-300">
        Manuell vurdering
      </label>
      <select
        id={selectId}
        value={value}
        onChange={(event) => onChange(event.target.value as MatchReviewDecision)}
        className="h-9 rounded-lg border border-slate-700 bg-slate-950 px-2 text-xs text-slate-100"
      >
        {matchReviewOptions.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}
