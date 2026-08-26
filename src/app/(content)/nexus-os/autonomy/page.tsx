"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Bot, CheckCircle2, Gauge, ShieldCheck, Sparkles } from "lucide-react";
import { autonomyModeSummary, autonomyStages, type AutonomyMode } from "@/lib/autonomy-ux";

type Policy = { action_class: string; mode: AutonomyMode; min_confidence: number; daily_limit: number | null; conditions: Record<string, unknown>; rationale: string };
type Payload = { summary: Record<string, number>; policies: Policy[] };

function badge(mode: AutonomyMode) {
  if (mode === "auto") return "bg-emerald-100 text-emerald-800 border-emerald-200";
  if (mode === "guarded_auto") return "bg-cyan-100 text-cyan-800 border-cyan-200";
  if (mode === "approval") return "bg-amber-100 text-amber-800 border-amber-200";
  return "bg-rose-100 text-rose-800 border-rose-200";
}

export default function NexusAutonomyPage() {
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState("");
  const [selectedMode, setSelectedMode] = useState<AutonomyMode | null>(null);

  useEffect(() => {
    fetch("/api/nexus/autonomy", { cache: "no-store", credentials: "same-origin" })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body?.error || "Feil");
        return body;
      })
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  const policies = useMemo(() => {
    const rows = data?.policies ?? [];
    return selectedMode ? rows.filter((policy) => policy.mode === selectedMode) : rows;
  }, [data, selectedMode]);

  const lifecycle = autonomyStages(selectedMode ?? "approval");

  return <main className="mx-auto max-w-[1500px] space-y-6 p-4 sm:p-6">
    <header className="rounded-3xl border border-emerald-900/30 bg-gradient-to-br from-slate-950 via-slate-900 to-emerald-950 p-7 text-white shadow-xl">
      <div className="text-xs font-black uppercase tracking-[0.24em] text-emerald-300">Nexus OS · Autonomy</div>
      <h1 className="mt-2 text-3xl font-black">Hva får Nexus gjøre uten deg?</h1>
      <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-300">Policyene under er den autoritative sikkerhetsmodellen. Denne siden oversetter dem til den samme arbeidsflyten som resten av RealtyFlow: Suggest → Prepare → Approval → Execute → Auto.</p>
    </header>

    {error && <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800"><div className="flex gap-2"><AlertTriangle size={18} className="mt-0.5" /><span>{error}</span></div></div>}

    {data && <>
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {(["auto", "guarded_auto", "approval", "blocked"] as AutonomyMode[]).map((mode) => (
          <button key={mode} onClick={() => setSelectedMode(selectedMode === mode ? null : mode)} className={`rounded-2xl border p-5 text-left transition ${selectedMode === mode ? "border-slate-950 bg-slate-950 text-white" : "border-slate-200 bg-white hover:border-slate-300"}`}>
            <div className="flex items-center justify-between gap-3"><span className="text-xs font-black uppercase tracking-wider">{mode.replaceAll("_", " ")}</span><Gauge size={18} className={selectedMode === mode ? "text-cyan-300" : "text-cyan-700"} /></div>
            <div className="mt-3 text-3xl font-black">{data.summary[mode] ?? 0}</div>
            <div className={`mt-2 text-xs leading-5 ${selectedMode === mode ? "text-slate-300" : "text-slate-500"}`}>{autonomyModeSummary(mode)}</div>
          </button>
        ))}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
          <div><div className="text-xs font-black uppercase tracking-wider text-slate-400">Autonomy ladder</div><h2 className="mt-1 text-xl font-black text-slate-950">Suggest → Prepare → Approval → Execute → Auto</h2></div>
          <div className="text-xs text-slate-500">{selectedMode ? `Viser ${selectedMode.replaceAll("_", " ")}` : "Velg en mode over for å se nøyaktig grense"}</div>
        </div>
        <div className="mt-5 grid gap-3 md:grid-cols-5">
          {lifecycle.map((stage) => <div key={stage.id} className={`rounded-2xl border p-4 ${stage.enabled ? "border-emerald-200 bg-emerald-50" : "border-slate-200 bg-slate-50 opacity-65"}`}>
            <div className="flex items-center gap-2">{stage.enabled ? <CheckCircle2 size={17} className="text-emerald-700" /> : <ShieldCheck size={17} className="text-slate-400" />}<div className="font-black text-slate-950">{stage.label}</div></div>
            <div className="mt-2 text-xs leading-5 text-slate-600">{stage.description}</div>
          </div>)}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-200 p-5 lg:flex-row lg:items-end lg:justify-between">
          <div><div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-slate-400"><Sparkles size={15} /> Policy registry</div><h2 className="mt-1 text-xl font-black text-slate-950">Hva Nexus faktisk får gjøre</h2></div>
          {selectedMode && <button onClick={() => setSelectedMode(null)} className="text-xs font-black text-cyan-700">Vis alle policies</button>}
        </div>
        <div className="overflow-x-auto"><table className="w-full min-w-[1000px] text-sm"><thead className="bg-slate-50 text-left text-xs uppercase text-slate-500"><tr><th className="p-4">Handling</th><th className="p-4">Mode</th><th className="p-4">Hva det betyr</th><th className="p-4">Confidence</th><th className="p-4">Daglig tak</th><th className="p-4">Hvorfor</th></tr></thead><tbody>{policies.map((policy) => <tr key={policy.action_class} className="border-t border-slate-100 align-top"><td className="p-4 font-black text-slate-900">{policy.action_class.replaceAll("_", " ")}</td><td className="p-4"><span className={`rounded-full border px-2 py-1 text-[10px] font-black uppercase ${badge(policy.mode)}`}>{policy.mode.replaceAll("_", " ")}</span></td><td className="max-w-sm p-4 text-slate-600">{autonomyModeSummary(policy.mode)}</td><td className="p-4 font-bold">{Math.round(Number(policy.min_confidence) * 100)}%</td><td className="p-4">{policy.daily_limit ?? "—"}</td><td className="max-w-lg p-4 text-slate-600">{policy.rationale}</td></tr>)}</tbody></table></div>
      </section>

      <section className="rounded-2xl border border-cyan-200 bg-cyan-50 p-5 text-sm text-cyan-950">
        <div className="flex gap-3"><Bot size={20} className="mt-0.5 shrink-0" /><div><div className="font-black">Progressiv autonomi</div><div className="mt-1 leading-6">RealtyFlow kan senere flytte en handling fra Approval til Guarded Auto eller Auto, men bare ved eksplisitt policyendring. Denne UX-en endrer ingen policy og gir aldri Nexus mer tilgang enn backend allerede tillater.</div></div></div>
      </section>
    </>}
  </main>;
}
