"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowRight, BrainCircuit, CheckCircle2, ExternalLink, Loader2, RefreshCw, ShieldCheck } from "lucide-react";
import { buildFreddyBrandChannelState } from "@/lib/brand-channel-brain";
import type { SocialAutopilotRow } from "@/lib/social-autopilot";

type ReadinessPayload = { rows?: SocialAutopilotRow[] };

export default function BrandBrainPage() {
  const [rows, setRows] = useState<SocialAutopilotRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const response = await fetch("/api/marketing/readiness", { cache: "no-store", credentials: "same-origin" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error || `Readiness feilet (${response.status})`);
      setRows((body as ReadinessPayload).rows ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);
  const states = useMemo(() => buildFreddyBrandChannelState(rows), [rows]);
  const connected = states.reduce((sum, state) => sum + state.connectedChannels.length, 0);
  const blocked = states.reduce((sum, state) => sum + state.blockedChannels.length, 0);

  return <main className="mx-auto max-w-[1500px] space-y-6 p-4 sm:p-6">
    <header className="rounded-3xl border border-cyan-900/30 bg-gradient-to-br from-slate-950 via-slate-900 to-cyan-950 p-6 text-white shadow-xl">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.2em] text-cyan-300"><BrainCircuit size={17} /> Brand & Channel Brain</div>
          <h1 className="mt-2 text-3xl font-black">Én identitet per brand. Én sannhet per kanal.</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">Nexus kombinerer den kanoniske brand-registryen med live Marketing Readiness. Strategi og tone kommer fra brandet; faktisk kanalstatus kommer fra tilkoblingssystemet.</p>
        </div>
        <button onClick={() => void load()} disabled={loading} className="inline-flex items-center rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-sm font-black hover:bg-white/10 disabled:opacity-50">{loading ? <Loader2 size={16} className="mr-2 animate-spin" /> : <RefreshCw size={16} className="mr-2" />}Oppdater</button>
      </div>
    </header>

    <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-emerald-950">
      <div className="flex items-start gap-3"><ShieldCheck size={21} className="mt-0.5 shrink-0" /><div><div className="font-black">Privatprofilen er ikke en kommersiell autopilot-kanal</div><p className="mt-1 text-sm leading-6 text-emerald-800">Freddy Bremseth-brandet gjelder den profesjonelle siden og ekspertprofilen. Den private Facebook-profilen skal ikke behandles som automatisert publiseringsdestinasjon.</p></div></div>
    </section>

    {error && <section className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900"><b>Readiness-feil:</b> {error}</section>}

    <section className="grid gap-3 sm:grid-cols-3">
      {[['Profesjonelle Freddy-brands', states.length], ['Tilkoblede kanaler', connected], ['Kanalblokkeringer', blocked]].map(([label, value]) => <div key={String(label)} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="text-xs font-black uppercase tracking-wider text-slate-400">{label}</div><div className="mt-2 text-3xl font-black text-slate-950">{value}</div></div>)}
    </section>

    <section className="grid gap-5 xl:grid-cols-3">
      {states.map((state) => <article key={state.brand.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-start justify-between gap-3"><div><div className="text-xs font-black uppercase tracking-wider text-cyan-700">{state.brand.kind}</div><h2 className="mt-1 text-xl font-black text-slate-950">{state.brand.name}</h2></div><a href={state.brand.website} target="_blank" rel="noreferrer" className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-slate-50" aria-label={`Åpne ${state.brand.name} nettsted`}><ExternalLink size={15} /></a></div>

        <div className="mt-5"><div className="text-xs font-black uppercase tracking-wider text-slate-400">Kanaler</div><div className="mt-2 flex flex-wrap gap-2">{state.brand.plannedChannels.map((channel) => {
          const isConnected = state.connectedChannels.includes(channel);
          const isPilot = state.pilotReadyChannels.includes(channel);
          return <span key={channel} className={`rounded-full border px-2.5 py-1 text-xs font-bold ${isPilot ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : isConnected ? 'border-cyan-200 bg-cyan-50 text-cyan-800' : 'border-slate-200 bg-slate-50 text-slate-500'}`}>{channel}{isPilot ? ' · pilot ready' : isConnected ? ' · connected' : ' · planned'}</span>;
        })}</div></div>

        {state.blockedChannels.length > 0 && <div className="mt-4 space-y-2">{state.blockedChannels.map((item) => <div key={item.platform} className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"><div className="flex items-start gap-2"><AlertTriangle size={16} className="mt-0.5 shrink-0" /><div><b>{item.platform}</b><div className="mt-1 text-xs">{item.reason}</div></div></div></div>)}</div>}
        {state.blockedChannels.length === 0 && state.connectedChannels.length > 0 && <div className="mt-4 flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900"><CheckCircle2 size={16} className="mt-0.5 shrink-0" /><span>Ingen tilkoblet kanal er blokkert akkurat nå.</span></div>}

        <div className="mt-5 grid gap-4">
          <div><div className="text-xs font-black uppercase tracking-wider text-slate-400">Innholdspilarer</div><div className="mt-2 flex flex-wrap gap-1.5">{(state.brand.contentPillars ?? []).map((item) => <span key={item} className="rounded-md bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-700">{item.replaceAll('_', ' ')}</span>)}</div></div>
          <div><div className="text-xs font-black uppercase tracking-wider text-slate-400">Konverteringsmål</div><div className="mt-2 text-sm leading-6 text-slate-700">{(state.brand.conversionGoals ?? []).join(' · ') || '—'}</div></div>
          <div><div className="text-xs font-black uppercase tracking-wider text-slate-400">Primære CTA-er</div><div className="mt-2 text-sm leading-6 text-slate-700">{(state.brand.primaryCtas ?? []).join(' · ') || '—'}</div></div>
          {state.brand.notes && <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs leading-5 text-slate-600">{state.brand.notes}</div>}
        </div>
      </article>)}
    </section>

    <section className="grid gap-3 md:grid-cols-3">
      <Link href="/social-automation" className="rounded-xl border border-slate-200 bg-white p-4 font-black text-slate-900 hover:bg-slate-50">Marketing Autopilot <ArrowRight size={15} className="ml-2 inline" /></Link>
      <Link href="/marketing-readiness" className="rounded-xl border border-slate-200 bg-white p-4 font-black text-slate-900 hover:bg-slate-50">Channel Readiness <ArrowRight size={15} className="ml-2 inline" /></Link>
      <Link href="/brands" className="rounded-xl border border-slate-200 bg-white p-4 font-black text-slate-900 hover:bg-slate-50">Advanced Brands <ArrowRight size={15} className="ml-2 inline" /></Link>
    </section>
  </main>;
}
