"use client";

import Link from "next/link";
import { Customer360Link } from "@/components/crm/customer-360-link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, CircleGauge, Loader2, RefreshCw, ShieldCheck } from "lucide-react";

type HealthStatus = "HEALTHY" | "NEEDS_ATTENTION" | "BLOCKED";
type Health = { status: HealthStatus; score: number; blockers: string[]; warnings: string[] };
type Item = {
  status: HealthStatus; priority: "HIGH" | "MEDIUM" | "LOW";
  customer: { id: string; name: string; email: string | null; brand: string | null; pipelineStatus: string; pipelineValue: number; propertyInterest: string | null };
  profile: { id: string; version: number; purchaseReadiness: string; budgetAmount: number | null; budgetCurrency: string; summary: string | null; updatedAt: string | null };
  profileHealth: Health & { completeness: number; evidenceQuality: number; freshnessDays: number | null; missing: string[]; conflicts: string[] };
  matchHealth: Health & { candidates: number; eligible: number; strong: number; clientReady: number; needsReview: number; bestScore: number | null; averageDataQuality: number | null };
  shortlist: { id: string; status: string; updatedAt: string | null } | null;
  candidates: Array<{ id: string; reference: string | null; title: string | null; location: string | null; score: number; dataQualityScore: number; reviewStatus: string }>;
  profileHref: string; customerHref: string; reviewHref: string;
};
type Payload = { summary?: { activeCustomers: number; approvedProfiles: number; missingApprovedProfile: number; blocked: number; needsAttention: number; healthy: number; clientReadyCandidates: number }; items?: Item[]; error?: string };

const LABEL: Record<HealthStatus, string> = { HEALTHY: "Frisk", NEEDS_ATTENTION: "Må følges opp", BLOCKED: "Blokkert" };
function tone(status: HealthStatus) {
  return status === "HEALTHY" ? "border-emerald-200 bg-emerald-50 text-emerald-900" : status === "BLOCKED" ? "border-rose-200 bg-rose-50 text-rose-950" : "border-amber-200 bg-amber-50 text-amber-950";
}
function money(value: number | null, currency: string) {
  return value === null ? "Mangler" : new Intl.NumberFormat("nb-NO", { style: "currency", currency, maximumFractionDigits: 0 }).format(value);
}

export default function BuyerProfileHealthPage() {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<"ALL" | HealthStatus>("ALL");
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/nexus/buyer-profile-health", { cache: "no-store", credentials: "same-origin" });
      const body = await response.json() as Payload;
      if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`);
      setData(body);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Kunne ikke laste profilhelse.");
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  const items = useMemo(() => (data?.items || []).filter((item) => filter === "ALL" || item.status === filter), [data, filter]);

  return <main className="mx-auto max-w-[1500px] space-y-6 px-4 py-6 sm:px-6 sm:py-8">
    <header className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4"><div>
        <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.2em] text-violet-700"><CircleGauge size={17}/> Buyer Profile Health + Match Quality</div>
        <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-950">Se hvor kjøperreisen mister kvalitet</h1>
        <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-600">Kanonisk, skrivebeskyttet helse fra godkjent Buyer Profile til siste shortlist. Profilhull, evidenskonflikter, gamle kriterier, svak match og manglende kvalitetsreview vises før de blir kundefeil.</p>
      </div><button onClick={() => void load()} disabled={loading} className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-black text-white disabled:opacity-50"><RefreshCw size={16} className={loading ? "animate-spin" : ""}/>Oppdater</button></div>
      <div className="mt-6 grid gap-3 sm:grid-cols-4 lg:grid-cols-7">
        {[
          ["Aktive kunder", data?.summary?.activeCustomers || 0], ["Godkjente profiler", data?.summary?.approvedProfiles || 0],
          ["Uten profil", data?.summary?.missingApprovedProfile || 0], ["Blokkert", data?.summary?.blocked || 0],
          ["Må følges opp", data?.summary?.needsAttention || 0], ["Friske", data?.summary?.healthy || 0],
          ["Kundeklare boliger", data?.summary?.clientReadyCandidates || 0],
        ].map(([label, value]) => <div key={String(label)} className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><div className="text-2xl font-black text-slate-950">{value}</div><div className="mt-1 text-xs font-bold text-slate-500">{label}</div></div>)}
      </div>
    </header>

    {error && <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-900"><AlertTriangle size={17} className="mr-2 inline"/>{error}</div>}
    <div className="flex gap-2 overflow-x-auto">{(["ALL", "BLOCKED", "NEEDS_ATTENTION", "HEALTHY"] as const).map((value) => <button key={value} onClick={() => setFilter(value)} className={`whitespace-nowrap rounded-full border px-3 py-2 text-xs font-black ${filter === value ? "border-violet-700 bg-violet-700 text-white" : "border-slate-200 bg-white text-slate-700"}`}>{value === "ALL" ? "Alle" : LABEL[value]}</button>)}</div>
    {loading && <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm font-bold text-slate-600"><Loader2 size={18} className="mr-2 inline animate-spin"/>Beregner profil- og matchhelse…</div>}
    {!loading && items.length === 0 && <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-8 text-center text-sm font-bold text-emerald-900"><CheckCircle2 size={17} className="mr-2 inline"/>Ingen saker i dette filteret.</div>}

    <section className="space-y-5">{items.map((item) => <article key={item.profile.id} className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 p-5 sm:p-6"><div>
        <div className="flex flex-wrap items-center gap-2"><span className={`rounded-full border px-2.5 py-1 text-[10px] font-black uppercase ${tone(item.status)}`}>{LABEL[item.status]}</span><span className="text-xs font-bold text-slate-500">{item.customer.brand} · {item.customer.pipelineStatus}</span></div>
        <h2 className="mt-3 text-xl font-black text-slate-950"><Customer360Link contactId={item.customer.id} name={item.customer.name} className="text-slate-950 underline decoration-violet-400 underline-offset-4 hover:text-violet-700" /></h2><p className="mt-1 text-xs text-slate-500">{item.customer.email || "Ingen e-post"} · {item.customer.propertyInterest || "Ingen registrert boliginteresse"}</p>
      </div><div className="flex gap-3"><Score label="Profil" value={item.profileHealth.score}/><Score label="Match" value={item.matchHealth.score}/></div></div>

      <div className="grid gap-4 p-5 lg:grid-cols-2 sm:p-6">
        <section className="rounded-2xl border border-slate-200 p-4"><div className="text-xs font-black uppercase tracking-wide text-slate-500">Buyer Profile v{item.profile.version}</div>
          <div className="mt-3 grid grid-cols-3 gap-3"><Metric label="Komplett" value={`${item.profileHealth.completeness}%`}/><Metric label="Evidens" value={`${item.profileHealth.evidenceQuality}%`}/><Metric label="Ferskhet" value={item.profileHealth.freshnessDays === null ? "Ukjent" : `${item.profileHealth.freshnessDays} d`}/></div>
          <div className="mt-3 text-xs leading-5 text-slate-700"><b>Budsjett:</b> {money(item.profile.budgetAmount, item.profile.budgetCurrency)} · <b>Kjøpsklarhet:</b> {item.profile.purchaseReadiness || "ukjent"}</div>
          {item.profile.summary && <p className="mt-2 text-xs leading-5 text-slate-600">{item.profile.summary}</p>}
          {[...item.profileHealth.blockers, ...item.profileHealth.warnings].map((value) => <Notice key={value} value={value} blocked={item.profileHealth.blockers.includes(value)}/>)}
        </section>
        <section className="rounded-2xl border border-slate-200 p-4"><div className="text-xs font-black uppercase tracking-wide text-slate-500">Siste shortlist og matchkvalitet</div>
          <div className="mt-3 grid grid-cols-4 gap-3"><Metric label="Beste" value={item.matchHealth.bestScore ?? "–"}/><Metric label="Datakvalitet" value={item.matchHealth.averageDataQuality === null ? "–" : `${item.matchHealth.averageDataQuality}%`}/><Metric label="Sterke" value={item.matchHealth.strong}/><Metric label="Kundeklare" value={item.matchHealth.clientReady}/></div>
          {[...item.matchHealth.blockers, ...item.matchHealth.warnings].map((value) => <Notice key={value} value={value} blocked={item.matchHealth.blockers.includes(value)}/>)}
          {item.candidates.slice(0, 3).map((candidate) => <div key={candidate.id} className="mt-2 rounded-xl bg-slate-50 p-3 text-xs text-slate-700"><b>{candidate.title || candidate.reference || "Bolig"}</b><div className="mt-1">Score {candidate.score} · data {candidate.dataQualityScore} · {candidate.reviewStatus}</div></div>)}
        </section>
      </div>
      <div className="flex flex-wrap gap-2 border-t border-slate-100 bg-slate-50 px-5 py-4 sm:px-6"><Link href={item.profileHref} className="rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-black text-white">Forbedre Buyer Profile</Link><Link href={item.reviewHref} className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-black text-slate-800">Åpne Freddy Review</Link><Link href={item.customerHref} className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-black text-slate-800">Customer 360</Link><span className="ml-auto inline-flex items-center gap-2 text-xs font-bold text-slate-500"><ShieldCheck size={15}/>Read-only · ingen match eller utsending kjøres</span></div>
    </article>)}</section>
  </main>;
}

function Score({ label, value }: { label: string; value: number }) { return <div className="rounded-2xl bg-slate-950 px-4 py-3 text-center text-white"><div className="text-xl font-black">{value}</div><div className="text-[10px] font-bold uppercase text-slate-300">{label}</div></div>; }
function Metric({ label, value }: { label: string; value: string | number }) { return <div className="rounded-xl bg-slate-50 p-3"><div className="text-lg font-black text-slate-950">{value}</div><div className="text-[10px] font-bold uppercase text-slate-500">{label}</div></div>; }
function Notice({ value, blocked }: { value: string; blocked: boolean }) { return <div className={`mt-2 flex gap-2 rounded-xl p-3 text-xs ${blocked ? "bg-rose-50 text-rose-900" : "bg-amber-50 text-amber-900"}`}><AlertTriangle size={14} className="shrink-0"/>{value}</div>; }
