"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AlertTriangle, ArrowRight, Bot, RefreshCw, ShieldCheck, Siren, UserRoundCheck } from "lucide-react";
import type { PipelineHealthSnapshot } from "@/lib/nexus/pipeline-health";

type Payload = { pipelineHealth: PipelineHealthSnapshot | null; warnings?: string[]; error?: string };

function severityClass(severity: string) {
  if (severity === "CRITICAL") return "border-red-800/60 bg-red-950/25 text-red-100";
  if (severity === "HIGH") return "border-amber-800/60 bg-amber-950/20 text-amber-100";
  return "border-slate-800 bg-slate-950/35 text-slate-200";
}

export function PipelineHealthPanel() {
  const [data, setData] = useState<PipelineHealthSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/nexus/pipeline-health", { cache: "no-store", credentials: "same-origin" });
      const body = await response.json().catch(() => ({})) as Payload;
      if (!response.ok) throw new Error(body.error || "Kunne ikke lese Lead Journey Monitor.");
      setData(body.pipelineHealth);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold text-cyan-300"><Siren size={17}/> Lead Journey Monitor</div>
          <h2 className="mt-1 text-xl font-semibold text-slate-100">Hvor stopper salget akkurat nå?</h2>
          <p className="mt-1 max-w-3xl text-sm text-slate-400">Read-only kontroll av CRM → Buyer Profile → matching → shortlist → presentasjon → preflight → sending → kundesvar.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => void load()} disabled={loading} className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-800 disabled:opacity-50"><RefreshCw size={14} className={loading ? "animate-spin" : ""}/>Oppdater</button>
          <Link href="/nexus-os/pipeline-health" className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-3 py-2 text-xs font-semibold text-white hover:bg-primary-500">Åpne monitor <ArrowRight size={14}/></Link>
        </div>
      </div>

      {error && <div className="mt-4 rounded-xl border border-red-800/60 bg-red-950/30 p-3 text-sm text-red-200"><AlertTriangle size={15} className="mr-2 inline"/>{error}</div>}

      {data && (
        <>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
            {[
              ["Aktive leads", data.summary.activeLeads],
              ["Blokkert", data.summary.blocked],
              ["Freddy review", data.summary.humanReview],
              ["Nexus-kø", data.summary.automationQueue],
              ["Venter kunde", data.summary.waitingCustomer],
              ["Klar send", data.summary.readyToSend],
              ["Hot leads", data.summary.hotLeads],
            ].map(([label, value]) => <div key={String(label)} className="rounded-xl border border-slate-800 bg-slate-950/50 p-3"><div className="text-xl font-bold text-slate-100">{value}</div><div className="mt-1 text-[11px] text-slate-500">{label}</div></div>)}
          </div>

          <div className="mt-5 grid gap-4 xl:grid-cols-[1.4fr_1fr]">
            <div>
              <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-200"><AlertTriangle size={15}/> Største flaskehalser</div>
              <div className="space-y-2">
                {data.bottlenecks.slice(0, 5).map((item) => (
                  <div key={item.code} className={`rounded-xl border p-3 ${severityClass(item.severity)}`}>
                    <div className="flex items-center justify-between gap-3"><div className="font-semibold">{item.label}</div><div className="text-lg font-bold">{item.count}</div></div>
                    <div className="mt-1 text-xs opacity-70">{item.owner} · {item.explanation}</div>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-200"><Bot size={15}/> Ansvarsdeling</div>
              <div className="space-y-2 text-sm">
                <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-3"><UserRoundCheck size={15} className="mr-2 inline text-amber-300"/><b>Freddy:</b> {data.summary.humanReview} saker krever vurdering.</div>
                <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-3"><Bot size={15} className="mr-2 inline text-cyan-300"/><b>Nexus:</b> {data.summary.automationQueue + data.summary.readyToSend} saker kan flyttes videre av styrt automasjon.</div>
                <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-3"><ShieldCheck size={15} className="mr-2 inline text-emerald-300"/>Ingen CRM- eller kundedata endres av denne monitoren.</div>
              </div>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
