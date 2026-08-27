"use client";

import { useEffect, useState } from "react";
import { MapPin } from "lucide-react";

type AreaDimension = {
  key: string;
  outcome: "match" | "unknown" | "conflict";
  evidence: string[];
};

type AreaMatch = {
  areaId: string | null;
  areaName: string;
  score: number;
  confidence: number;
  matched: number;
  unknown: number;
  conflicts: number;
  dimensions: AreaDimension[];
};

type AreaFitResponse = {
  buyerProfile: { id: string; version: number; brand: string } | null;
  lifestyle: {
    preferences: unknown[];
    confirmed: number;
    inferred: number;
    strong?: number;
  };
  areas: AreaMatch[];
};

export function LeadIntelligenceAreaFitPresentationAdvisory({
  contactId,
}: {
  contactId: string | null;
}) {
  const [data, setData] = useState<AreaFitResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!contactId) {
      setData(null);
      setError(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch(`/api/nexus/area-lifestyle-match?contactId=${encodeURIComponent(contactId)}&limit=3`, {
      cache: "no-store",
    })
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body?.error || `HTTP ${response.status}`);
        return body as AreaFitResponse;
      })
      .then((body) => {
        if (!cancelled) setData(body);
      })
      .catch((cause) => {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : "Kunne ikke laste Area Fit");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [contactId]);

  if (!contactId || (!loading && !error && (!data?.buyerProfile || data.lifestyle.preferences.length === 0))) {
    return null;
  }

  return (
    <div className="rounded-lg border border-cyan-500/20 bg-cyan-950/20 p-3">
      <div className="flex items-start gap-2">
        <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-cyan-300" />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-cyan-100">
            Area Fit · rådgivergrunnlag
          </p>
          <p className="mt-1 text-xs text-cyan-100/70">
            Områdesignalene er et separat rådgivningslag. De påvirker ikke hard property eligibility og legges ikke automatisk inn i lagret presentasjon eller e-post.
          </p>
        </div>
      </div>

      {loading && <p className="mt-3 text-xs text-slate-400">Laster Area Fit …</p>}
      {error && <p className="mt-3 text-xs text-amber-200">Area Fit kunne ikke lastes: {error}</p>}

      {!loading && !error && data?.areas?.length ? (
        <div className="mt-3 grid gap-2 lg:grid-cols-3">
          {data.areas.slice(0, 3).map((area) => {
            const evidence = area.dimensions
              .filter((item) => item.outcome === "match" && item.evidence[0])
              .slice(0, 2);
            return (
              <div key={area.areaId || area.areaName} className="rounded-md border border-slate-800 bg-slate-950/60 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="font-medium text-slate-100">{area.areaName}</div>
                  <div className="text-right text-[11px] text-cyan-200">
                    <div className="font-semibold">{area.score}</div>
                    <div>{area.confidence}% dekning</div>
                  </div>
                </div>
                <div className="mt-2 text-[11px] text-slate-400">
                  {area.matched} match · {area.unknown} ukjent · {area.conflicts} konflikt
                </div>
                {evidence.length > 0 && (
                  <ul className="mt-2 space-y-1 text-[11px] text-slate-300">
                    {evidence.map((item) => (
                      <li key={`${area.areaName}-${item.key}`}>• {item.evidence[0]}</li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
