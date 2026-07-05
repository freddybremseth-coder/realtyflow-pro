"use client";

type PropertyMatchAlertVariant = "active-profile" | "analysis-preview";

interface LeadIntelligencePropertyMatchAlertsProps {
  variant: PropertyMatchAlertVariant;
  bestEffort: boolean;
  matched: number;
  matchCount: number;
}

export function LeadIntelligencePropertyMatchAlerts({
  variant,
  bestEffort,
  matched,
  matchCount,
}: LeadIntelligencePropertyMatchAlertsProps) {
  return (
    <>
      {bestEffort && (
        <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-100">
          {variant === "active-profile"
            ? "Ingen eiendommer traff alle kravene. Systemet viser de nærmeste alternativene med synlige avvik."
            : "Ingen eiendommer traff alle kravene. Systemet viser derfor de nærmeste alternativene fra eksisterende eiendommer, med avvik og risiko synlig."}
        </p>
      )}

      {variant === "analysis-preview" && !bestEffort && matched === 0 && matchCount > 0 && (
        <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-100">
          Ingen av de valgte eiendommene er aktuelle uten manuell vurdering. Avviste eller usikre treff vises under med forklaring.
        </p>
      )}

      {variant === "analysis-preview" && matchCount > 0 && (
        <p className="rounded-lg border border-slate-800 bg-slate-950/70 p-3 text-xs text-slate-400">
          Systemstatusen viser regelmotorens vurdering. Bruk manuell vurdering for å merke boliger som Freddy vil ta videre, men dette er bare lokalt i previewen og lagres ikke som shortlist.
        </p>
      )}
    </>
  );
}
