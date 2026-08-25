"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Candidate = {
  sourceId: string;
  brandId: string;
  sourceType: string;
  sourceRef: string;
  title: string;
  sourceUrl: string | null;
  score: number;
  channels: string[];
  lastPublishedAt: string | null;
  lastPlannedAt: string | null;
  reasons: string[];
};

type Payload = {
  generatedAt: string;
  policy: { automaticPublishing: boolean; automaticApproval: boolean; maxSelectedPerBrand: number; selectionLimit: number; note: string };
  summary: { readySources: number; eligibleSources: number; selected: number; brandsSelected: number };
  selected: Candidate[];
};

export default function NexusDirectorPage() {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true); setError("");
    try {
      const res = await fetch("/api/nexus/director?limit=10", { cache: "no-store", credentials: "same-origin" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || `Director feilet (${res.status})`);
      setData(body as Payload);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, []);

  return <div className="mx-auto max-w-[1500px] space-y-6 p-6">
    <header className="rounded-3xl border border-violet-900/30 bg-gradient-to-br from-slate-950 via-slate-900 to-violet-950 p-7 text-white shadow-xl">
      <div className="text-xs font-black uppercase tracking-[0.24em] text-violet-300">Nexus OS · Portfolio Automation Director</div>
      <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
        <div><h1 className="text-3xl font-black">Hva bør RealtyFlow markedsføre neste?</h1><p className="mt-2 max-w-4xl text-sm leading-6 text-slate-300">Director prioriterer ekte sources på tvers av books, eiendom, ChatGenius, Doña Anna og creator-brandene. Den velger — men auto-godkjenner eller auto-publiserer ikke.</p></div>
        <div className="flex gap-2"><Link href="/nexus-os" className="rounded-xl border border-white/20 px-4 py-2 text-sm font-bold">Nexus</Link><button onClick={load} disabled={loading} className="rounded-xl bg-violet-300 px-4 py-2 text-sm font-black text-slate-950 disabled:opacity-60">{loading ? "Beregner…" : "Beregn på nytt"}</button></div>
      </div>
    </header>

    {error && <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{error}</div>}

    {data && <>
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4"><div className="text-xs font-bold text-slate-500">READY SOURCES</div><div className="mt-1 text-3xl font-black">{data.summary.readySources}</div></div>
        <div className="rounded-xl border border-slate-200 bg-white p-4"><div className="text-xs font-bold text-slate-500">ELIGIBLE NOW</div><div className="mt-1 text-3xl font-black">{data.summary.eligibleSources}</div></div>
        <div className="rounded-xl border border-slate-200 bg-white p-4"><div className="text-xs font-bold text-slate-500">SELECTED</div><div className="mt-1 text-3xl font-black">{data.summary.selected}</div></div>
        <div className="rounded-xl border border-slate-200 bg-white p-4"><div className="text-xs font-bold text-slate-500">BRANDS</div><div className="mt-1 text-3xl font-black">{data.summary.brandsSelected}</div></div>
      </section>

      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900"><b>Policy:</b> Director velger maksimalt {data.policy.maxSelectedPerBrand} sources per brand. Approval og publisering er separate handlinger.</div>

      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 p-5"><h2 className="text-xl font-black">Neste anbefalte sources</h2><p className="mt-1 text-sm text-slate-500">Prioritert etter business/source-priority, kanaltilkobling, fatigue og siste bruk.</p></div>
        <div className="divide-y divide-slate-100">{data.selected.map((row, index) => <article key={row.sourceId} className="grid gap-4 p-5 lg:grid-cols-[55px_1.6fr_100px_1fr_1.5fr] lg:items-start">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-violet-100 font-black text-violet-800">{index + 1}</div>
          <div><div className="text-[10px] font-black uppercase tracking-wider text-slate-400">{row.brandId} · {row.sourceType}</div><div className="mt-1 font-black text-slate-900">{row.title}</div>{row.sourceUrl && <a href={row.sourceUrl} target="_blank" rel="noreferrer" className="mt-1 block truncate text-xs font-bold text-cyan-700">Åpne source</a>}</div>
          <div><div className="text-[10px] font-bold text-slate-400">SCORE</div><div className="mt-1 text-2xl font-black">{row.score}</div></div>
          <div><div className="text-[10px] font-bold text-slate-400">KANALER</div><div className="mt-2 flex flex-wrap gap-1">{row.channels.map(c => <span key={c} className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold">{c}</span>)}</div></div>
          <div><div className="text-[10px] font-bold text-slate-400">HVORFOR</div><div className="mt-1 text-xs leading-5 text-slate-600">{row.reasons.join(" · ")}</div><Link href="/social-automation" className="mt-2 inline-block text-xs font-black text-violet-700">Gå til campaign flow →</Link></div>
        </article>)}</div>
      </section>
    </>}
  </div>;
}
