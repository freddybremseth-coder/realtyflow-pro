"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";

type Segment = "hot_dormant" | "warm_dormant" | "cold_dormant";

type QueueItem = {
  contact: {
    id: string;
    name?: string | null;
    email?: string | null;
    brandId?: string | null;
    pipelineStatus?: string | null;
    propertyInterest?: string | null;
  };
  buyerProfile: { id: string; version: number } | null;
  assessment: {
    segment: Segment;
    score: number;
    dormantDays: number | null;
    lastMeaningfulEngagementAt: string | null;
    reasons: string[];
    lifestyleSummary: string[];
    inferredQuestions: string[];
  };
  draft: { subject: string; body: string; objective: string } | null;
};

type QueuePayload = {
  generatedAt: string;
  summary: { scanned: number; eligible: number; hot: number; warm: number; cold: number };
  items: QueueItem[];
  warnings?: string[];
};

function segmentLabel(segment: Segment) {
  if (segment === "hot_dormant") return "Hot dormant";
  if (segment === "warm_dormant") return "Warm dormant";
  return "Cold dormant";
}

function segmentClass(segment: Segment) {
  if (segment === "hot_dormant") return "border-rose-200 bg-rose-50 text-rose-800";
  if (segment === "warm_dormant") return "border-amber-200 bg-amber-50 text-amber-800";
  return "border-slate-200 bg-slate-50 text-slate-700";
}

function daysLabel(days: number | null) {
  if (days === null) return "ukjent aktivitet";
  if (days >= 730) return `${Math.floor(days / 365)} år dormant`;
  if (days >= 365) return `${Math.floor(days / 30)} mnd dormant`;
  return `${days} dager dormant`;
}

export default function NexusReactivationPage() {
  const [payload, setPayload] = useState<QueuePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/nexus/reactivation/queue?limit=100", { cache: "no-store" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error || `HTTP ${response.status}`);
      setPayload(body as QueuePayload);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunne ikke laste reaktiveringskø");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const value = useMemo(() => payload?.items || [], [payload]);

  return (
    <main className="mx-auto max-w-[1500px] px-4 py-6 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-xs font-black uppercase tracking-[0.22em] text-cyan-700">Nexus Reactivation Engine</div>
          <h2 className="mt-1 text-3xl font-black tracking-tight text-slate-950">Gamle leads som fortsatt kan bli salg</h2>
          <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-600">
            Rangert dormant-kø basert på faktisk engagement evidence, tidligere pipeline, dokumentert boliginteresse og Buyer Lifestyle Intelligence. Første mål er svar og oppdatert profil — ikke en hard salgsmail.
          </p>
        </div>
        <button onClick={() => void load()} disabled={loading} className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-black text-white disabled:opacity-50">
          {loading ? "Oppdaterer …" : "Oppdater kø"}
        </button>
      </div>

      {error ? <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-800">{error}</div> : null}
      {(payload?.warnings || []).length ? (
        <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          {(payload?.warnings || []).map((warning) => <div key={warning}>• {warning}</div>)}
        </div>
      ) : null}

      <section className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {[
          ["Scannet", payload?.summary.scanned ?? 0],
          ["Reaktiverbare", payload?.summary.eligible ?? 0],
          ["Hot", payload?.summary.hot ?? 0],
          ["Warm", payload?.summary.warm ?? 0],
          ["Cold", payload?.summary.cold ?? 0],
        ].map(([label, number]) => (
          <div key={String(label)} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="text-xs font-black uppercase tracking-wide text-slate-500">{label}</div>
            <div className="mt-2 text-3xl font-black text-slate-950">{number}</div>
          </div>
        ))}
      </section>

      <div className="mt-6 flex items-center justify-between gap-4">
        <div className="text-sm font-bold text-slate-700">Prioritert reaktiveringskø</div>
        <div className="text-xs text-slate-500">Ingen utsending skjer fra denne siden</div>
      </div>

      <section className="mt-3 space-y-3">
        {!loading && !value.length ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">Ingen leads oppfyller dormant-kriteriene akkurat nå.</div>
        ) : null}
        {value.map((item, index) => {
          const open = expanded === item.contact.id;
          return (
            <article key={item.contact.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-black text-slate-400">#{index + 1}</span>
                    <span className={`rounded-full border px-2.5 py-1 text-xs font-black ${segmentClass(item.assessment.segment)}`}>{segmentLabel(item.assessment.segment)}</span>
                    <span className="rounded-full bg-slate-950 px-2.5 py-1 text-xs font-black text-white">Score {item.assessment.score}</span>
                    <span className="text-xs font-bold text-slate-500">{daysLabel(item.assessment.dormantDays)}</span>
                  </div>
                  <h3 className="mt-3 text-xl font-black text-slate-950">{item.contact.name || item.contact.email || "Ukjent lead"}</h3>
                  <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-600">
                    <span>{item.contact.email || "Ingen e-post"}</span>
                    <span>{item.contact.brandId || "Ukjent brand"}</span>
                    <span>{item.contact.pipelineStatus || "Ukjent stage"}</span>
                  </div>
                  {item.contact.propertyInterest ? <p className="mt-3 text-sm font-semibold text-slate-800">Tidligere interesse: {item.contact.propertyInterest}</p> : null}
                  {item.assessment.lifestyleSummary.length ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {item.assessment.lifestyleSummary.map((value) => <span key={value} className="rounded-lg bg-cyan-50 px-2 py-1 text-xs font-bold text-cyan-800">{value}</span>)}
                    </div>
                  ) : null}
                </div>
                <div className="flex gap-2">
                  <Link href={`/customers/${item.contact.id}`} className="rounded-xl border border-slate-300 px-3 py-2 text-xs font-black text-slate-700 hover:bg-slate-50">Customer 360</Link>
                  <button onClick={() => setExpanded(open ? null : item.contact.id)} className="rounded-xl bg-cyan-700 px-3 py-2 text-xs font-black text-white hover:bg-cyan-800">{open ? "Skjul" : "Se reaktiveringsforslag"}</button>
                </div>
              </div>

              {open ? (
                <div className="mt-5 grid gap-4 border-t border-slate-100 pt-5 lg:grid-cols-2">
                  <div>
                    <div className="text-xs font-black uppercase tracking-wide text-slate-500">Hvorfor Nexus prioriterer denne</div>
                    <div className="mt-2 space-y-2 text-sm text-slate-700">
                      {item.assessment.reasons.map((reason) => <div key={reason}>• {reason}</div>)}
                    </div>
                    {item.assessment.inferredQuestions.length ? (
                      <div className="mt-4 rounded-xl bg-slate-50 p-4">
                        <div className="text-xs font-black uppercase tracking-wide text-slate-500">Ting vi bør bekrefte</div>
                        <div className="mt-2 space-y-1 text-sm text-slate-700">{item.assessment.inferredQuestions.map((question) => <div key={question}>• {question}</div>)}</div>
                      </div>
                    ) : null}
                  </div>
                  <div>
                    <div className="text-xs font-black uppercase tracking-wide text-slate-500">Foreslått first-touch draft</div>
                    {item.draft ? (
                      <div className="mt-2 rounded-xl border border-slate-200 bg-slate-50 p-4">
                        <div className="text-sm font-black text-slate-950">{item.draft.subject}</div>
                        <pre className="mt-3 whitespace-pre-wrap font-sans text-sm leading-6 text-slate-700">{item.draft.body}</pre>
                      </div>
                    ) : <div className="mt-2 text-sm text-slate-500">Ingen draft tilgjengelig.</div>}
                  </div>
                </div>
              ) : null}
            </article>
          );
        })}
      </section>
    </main>
  );
}
