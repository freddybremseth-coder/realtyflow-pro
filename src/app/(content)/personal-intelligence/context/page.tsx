"use client";

import { useEffect, useState } from "react";

type Usage = {
  id: string;
  session_id: string;
  schema_name: string;
  resource_type: string;
  resource_id: string | null;
  context_reason: string;
  sensitivity: string;
  source_updated_at: string | null;
  confidence: number | null;
  used_at: string;
};

export default function ContextUsagePage() {
  const [usage, setUsage] = useState<Usage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const response = await fetch("/api/personal-intelligence/context-usage", { credentials: "same-origin", cache: "no-store" });
        const body = await response.json();
        if (!response.ok) throw new Error(body?.error || "Context usage failed");
        setUsage(body.usage || []);
      } catch (failure) {
        setError(failure instanceof Error ? failure.message : String(failure));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return <main className="mx-auto max-w-[1100px] space-y-5 p-4 sm:p-6">
    <header className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="text-xs font-black uppercase tracking-[0.2em] text-sky-700">Context Usage</div>
      <h1 className="mt-2 text-3xl font-black text-slate-950">What personal context did Mentor actually use?</h1>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">This is an audit view of approved personal context resources used in mentor sessions. It shows what was used and why. It does not expose or store hidden chain-of-thought.</p>
    </header>

    {error && <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-900">{error}</div>}

    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between"><h2 className="text-lg font-black">Recent context access</h2><span className="text-xs font-bold text-slate-400">{usage.length}</span></div>
      <div className="mt-4 space-y-3">
        {loading && <div className="text-sm text-slate-500">Loading…</div>}
        {!loading && usage.length === 0 && <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">No personal context usage has been logged yet.</div>}
        {usage.map((item) => <article key={item.id} className="rounded-2xl border border-slate-200 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-[10px] font-black uppercase tracking-wide text-slate-400">{item.schema_name}.{item.resource_type} · {item.sensitivity}</div>
              <div className="mt-2 text-sm font-bold text-slate-900">{item.context_reason}</div>
              <div className="mt-2 text-xs text-slate-500">Session {item.session_id}{item.resource_id ? ` · Resource ${item.resource_id}` : ""}</div>
            </div>
            <div className="text-right text-xs text-slate-500">
              {new Date(item.used_at).toLocaleString()}
              <br />{item.confidence == null ? "confidence unknown" : `confidence ${Math.round(item.confidence * 100)}%`}
            </div>
          </div>
        </article>)}
      </div>
    </section>
  </main>;
}
