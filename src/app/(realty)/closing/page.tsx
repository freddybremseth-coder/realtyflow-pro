"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowRight, CalendarClock, CheckCircle2, CircleDollarSign, Loader2, RefreshCw, ShieldAlert, Target, Users } from "lucide-react";
import { Button } from "@/components/ui/button";

type Risk = "HIGH" | "MEDIUM" | "LOW";
type Stage = "QUALIFIED" | "VIEWING" | "NEGOTIATION";

interface Opportunity {
  id: string;
  name: string;
  stage: Stage;
  brandId: string;
  value: number;
  propertyInterest: string | null;
  email: string | null;
  phone: string | null;
  nextFollowupAt: string | null;
  risk: Risk;
  score: number;
  blockers: string[];
  checklist: Array<{ id: string; label: string; complete: boolean; critical: boolean }>;
  nextAction: string;
  href: string;
}

interface Payload {
  generatedAt: string;
  summary: { activeDeals: number; highRisk: number; viewings: number; negotiations: number; blockedDeals: number; pipelineValue: number };
  opportunities: Opportunity[];
}

type Filter = "all" | "high" | "viewing" | "negotiation" | "blocked";

const BRAND_LABELS: Record<string, string> = { zeneco: "Zen Eco Homes", soleada: "Soleada.no", pinosoecolife: "Pinoso EcoLife" };
const STAGE_LABELS: Record<Stage, string> = { QUALIFIED: "Kvalifisert", VIEWING: "Visning", NEGOTIATION: "Forhandling" };

function money(value: number) {
  return new Intl.NumberFormat("nb-NO", { style: "currency", currency: "EUR", maximumFractionDigits: 0, notation: value >= 1_000_000 ? "compact" : "standard" }).format(value || 0);
}

function dateLabel(value: string | null) {
  if (!value) return "Ikke satt";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("nb-NO");
}

function riskClass(risk: Risk) {
  if (risk === "HIGH") return "border-red-500/40 bg-red-500/10 text-red-200";
  if (risk === "MEDIUM") return "border-amber-500/40 bg-amber-500/10 text-amber-200";
  return "border-emerald-500/35 bg-emerald-500/10 text-emerald-200";
}

export default function ClosingPage() {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");
  const [actionId, setActionId] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/revenue/closing", { cache: "no-store" });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error || "Kunne ikke hente closing-data.");
      setData(body);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunne ikke hente closing-data.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  const visible = useMemo(() => (data?.opportunities || []).filter((item) => {
    if (filter === "high") return item.risk === "HIGH";
    if (filter === "viewing") return item.stage === "VIEWING";
    if (filter === "negotiation") return item.stage === "NEGOTIATION";
    if (filter === "blocked") return item.blockers.length > 0;
    return true;
  }), [data?.opportunities, filter]);

  async function updateContact(id: string, updates: Record<string, unknown>, success: string) {
    setActionId(id);
    setFeedback("");
    try {
      const response = await fetch("/api/contacts", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, ...updates }) });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error || "Oppdateringen feilet.");
      setFeedback(success);
      await load();
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : "Oppdateringen feilet.");
    } finally {
      setActionId(null);
    }
  }

  function schedule(id: string, days: number) {
    const next = new Date(Date.now() + days * 86_400_000);
    next.setHours(9, 0, 0, 0);
    return updateContact(id, { next_followup: next.toISOString() }, `Neste oppfølging er satt til ${dateLabel(next.toISOString())}.`);
  }

  const filters: Array<{ id: Filter; label: string }> = [
    { id: "all", label: "Alle" }, { id: "high", label: "Høy risiko" }, { id: "viewing", label: "Visning" }, { id: "negotiation", label: "Forhandling" }, { id: "blocked", label: "Blokkert" },
  ];

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <header className="flex flex-col gap-4 rounded-2xl border border-slate-700/70 bg-slate-900/70 p-6 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2 text-sm font-medium text-emerald-300"><Target size={17} /> Freddy Revenue OS</div>
          <h1 className="text-3xl font-bold text-white">Closing Workspace</h1>
          <p className="mt-2 max-w-3xl text-sm text-slate-400">Kunder fra kvalifisering til reservasjon, med synlige blokkeringer og ett anbefalt neste steg.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline"><Link href="/today">I dag</Link></Button>
          <Button asChild variant="outline"><Link href="/pipeline">CRM</Link></Button>
          <Button onClick={load} disabled={loading}>{loading ? <Loader2 size={16} className="mr-2 animate-spin" /> : <RefreshCw size={16} className="mr-2" />}Oppdater</Button>
        </div>
      </header>

      {error && <div className="flex gap-2 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200"><AlertTriangle size={18} />{error}</div>}
      {feedback && <div className="flex gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-200"><CheckCircle2 size={17} />{feedback}</div>}

      {data && <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        {[
          ["Aktive avtaler", data.summary.activeDeals, Users], ["Høy risiko", data.summary.highRisk, ShieldAlert], ["Visninger", data.summary.viewings, CalendarClock], ["Forhandlinger", data.summary.negotiations, Target], ["Blokkert", data.summary.blockedDeals, AlertTriangle], ["Pipeline", money(data.summary.pipelineValue), CircleDollarSign],
        ].map(([label, value, Icon]) => <article key={String(label)} className="rounded-xl border border-slate-700/70 bg-slate-900/60 p-4"><Icon size={20} className="text-emerald-300" /><p className="mt-3 text-xs uppercase tracking-wide text-slate-500">{String(label)}</p><strong className="mt-1 block text-2xl text-white">{String(value)}</strong></article>)}
      </section>}

      <div className="flex flex-wrap gap-2">{filters.map((item) => <button key={item.id} onClick={() => setFilter(item.id)} className={`rounded-full border px-3 py-1.5 text-xs ${filter === item.id ? "border-emerald-400/50 bg-emerald-500/15 text-emerald-200" : "border-slate-700 text-slate-400"}`}>{item.label}</button>)}</div>

      {loading && !data ? <div className="flex min-h-48 items-center justify-center rounded-xl border border-slate-700 bg-slate-900/50 text-slate-400"><Loader2 size={20} className="mr-2 animate-spin" />Analyserer aktive avtaler …</div> : visible.length === 0 ? <div className="rounded-xl border border-slate-700 bg-slate-900/50 p-8 text-center text-slate-400">Ingen kunder i dette filteret.</div> : <section className="space-y-4">
        {visible.map((item) => <article key={item.id} className="rounded-xl border border-slate-700/70 bg-slate-900/60 p-5">
          <div className="flex flex-col gap-5 xl:flex-row xl:justify-between">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2"><span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${riskClass(item.risk)}`}>{item.risk} RISK</span><span className="rounded-full border border-slate-700 bg-slate-800 px-2.5 py-1 text-[11px] text-slate-300">{STAGE_LABELS[item.stage]}</span><span className="text-xs text-slate-500">{BRAND_LABELS[item.brandId] || item.brandId}</span></div>
              <h2 className="mt-3 text-xl font-semibold text-white">{item.name}</h2>
              <p className="mt-1 text-sm text-slate-400">{item.propertyInterest || "Boliginteresse ikke satt"} · {money(item.value)}</p>
              <div className="mt-4 rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3"><p className="text-xs uppercase tracking-wide text-emerald-300">Anbefalt neste steg</p><p className="mt-1 text-sm text-slate-200">{item.nextAction}</p></div>
              {item.blockers.length > 0 && <div className="mt-3"><p className="text-xs uppercase tracking-wide text-red-300">Blokkeringer</p><div className="mt-2 flex flex-wrap gap-2">{item.blockers.map((blocker) => <span key={blocker} className="rounded-full border border-red-500/25 bg-red-500/10 px-2.5 py-1 text-xs text-red-200">{blocker}</span>)}</div></div>}
            </div>
            <div className="w-full xl:w-96">
              <p className="text-xs uppercase tracking-wide text-slate-500">Closing checklist</p>
              <div className="mt-2 space-y-2">{item.checklist.map((check) => <div key={check.id} className="flex items-center gap-2 text-sm"><CheckCircle2 size={16} className={check.complete ? "text-emerald-400" : check.critical ? "text-red-400" : "text-slate-600"} /><span className={check.complete ? "text-slate-300" : "text-slate-500"}>{check.label}</span></div>)}</div>
              <div className="mt-4 text-xs text-slate-500">Neste oppfølging: {dateLabel(item.nextFollowupAt)} · score {item.score}/100</div>
              <div className="mt-4 flex flex-wrap gap-2"><Button size="sm" onClick={() => schedule(item.id, 1)} disabled={actionId === item.id}>I morgen</Button><Button size="sm" variant="outline" onClick={() => schedule(item.id, 3)} disabled={actionId === item.id}>+3 dager</Button>{item.stage === "QUALIFIED" && <Button size="sm" variant="outline" onClick={() => updateContact(item.id, { pipeline_status: "VIEWING" }, "Kunden er flyttet til visningsfasen.")}>Til visning</Button>}{item.stage === "VIEWING" && <Button size="sm" variant="outline" onClick={() => updateContact(item.id, { pipeline_status: "NEGOTIATION" }, "Kunden er flyttet til forhandling.")}>Til forhandling</Button>}<Button asChild size="sm" variant="ghost"><Link href={item.href}>Åpne kunde <ArrowRight size={14} className="ml-1" /></Link></Button></div>
            </div>
          </div>
        </article>)}
      </section>}
    </div>
  );
}
