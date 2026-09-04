"use client";

import { useEffect, useState } from "react";
import { Loader2, RefreshCw, ShieldCheck } from "lucide-react";

type Source = {
  id: string;
  source_type: string;
  source_name?: string | null;
  source_system?: string | null;
  reliability_class?: string | null;
  privacy_level: string;
  source_date?: string | null;
  captured_at: string;
  metadata?: Record<string, unknown> | null;
};

type RecordRow = {
  id: string;
  predicate: string;
  value_text?: string | null;
  claim_type: string;
  status: string;
  confidence: number;
  privacy_level: string;
  source_id?: string | null;
  source_excerpt?: string | null;
  confirmed_at?: string | null;
  updated_at: string;
  source?: Source | null;
};

type ResponseBody = {
  subject: { id: string; display_name: string };
  records: RecordRow[];
  safety: { readOnly: boolean; writesPerformed: number; ownerScoped: boolean; provenanceRequiredForCanonicalInterpretation: boolean };
};

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { credentials: "same-origin", cache: "no-store" });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.error || `${url} failed (${response.status})`);
  return body as T;
}

function pct(value: number) { return `${Math.round(value * 100)}%`; }

export default function MemoryProvenancePage() {
  const [data, setData] = useState<ResponseBody | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true); setError(null);
    try { setData(await getJson<ResponseBody>("/api/personal-intelligence/me/provenance")); }
    catch (failure) { setError(failure instanceof Error ? failure.message : String(failure)); }
    finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, []);

  return <main className="mx-auto max-w-[1100px] space-y-5 p-4 sm:p-6">
    <header className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-xs font-black uppercase tracking-[0.2em] text-sky-700">Memory Provenance</div>
          <h1 className="mt-2 text-3xl font-black text-slate-950">Why does the system believe this?</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">Read-only lineage for stored claims. A claim without source evidence stays visibly source-less; this page never upgrades confidence, status or canonicality.</p>
        </div>
        <button type="button" onClick={() => void load()} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-black text-slate-700"><RefreshCw size={14}/> Refresh</button>
      </div>
    </header>

    {error && <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-900">{error}</div>}
    {loading && !data && <div className="rounded-2xl border border-slate-200 bg-white p-5"><Loader2 className="animate-spin"/></div>}

    {data && <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-xs text-emerald-900">
      <div className="flex items-center gap-2 font-black"><ShieldCheck size={15}/> Read only · owner scoped · writes performed {data.safety.writesPerformed}</div>
    </section>}

    <section className="space-y-3">
      {data && !data.records.length && <div className="rounded-3xl border border-slate-200 bg-white p-6 text-sm text-slate-500">No claims exist yet, so there is no provenance to review.</div>}
      {data?.records.map((record) => <article key={record.id} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-[10px] font-black uppercase tracking-wide text-slate-400">{record.claim_type} · {record.predicate}</div>
            <div className="mt-1 text-sm font-bold text-slate-900">{record.value_text || "(structured value)"}</div>
          </div>
          <div className="text-right text-xs text-slate-500">{record.status} · {record.privacy_level}<br/>confidence {pct(record.confidence)}</div>
        </div>
        <div className="mt-4 rounded-2xl bg-slate-50 p-4">
          <div className="text-[10px] font-black uppercase tracking-wide text-slate-400">Source</div>
          {record.source ? <div className="mt-2 grid gap-2 text-xs text-slate-700 sm:grid-cols-2">
            <div><strong>Name:</strong> {record.source.source_name || "Unnamed source"}</div>
            <div><strong>Type:</strong> {record.source.source_type}</div>
            <div><strong>System:</strong> {record.source.source_system || "Unknown"}</div>
            <div><strong>Reliability:</strong> {record.source.reliability_class || "Unspecified"}</div>
            <div><strong>Source privacy:</strong> {record.source.privacy_level}</div>
            <div><strong>Confirmed:</strong> {record.confirmed_at ? new Date(record.confirmed_at).toLocaleString() : "Not explicitly confirmed"}</div>
          </div> : <div className="mt-2 text-xs font-semibold text-amber-700">No source record is attached to this claim.</div>}
          {record.source_excerpt && <div className="mt-3 border-t border-slate-200 pt-3 text-xs leading-5 text-slate-600"><strong>Source excerpt:</strong> {record.source_excerpt}</div>}
        </div>
      </article>)}
    </section>
  </main>;
}
