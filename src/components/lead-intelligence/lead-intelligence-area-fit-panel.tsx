"use client";

import { useEffect, useState } from "react";

type Dimension = {
  key: string;
  outcome: "match" | "unknown" | "conflict";
  score: number;
  strength: string;
  confirmed: boolean;
  evidence: string[];
  reason: string;
};

type AreaMatch = {
  areaId: string | null;
  areaName: string;
  score: number;
  confidence: number;
  matched: number;
  unknown: number;
  conflicts: number;
  dimensions: Dimension[];
};

type AreaFitResponse = {
  contactId: string;
  buyerProfile: { id: string; version: number; brand: string; approvedAt?: string | null } | null;
  lifestyle: {
    preferences: unknown[];
    confirmed: number;
    inferred: number;
    strong?: number;
    hasVerifiedLifestyleEvidence?: boolean;
  };
  areas: AreaMatch[];
  reason?: string;
};

export function LeadIntelligenceAreaFitPanel({ contactId }: { contactId: string | null }) {
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

    fetch(`/api/nexus/area-lifestyle-match?contactId=${encodeURIComponent(contactId)}`, { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body?.error || `HTTP ${response.status}`);
        return body as AreaFitResponse;
      })
      .then((body) => {
        if (!cancelled) setData(body);
      })
      .catch((cause) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "Kunne ikke laste Area Fit");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [contactId]);

  if (!contactId) {
    return (
      <div className="mt-4 rounded-lg border border-slate-700 bg-slate-900/60 p-4 text-xs text-slate-400">
        Koble Buyer Profile til en CRM-kontakt for å beregne Area Fit fra godkjente lifestyle-kriterier.
      </div>
    );
  }

  if (loading) {
    return <div className="mt-4 rounded-lg border border-slate-700 bg-slate-900/60 p-4 text-xs text-slate-400">Laster Area Fit …</div>;
  }

  if (error) {
    return <div className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-xs text-amber-100">Area Fit kunne ikke lastes: {error}</div>;
  }

  if (!data?.buyerProfile) {
    return (
      <div className="mt-4 rounded-lg border border-slate-700 bg-slate-900/60 p-4 text-xs text-slate-400">
        {data?.reason || "Ingen godkjent Buyer Profile er tilgjengelig for denne kontakten ennå."}
      </div>
    );
  }

  const lifestyleTotal = Array.isArray(data.lifestyle.preferences) ? data.lifestyle.preferences.length : 0;
  if (lifestyleTotal === 0) {
    return (
      <div className="mt-4 rounded-lg border border-slate-700 bg-slate-900/60 p-4 text-xs text-slate-400">
        Ingen godkjente lifestyle-kriterier er tilgjengelige for Area Fit ennå.
      </div>
    );
  }

  const topAreas = data.areas.slice(0, 5);

  return (
    <section className="mt-4 rounded-lg border border-cyan-500/20 bg-cyan-950/20 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-cyan-100">Area Fit</h3>
          <p className="mt-1 max-w-3xl text-xs text-cyan-100/70">
            Områdene rangeres separat fra boligkrav. Manglende områdedata blir vist som ukjent, ikke som negativ match.
          </p>
        </div>
        <div className="text-right text-[11px] text-cyan-100/70">
          Buyer Profile v{data.buyerProfile.version} · {data.lifestyle.confirmed}/{lifestyleTotal} bekreftet
        </div>
      </div>

      {!topAreas.length ? (
        <div className="mt-4 rounded-lg border border-slate-700 bg-slate-950/70 p-3 text-xs text-slate-400">
          Ingen area profiles er tilgjengelige for {data.buyerProfile.brand} ennå.
        </div>
      ) : (
        <div className="mt-4 grid gap-3 xl:grid-cols-2">
          {topAreas.map((area) => (
            <article key={area.areaId || area.areaName} className="rounded-lg border border-slate-700/70 bg-slate-950/70 p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="font-semibold text-slate-100">{area.areaName}</div>
                <div className="text-right">
                  <div className="text-lg font-bold text-cyan-200">{area.score}</div>
                  <div className="text-[10px] uppercase tracking-wide text-slate-500">score</div>
                </div>
              </div>
              <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
                <span className="rounded-full bg-emerald-500/10 px-2 py-1 text-emerald-200">{area.matched} match</span>
                <span className="rounded-full bg-slate-700/50 px-2 py-1 text-slate-300">{area.unknown} ukjent</span>
                <span className="rounded-full bg-rose-500/10 px-2 py-1 text-rose-200">{area.conflicts} konflikt</span>
                <span className="rounded-full bg-cyan-500/10 px-2 py-1 text-cyan-200">{area.confidence}% dekning</span>
              </div>

              <div className="mt-3 space-y-2">
                {area.dimensions.filter((item) => item.outcome !== "unknown").slice(0, 3).map((item) => (
                  <div key={item.key} className="rounded-md border border-slate-800 bg-slate-900/80 p-2 text-[11px]">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-slate-200">{item.key.replaceAll("_", " ")}</span>
                      <span className={item.outcome === "match" ? "text-emerald-300" : "text-rose-300"}>{item.outcome}</span>
                    </div>
                    {item.evidence[0] ? <div className="mt-1 text-slate-500">{item.evidence[0]}</div> : null}
                  </div>
                ))}
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
