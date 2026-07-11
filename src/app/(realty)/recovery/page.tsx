"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowRight, CalendarClock, CheckCircle2, CircleDollarSign, Loader2, RefreshCw, RotateCcw, SearchX, ShieldCheck, Target, UserCheck, Users, XCircle, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

type Stage = "LOST" | "ON_HOLD";
type Priority = "HIGH" | "MEDIUM" | "LOW";
type Disposition = "RECOVER_NOW" | "NURTURE" | "DO_NOT_PURSUE";
type Reason = "PRICE_BUDGET" | "FINANCING" | "TIMING" | "PROPERTY_MISMATCH" | "LOCATION" | "LEGAL_TECHNICAL" | "NO_RESPONSE" | "BOUGHT_ELSEWHERE" | "INVALID_DUPLICATE" | "PERSONAL" | "UNKNOWN";
type Filter = "all" | "recover" | "due" | "hold" | "lost" | "missing" | "closed";

interface Lead {
  id: string; name: string; brandId: string; stage: Stage; reason: Reason; reasonLabel: string;
  reasonSource: "EXPLICIT" | "INFERRED" | "UNKNOWN"; disposition: Disposition; priority: Priority;
  recoveryScore: number; dealValue: number; daysDormant: number; lastContactAt: string | null;
  nextFollowupAt: string | null; dueNow: boolean; missingReason: boolean; doNotPursue: boolean;
  priorStageSignal: string | null; issues: string[]; recommendedAction: string; href: string;
}
interface Workspace {
  summary: { dormantLeads: number; recoverNow: number; dueNow: number; missingReason: number; highPotentialValue: number; totalDormantValue: number };
  reasons: Array<{ reason: Reason; label: string; count: number; value: number }>;
  leads: Lead[];
}

const BRANDS: Record<string, string> = { zeneco: "Zen Eco Homes", soleada: "Soleada.no", pinosoecolife: "Pinoso EcoLife" };
const REASONS: Array<[Reason, string]> = [
  ["PRICE_BUDGET", "Pris eller budsjett"], ["FINANCING", "Finansiering"], ["TIMING", "Timing / ikke klar"],
  ["PROPERTY_MISMATCH", "Fant ikke riktig bolig"], ["LOCATION", "Område eller beliggenhet"],
  ["LEGAL_TECHNICAL", "Juridisk eller teknisk"], ["NO_RESPONSE", "Ingen respons"],
  ["BOUGHT_ELSEWHERE", "Kjøpte et annet sted"], ["INVALID_DUPLICATE", "Ugyldig eller duplikat"], ["PERSONAL", "Personlig situasjon"],
];

function money(value: number) {
  return new Intl.NumberFormat("nb-NO", { style: "currency", currency: "EUR", maximumFractionDigits: 0, notation: value >= 1_000_000 ? "compact" : "standard" }).format(value || 0);
}
function dateLabel(value: string | null) {
  if (!value) return "Ikke satt";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("nb-NO");
}
function priorityClass(value: Priority) {
  return value === "HIGH" ? "border-red-500/35 bg-red-500/10 text-red-200" : value === "MEDIUM" ? "border-amber-500/35 bg-amber-500/10 text-amber-200" : "border-slate-600 bg-slate-800 text-slate-300";
}
function dispositionLabel(value: Disposition) {
  return value === "RECOVER_NOW" ? "Ta opp nå" : value === "NURTURE" ? "Modne videre" : "Ikke følg opp";
}
function dispositionClass(value: Disposition) {
  return value === "RECOVER_NOW" ? "border-emerald-500/35 bg-emerald-500/10 text-emerald-200" : value === "NURTURE" ? "border-blue-500/35 bg-blue-500/10 text-blue-200" : "border-slate-600 bg-slate-800 text-slate-400";
}

export default function RecoveryPage() {
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [brand, setBrand] = useState("all");
  const [reasonDrafts, setReasonDrafts] = useState<Record<string, Reason>>({});

  async function load(selectedBrand = brand) {
    setLoading(true); setError("");
    try {
      const query = selectedBrand === "all" ? "" : `?brand=${encodeURIComponent(selectedBrand)}`;
      const response = await fetch(`/api/revenue/recovery${query}`, { cache: "no-store" });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error || "Kunne ikke hente recovery-data.");
      const next = body?.workspace || null;
      setWorkspace(next);
      const defaults: Record<string, Reason> = {};
      for (const lead of next?.leads || []) defaults[lead.id] = lead.reason === "UNKNOWN" ? "TIMING" : lead.reason;
      setReasonDrafts(defaults);
    } catch (err) { setError(err instanceof Error ? err.message : "Kunne ikke hente recovery-data."); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(brand); }, [brand]);

  const visible = useMemo(() => (workspace?.leads || []).filter((lead) => {
    if (filter === "recover") return lead.disposition === "RECOVER_NOW";
    if (filter === "due") return lead.dueNow;
    if (filter === "hold") return lead.stage === "ON_HOLD";
    if (filter === "lost") return lead.stage === "LOST";
    if (filter === "missing") return lead.missingReason;
    if (filter === "closed") return lead.disposition === "DO_NOT_PURSUE";
    return true;
  }), [filter, workspace?.leads]);

  async function act(lead: Lead, action: string, options: { nextFollowupDays?: number; reason?: Reason } = {}) {
    if (["do_not_pursue", "reopen_contact", "reopen_qualified"].includes(action)) {
      const text = action === "do_not_pursue" ? "Markere saken som ikke aktuell?" : "Åpne saken igjen i aktiv pipeline?";
      if (!window.confirm(text)) return;
    }
    setBusy(`${lead.id}-${action}`); setFeedback("");
    try {
      const response = await fetch("/api/revenue/recovery", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contactId: lead.id, action, ...options }) });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error || "Oppdateringen feilet.");
      setFeedback(body?.targetStage ? `Saken er åpnet igjen som ${body.targetStage}. Ingen melding ble sendt.` : "Intern aktivitet er registrert. Ingen melding ble sendt.");
      await load();
    } catch (err) { setFeedback(err instanceof Error ? err.message : "Oppdateringen feilet."); }
    finally { setBusy(null); }
  }

  const filters: Array<[Filter, string]> = [["all", "Alle"], ["recover", "Ta opp nå"], ["due", "Klar / forfalt"], ["hold", "På vent"], ["lost", "Tapt"], ["missing", "Mangler årsak"], ["closed", "Ikke følg opp"]];
  const cards: Array<{ label: string; value: string | number; icon: LucideIcon }> = workspace ? [
    { label: "Dormant leads", value: workspace.summary.dormantLeads, icon: Users }, { label: "Ta opp nå", value: workspace.summary.recoverNow, icon: RotateCcw },
    { label: "Klar / forfalt", value: workspace.summary.dueNow, icon: CalendarClock }, { label: "Mangler årsak", value: workspace.summary.missingReason, icon: SearchX },
    { label: "Potensial nå", value: money(workspace.summary.highPotentialValue), icon: Target }, { label: "Dormant verdi", value: money(workspace.summary.totalDormantValue), icon: CircleDollarSign },
  ] : [];

  return <div className="mx-auto max-w-7xl space-y-6">
    <header className="flex flex-col gap-4 rounded-2xl border border-slate-700/70 bg-slate-900/70 p-6 lg:flex-row lg:items-center lg:justify-between">
      <div><div className="mb-2 flex items-center gap-2 text-sm font-medium text-cyan-300"><RotateCcw size={17} /> Freddy Revenue OS</div><h1 className="text-3xl font-bold text-white">Lost Lead Recovery</h1><p className="mt-2 max-w-3xl text-sm text-slate-400">Finn tapte og pausede kjøpere som kan bli aktive igjen, uten automatiske utsendelser.</p></div>
      <div className="flex gap-2"><Button asChild variant="outline"><Link href="/pipeline">CRM</Link></Button><Button asChild variant="outline"><Link href="/forecast">Forecast</Link></Button><Button onClick={() => load()} disabled={loading}>{loading ? <Loader2 size={16} className="mr-2 animate-spin" /> : <RefreshCw size={16} className="mr-2" />}Oppdater</Button></div>
    </header>

    <div className="flex gap-3 rounded-xl border border-cyan-500/25 bg-cyan-500/5 p-4 text-sm text-slate-300"><ShieldCheck size={20} className="shrink-0 text-cyan-300" /><div><strong className="text-white">Manuell kontroll:</strong> Ingen e-post, WhatsApp eller SMS sendes. Gjenåpning krever eksplisitt bekreftelse.</div></div>
    {error && <div className="flex gap-2 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200"><AlertTriangle size={18} />{error}</div>}
    {feedback && <div className="flex gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-200"><CheckCircle2 size={17} />{feedback}</div>}

    {workspace && <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">{cards.map((card) => { const Icon = card.icon; return <article key={card.label} className="rounded-xl border border-slate-700/70 bg-slate-900/60 p-4"><Icon size={20} className="text-cyan-300" /><p className="mt-3 text-xs uppercase text-slate-500">{card.label}</p><strong className="mt-1 block text-2xl text-white">{card.value}</strong></article>; })}</section>}

    <div className="flex flex-col gap-3 rounded-xl border border-slate-700 bg-slate-900/50 p-4 lg:flex-row lg:justify-between"><div className="flex flex-wrap gap-2">{filters.map(([id, label]) => <button key={id} onClick={() => setFilter(id)} className={`rounded-full border px-3 py-1.5 text-xs ${filter === id ? "border-cyan-400/50 bg-cyan-500/15 text-cyan-200" : "border-slate-700 text-slate-400"}`}>{label}</button>)}</div><select value={brand} onChange={(event) => setBrand(event.target.value)} className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-200"><option value="all">Alle brands</option><option value="zeneco">Zen Eco Homes</option><option value="soleada">Soleada.no</option><option value="pinosoecolife">Pinoso EcoLife</option></select></div>

    {loading && !workspace ? <div className="flex min-h-48 items-center justify-center rounded-xl border border-slate-700 bg-slate-900/50 text-slate-400"><Loader2 size={20} className="mr-2 animate-spin" />Analyserer dormant leads …</div> : visible.length === 0 ? <div className="rounded-xl border border-slate-700 bg-slate-900/50 p-8 text-center text-slate-400">Ingen saker i dette filteret.</div> : <section className="space-y-4">{visible.map((lead) => <article key={lead.id} className="rounded-xl border border-slate-700/70 bg-slate-900/60 p-5">
      <div className="flex flex-col gap-5 xl:flex-row xl:justify-between"><div className="min-w-0 flex-1"><div className="flex flex-wrap gap-2"><span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${priorityClass(lead.priority)}`}>{lead.priority}</span><span className={`rounded-full border px-2.5 py-1 text-[11px] ${dispositionClass(lead.disposition)}`}>{dispositionLabel(lead.disposition)}</span><span className="rounded-full border border-slate-700 bg-slate-800 px-2.5 py-1 text-[11px] text-slate-300">{lead.stage === "ON_HOLD" ? "På vent" : "Tapt"}</span><span className="text-xs text-slate-500">{BRANDS[lead.brandId] || lead.brandId}</span></div>
      <div className="mt-3 flex items-end justify-between gap-3"><div><h2 className="text-xl font-semibold text-white">{lead.name}</h2><p className="mt-1 text-sm text-slate-400">{lead.reasonLabel} · {money(lead.dealValue)}</p></div><div className="text-right"><p className="text-3xl font-bold text-cyan-300">{lead.recoveryScore}</p><p className="text-[10px] uppercase text-slate-500">score</p></div></div><p className="mt-2 text-xs text-slate-500">Dormant {lead.daysDormant} dager · siste kontakt {dateLabel(lead.lastContactAt)} · neste {dateLabel(lead.nextFollowupAt)}</p>{lead.priorStageSignal && <p className="mt-2 text-xs text-emerald-300"><UserCheck size={13} className="mr-1 inline" />Tidligere: {lead.priorStageSignal}</p>}<div className="mt-4 rounded-lg border border-cyan-500/20 bg-cyan-500/5 p-3"><p className="text-xs uppercase text-cyan-300">Anbefalt neste steg</p><p className="mt-1 text-sm text-slate-200">{lead.recommendedAction}</p></div>{lead.issues.length > 0 && <div className="mt-3 flex flex-wrap gap-2">{lead.issues.map((issue) => <span key={issue} className="rounded-full border border-amber-500/25 bg-amber-500/10 px-2 py-1 text-[11px] text-amber-200">{issue}</span>)}</div>}</div>

      <div className="w-full space-y-3 xl:w-[34rem]"><div className="rounded-lg border border-slate-700 bg-slate-950/35 p-3"><p className="mb-2 text-xs uppercase text-slate-500">Stoppårsak</p><div className="flex gap-2"><select value={reasonDrafts[lead.id] || "TIMING"} onChange={(event) => setReasonDrafts((current) => ({ ...current, [lead.id]: event.target.value as Reason }))} className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-200">{REASONS.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select><Button size="sm" variant="outline" onClick={() => act(lead, "set_reason", { reason: reasonDrafts[lead.id] || "TIMING" })} disabled={busy !== null}>Lagre</Button></div><p className="mt-2 text-[11px] text-slate-500">Kilde: {lead.reasonSource === "EXPLICIT" ? "manuell" : lead.reasonSource === "INFERRED" ? "tolket fra CRM" : "ukjent"}</p></div>
      {!lead.doNotPursue && <div className="grid gap-2 sm:grid-cols-2"><Button size="sm" variant="outline" onClick={() => act(lead, "plan_recovery", { nextFollowupDays: 7 })} disabled={busy !== null}>Planlegg +7</Button><Button size="sm" variant="outline" onClick={() => act(lead, "schedule", { nextFollowupDays: 30 })} disabled={busy !== null}>Vurder +30</Button><Button size="sm" variant="outline" onClick={() => act(lead, "manual_contact", { nextFollowupDays: 30 })} disabled={busy !== null}>Logg manuell kontakt</Button><Button size="sm" onClick={() => act(lead, "reopen_contact")} disabled={busy !== null}>Åpne som kontaktet</Button><Button size="sm" onClick={() => act(lead, "reopen_qualified")} disabled={busy !== null}>Åpne som kvalifisert</Button><Button size="sm" variant="ghost" className="text-red-300" onClick={() => act(lead, "do_not_pursue")} disabled={busy !== null}><XCircle size={14} className="mr-1" />Ikke følg opp</Button></div>}
      <div className="flex flex-wrap gap-2"><Button size="sm" variant="ghost" onClick={() => act(lead, "review")} disabled={busy !== null}>Gjennomgått</Button><Button asChild size="sm" variant="ghost"><Link href={lead.href}>Customer 360 <ArrowRight size={14} className="ml-1" /></Link></Button></div></div></div>
    </article>)}</section>}
  </div>;
}
