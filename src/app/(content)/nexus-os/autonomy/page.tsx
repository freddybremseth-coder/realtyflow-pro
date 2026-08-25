"use client";

import { useEffect, useState } from "react";

type Policy = { action_class: string; mode: string; min_confidence: number; daily_limit: number | null; conditions: Record<string, unknown>; rationale: string };
type Payload = { summary: Record<string, number>; policies: Policy[] };

export default function NexusAutonomyPage() {
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { fetch("/api/nexus/autonomy", { cache: "no-store", credentials: "same-origin" }).then(async r => { const b = await r.json(); if (!r.ok) throw new Error(b?.error || "Feil"); return b; }).then(setData).catch(e => setError(e instanceof Error ? e.message : String(e))); }, []);
  return <div className="mx-auto max-w-[1500px] space-y-6 p-6">
    <header className="rounded-3xl border border-emerald-900/30 bg-gradient-to-br from-slate-950 via-slate-900 to-emerald-950 p-7 text-white shadow-xl"><div className="text-xs font-black uppercase tracking-[0.24em] text-emerald-300">Nexus OS · 24/7 Autonomy</div><h1 className="mt-2 text-3xl font-black">Hva får systemet gjøre uten deg?</h1><p className="mt-2 max-w-4xl text-sm leading-6 text-slate-300">Nexus styrer autonome handlinger etter confidence, rate limits og eksplisitte risikogrenser. Målet er mest mulig arbeid 24/7 uten at systemet blir spammy, lover noe feil eller bruker penger ukontrollert.</p></header>
    {error && <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{error}</div>}
    {data && <>
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{["auto","guarded_auto","approval","blocked"].map(k => <div key={k} className="rounded-xl border border-slate-200 bg-white p-4"><div className="text-xs font-bold uppercase text-slate-500">{k.replaceAll("_"," ")}</div><div className="mt-1 text-3xl font-black">{data.summary[k] ?? 0}</div></div>)}</section>
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="overflow-x-auto"><table className="w-full min-w-[900px] text-sm"><thead className="bg-slate-50 text-left text-xs uppercase text-slate-500"><tr><th className="p-4">Handling</th><th className="p-4">Mode</th><th className="p-4">Confidence</th><th className="p-4">Daglig tak</th><th className="p-4">Hvorfor</th></tr></thead><tbody>{data.policies.map(p => <tr key={p.action_class} className="border-t border-slate-100"><td className="p-4 font-black text-slate-900">{p.action_class.replaceAll("_"," ")}</td><td className="p-4"><span className={`rounded-full px-2 py-1 text-[10px] font-black uppercase ${p.mode === "auto" ? "bg-emerald-100 text-emerald-800" : p.mode === "guarded_auto" ? "bg-cyan-100 text-cyan-800" : p.mode === "approval" ? "bg-amber-100 text-amber-800" : "bg-rose-100 text-rose-800"}`}>{p.mode.replaceAll("_"," ")}</span></td><td className="p-4">{Math.round(Number(p.min_confidence) * 100)}%</td><td className="p-4">{p.daily_limit ?? "—"}</td><td className="p-4 text-slate-600">{p.rationale}</td></tr>)}</tbody></table></div></section>
    </>}
  </div>;
}
