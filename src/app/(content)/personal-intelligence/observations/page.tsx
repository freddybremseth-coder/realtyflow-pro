"use client";

import { useEffect, useMemo, useState } from "react";

type Observation = {
  id: string;
  observation: string;
  category: string | null;
  confidence: number;
  status: "candidate" | "validated" | "promoted" | "rejected" | "expired";
  requires_confirmation: boolean;
  privacy_level: string;
  created_at: string;
  updated_at: string;
};

async function jsonRequest<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, { credentials: "same-origin", cache: "no-store", ...options, headers: { "Content-Type": "application/json", ...(options?.headers || {}) } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.error || `${url} failed (${response.status})`);
  return body as T;
}

export default function ObservationReviewPage() {
  const [observations, setObservations] = useState<Observation[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true); setError(null);
    try {
      const result = await jsonRequest<{ ok: boolean; observations: Observation[] }>("/api/personal-intelligence/observations/review");
      setObservations(result.observations);
    } catch (failure) { setError(failure instanceof Error ? failure.message : String(failure)); }
    finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, []);
  const candidates = useMemo(() => observations.filter((item) => item.status === "candidate"), [observations]);
  const reviewed = useMemo(() => observations.filter((item) => item.status !== "candidate"), [observations]);

  async function review(observationId: string, status: "validated" | "rejected") {
    setSaving(observationId); setError(null);
    try {
      await jsonRequest("/api/personal-intelligence/observations/review", { method: "PATCH", body: JSON.stringify({ observationId, status }) });
      await load();
    } catch (failure) { setError(failure instanceof Error ? failure.message : String(failure)); }
    finally { setSaving(null); }
  }

  return <main className="mx-auto max-w-[1100px] space-y-5 p-4 sm:p-6">
    <header className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="text-xs font-black uppercase tracking-[0.2em] text-violet-700">Observation Review</div>
      <h1 className="mt-2 text-3xl font-black text-slate-950">Review tentative mentor observations.</h1>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">Observations are not facts. Validate means “this is a useful supported observation”, not “make this a canonical claim”. Reject removes it from active consideration while keeping audit history.</p>
    </header>
    {error && <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-900">{error}</div>}
    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between"><h2 className="text-lg font-black">Needs review</h2><span className="text-xs font-bold text-slate-400">{candidates.length}</span></div>
      <div className="mt-4 space-y-3">
        {loading && <div className="text-sm text-slate-500">Loading…</div>}
        {!loading && !candidates.length && <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">No candidate observations need review.</div>}
        {candidates.map((item) => <article key={item.id} className="rounded-2xl border border-slate-200 p-4">
          <div className="text-[10px] font-black uppercase tracking-wide text-slate-400">{item.category || "Observation"} · {Math.round(item.confidence * 100)}% confidence · {item.privacy_level}</div>
          <p className="mt-2 text-sm leading-6 text-slate-800">{item.observation}</p>
          <div className="mt-4 flex gap-2">
            <button disabled={saving === item.id} onClick={() => void review(item.id, "validated")} className="rounded-xl bg-emerald-700 px-3 py-2 text-xs font-black text-white disabled:opacity-40">Validate observation</button>
            <button disabled={saving === item.id} onClick={() => void review(item.id, "rejected")} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-black text-slate-600 disabled:opacity-40">Reject</button>
          </div>
        </article>)}
      </div>
    </section>
    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-black">Reviewed history</h2>
      <div className="mt-4 space-y-2">
        {!reviewed.length && <div className="text-sm text-slate-500">No reviewed observations yet.</div>}
        {reviewed.slice(0, 50).map((item) => <div key={item.id} className="rounded-xl bg-slate-50 p-3"><div className="text-xs font-black uppercase text-slate-400">{item.status}</div><div className="mt-1 text-sm text-slate-700">{item.observation}</div></div>)}
      </div>
    </section>
  </main>;
}
