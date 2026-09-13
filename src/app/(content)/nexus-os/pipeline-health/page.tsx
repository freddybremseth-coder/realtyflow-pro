"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowRight, Bot, CirclePause, Filter, Flame, Loader2, RefreshCw, Route, ShieldCheck, UserRoundCheck } from "lucide-react";
import type { PipelineHealthOwner, PipelineHealthSnapshot } from "@/lib/nexus/pipeline-health";

type Payload = { pipelineHealth: PipelineHealthSnapshot | null; warnings?: string[]; error?: string; note?: string };

function ownerClass(owner: PipelineHealthOwner) {
  if (owner === "FREDDY") return "bg-amber-100 text-amber-900";
  if (owner === "NEXUS") return "bg-cyan-100 text-cyan-900";
  if (owner === "CUSTOMER") return "bg-violet-100 text-violet-900";
  return "bg-slate-100 text-slate-800";
}

function severityClass(severity: string) {
  if (severity === "CRITICAL") return "border-rose-300 bg-rose-50";
  if (severity === "HIGH") return "border-amber-300 bg-amber-50";
  if (severity === "MEDIUM") return "border-cyan-200 bg-cyan-50";
  return "border-slate-200 bg-white";
}

export default function PipelineHealthPage() {
  const [data, setData] = useState<PipelineHealthSnapshot | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [ownerFilter, setOwnerFilter] = useState<"ALL" | PipelineHealthOwner>("ALL");
  const [brandFilter, setBrandFilter] = useState("ALL");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/nexus/pipeline-health", { cache: "no-store", credentials: "same-origin" });
      const body = await response.json().catch(() => ({})) as Payload;
      if (!response.ok) throw new Error(body.error || "Kunne ikke lese pipeline health.");
      setData(body.pipelineHealth);
      setWarnings(body.warnings || []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const visible = useMemo(() => {
    if (!data) return [];
    return data.leads.filter((lead) => (ownerFilter === "ALL" || lead.owner === ownerFilter) && (brandFilter === "ALL" || lead.brand === brandFilter));
  }, [data, ownerFilter, brandFilter]);

  return (
    <main className="mx-auto max-w-[1500px] space-y-6 p-4 sm:p-6">
      <header className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.2em] text-cyan-700"><Route size={16}/> Nexus Lead Journey Monitor</div>
            <h1 className="mt-2 text-3xl font-black text-slate-950">Se nøyaktig hvor hvert lead stopper</h1>
            <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-600">Read-only observability over CRM → Buyer Profile → matching → shortlist → presentasjon → meldingsgodkjenning → preflight → sending → kundesvar. Målet er å skille det Nexus kan gjøre selv fra det Freddy faktisk må vurdere.</p>
          </div>
          <div className="flex gap-2">
            <Link href="/nexus-os/pipeline-daily" className="inline-flex items-center rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-black text-slate-800 hover:bg-slate-50">Pipeline Movement</Link>
            <button onClick={() => void load()} disabled={loading} className="inline-flex items-center rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-black text-white disabled:opacity-60">{loading ? <Loader2 size={16} className="mr-2 animate-spin"/> : <RefreshCw size={16} className="mr-2"/>}Oppdater</button>
          </div>
        </div>
      </header>

      {error && <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-950"><AlertTriangle size={17} className="mr-2 inline"/>{error}</div>}
      {warnings.map((warning) => <div key={warning} className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{warning}</div>)}

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
        <Metric label="Aktive leads" value={data?.summary.activeLeads ?? 0}/>
        <Metric label="Blokkert" value={data?.summary.blocked ?? 0}/>
        <Metric label="Freddy review" value={data?.summary.humanReview ?? 0}/>
        <Metric label="Nexus-kø" value={data?.summary.automationQueue ?? 0}/>
        <Metric label="Venter kunde" value={data?.summary.waitingCustomer ?? 0}/>
        <Metric label="Klar send" value={data?.summary.readyToSend ?? 0}/>
        <Metric label="Hot leads" value={data?.summary.hotLeads ?? 0}/>
        <Metric label="Datakvalitet" value={data?.summary.dataQuality ?? 0}/>
      </section>

      {data && <section className="grid gap-4 xl:grid-cols-[1.35fr_1fr]">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center gap-2"><AlertTriangle size={17}/><h2 className="font-black text-slate-950">Flaskehalser</h2></div>
          <div className="grid gap-3 md:grid-cols-2">
            {data.bottlenecks.map((item) => <div key={item.code} className={`rounded-xl border p-4 ${severityClass(item.severity)}`}><div className="flex items-start justify-between gap-3"><div><div className="font-black text-slate-950">{item.label}</div><div className="mt-1 text-xs text-slate-600">{item.code}</div></div><div className="text-2xl font-black text-slate-950">{item.count}</div></div><div className="mt-3 text-sm text-slate-700">{item.explanation}</div><div className="mt-3"><span className={`rounded-full px-2.5 py-1 text-[10px] font-black ${ownerClass(item.owner)}`}>{item.owner}</span></div></div>)}
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="mb-4 flex items-center gap-2"><Bot size={17}/><h2 className="font-black text-slate-950">Per merkevare</h2></div><div className="space-y-2">{data.byBrand.map((row) => <button key={row.brand} onClick={() => setBrandFilter(row.brand)} className="w-full rounded-xl border border-slate-200 p-3 text-left hover:bg-slate-50"><div className="flex items-center justify-between"><span className="font-black text-slate-900">{row.brand}</span><span className="font-black">{row.activeLeads}</span></div><div className="mt-1 text-xs text-slate-500">{row.blocked} blokkert · {row.humanReview} Freddy · {row.automationQueue} Nexus · {row.readyToSend} klar send</div></button>)}</div></div>
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-sm text-emerald-950"><ShieldCheck size={17} className="mr-2 inline"/><b>Observability only:</b> Monitoren sender ingenting og endrer ingen CRM-, Buyer Profile- eller pipeline-data.</div>
        </div>
      </section>}

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div><div className="flex items-center gap-2"><Filter size={17}/><h2 className="font-black text-slate-950">Lead-kø</h2></div><p className="mt-1 text-sm text-slate-500">Hot leads og kritiske blokker vises først. Filtrer på ansvar for å se hva Freddy, Nexus eller kunden holder igjen.</p></div>
          <div className="flex flex-wrap gap-2">
            {(["ALL", "FREDDY", "NEXUS", "CUSTOMER", "SYSTEM"] as const).map((owner) => <button key={owner} onClick={() => setOwnerFilter(owner)} className={`rounded-full px-3 py-2 text-xs font-black ${ownerFilter === owner ? "bg-slate-950 text-white" : "bg-slate-100 text-slate-700"}`}>{owner}</button>)}
            {brandFilter !== "ALL" && <button onClick={() => setBrandFilter("ALL")} className="rounded-full bg-cyan-100 px-3 py-2 text-xs font-black text-cyan-900">{brandFilter} ×</button>}
          </div>
        </div>

        <div className="mt-5 space-y-3">
          {visible.map((lead) => <article key={lead.contactId} className={`rounded-2xl border p-4 ${severityClass(lead.severity)}`}><div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between"><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2 text-[10px] font-black uppercase tracking-wider text-slate-500"><span>{lead.pipelineStage}</span><span>·</span><span>{lead.brand}</span>{lead.hotLead && <span className="rounded-full bg-rose-100 px-2 py-1 text-rose-800"><Flame size={11} className="mr-1 inline"/>HOT</span>}<span className={`rounded-full px-2 py-1 ${ownerClass(lead.owner)}`}>{lead.owner}</span></div><h3 className="mt-2 text-lg font-black text-slate-950">{lead.name}</h3><div className="mt-1 text-xs text-slate-500">{lead.email || "ingen e-post"}</div><div className="mt-3 rounded-xl bg-white/70 p-3"><div className="font-black text-slate-900">{lead.reasonLabel}</div><div className="mt-1 text-sm text-slate-600">{lead.explanation}</div></div></div><Link href={lead.href} className="inline-flex shrink-0 items-center rounded-xl bg-slate-950 px-3 py-2 text-sm font-black text-white">Åpne kunde <ArrowRight size={14} className="ml-2"/></Link></div></article>)}
          {!loading && data && visible.length === 0 && <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500"><CirclePause className="mx-auto mb-2"/>Ingen leads matcher dette filteret.</div>}
        </div>
      </section>

      {data && <section className="grid gap-4 lg:grid-cols-2"><div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="mb-3 flex items-center gap-2"><UserRoundCheck size={17}/><h2 className="font-black text-slate-950">Pipeline-steg</h2></div><div className="flex flex-wrap gap-2">{data.byPipelineStage.map((row) => <span key={row.stage} className="rounded-full bg-slate-100 px-3 py-2 text-xs font-black text-slate-700">{row.stage} · {row.count}</span>)}</div></div><div className="rounded-2xl border border-cyan-200 bg-cyan-50 p-5 text-sm text-cyan-950"><Bot size={17} className="mr-2 inline"/><b>Neste mål:</b> Flytt stadig flere saker fra Freddy-review og blokkert til Nexus-kø, klar send eller planlagt venting — uten å senke governance.</div></section>}
    </main>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="text-2xl font-black text-slate-950">{value}</div><div className="text-xs font-semibold text-slate-500">{label}</div></div>;
}
