"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  Banknote,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Gauge,
  KeyRound,
  RefreshCw,
  ShieldCheck,
  Target,
  UsersRound,
} from "lucide-react";
import type {
  ExecutiveBriefing,
  ExecutiveDecision,
  ExecutiveDecisionSeverity,
} from "@/lib/revenue/executive-briefing";

const stateText = {
  CRITICAL: "Kritisk oppmerksomhet",
  ATTENTION: "Krever gjennomgang",
  ON_TRACK: "På plan",
};

function stateClass(state: ExecutiveBriefing["state"]) {
  if (state === "CRITICAL") return "border-red-700/70 bg-red-950/35 text-red-100";
  if (state === "ATTENTION") return "border-amber-700/60 bg-amber-950/25 text-amber-100";
  return "border-emerald-700/60 bg-emerald-950/25 text-emerald-100";
}

function decisionClass(severity: ExecutiveDecisionSeverity) {
  if (severity === "CRITICAL") return "border-red-800/70 bg-red-950/25";
  if (severity === "HIGH") return "border-amber-800/60 bg-amber-950/20";
  return "border-slate-800 bg-slate-900/70";
}

function money(value: number | null) {
  if (value === null) return null;
  return new Intl.NumberFormat("nb-NO", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(value);
}

function dateTime(value: string, allDay = false) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("nb-NO", {
    timeZone: "Europe/Madrid",
    weekday: allDay ? undefined : "short",
    hour: allDay ? undefined : "2-digit",
    minute: allDay ? undefined : "2-digit",
    day: "2-digit",
    month: "short",
  }).format(date);
}

function DecisionCard({ item }: { item: ExecutiveDecision }) {
  return (
    <article className={`rounded-2xl border p-5 ${decisionClass(item.severity)}`}>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="rounded bg-slate-950/70 px-2 py-1 text-[10px] font-bold tracking-wide">{item.severity}</span>
            <span className="text-[10px] font-semibold tracking-wide text-slate-500">{item.source}</span>
            {item.dueAt && <span className="text-[10px] text-slate-500">Frist {dateTime(item.dueAt)}</span>}
          </div>
          <h3 className="font-semibold text-slate-100">{item.title}</h3>
          <p className="mt-1 text-sm font-medium text-slate-300">{item.subject}</p>
          <p className="mt-2 text-sm text-slate-400">{item.detail}</p>
          <div className="mt-3 rounded-lg border border-slate-800 bg-slate-950/50 p-3 text-sm text-slate-300">
            <strong>Neste beslutning:</strong> {item.recommendedAction}
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-start gap-3 lg:items-end">
          {item.amountEur !== null && <div className="text-lg font-semibold text-emerald-300">{money(item.amountEur)}</div>}
          <Link href={item.href} className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-3 py-2 text-sm font-medium text-white hover:bg-primary-500">
            Åpne arbeidsflate <ArrowRight size={15}/>
          </Link>
        </div>
      </div>
    </article>
  );
}

export default function ExecutiveBriefingPage() {
  const [briefing, setBriefing] = useState<ExecutiveBriefing | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    const response = await fetch("/api/revenue/executive-briefing", { cache: "no-store" });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) setError(body.error || "Kunne ikke bygge dagens briefing.");
    else setBriefing(body.briefing);
    setLoading(false);
  };

  useEffect(() => { void load(); }, []);

  if (loading) return <div className="p-8 text-slate-400">Bygger dagens operative briefing…</div>;

  return (
    <div className="min-h-screen bg-slate-950 p-4 text-slate-100 md:p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2 text-sm font-medium text-primary-400"><Gauge size={18}/> Executive Briefing</div>
            <h1 className="text-3xl font-bold">Daglig operativ gjennomgang</h1>
            <p className="mt-2 max-w-3xl text-slate-400">Én rollebasert beslutningsside for dagens varsler, mål, kalender, closing, provisjon, Keyholding og teamkapasitet.</p>
          </div>
          <button onClick={() => void load()} className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-sm hover:bg-slate-800"><RefreshCw size={15}/> Oppdater briefing</button>
        </header>

        {error && <div className="rounded-xl border border-red-700/60 bg-red-950/40 p-4 text-red-200"><AlertTriangle className="mr-2 inline" size={17}/>{error}</div>}

        {briefing && (
          <>
            <section className={`rounded-2xl border p-6 ${stateClass(briefing.state)}`}>
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <div className="mb-2 text-xs font-bold uppercase tracking-widest">{stateText[briefing.state]} · {briefing.roleLabel}</div>
                  <h2 className="text-xl font-semibold">{briefing.headline}</h2>
                  <p className="mt-2 text-sm opacity-75">Generert {dateTime(briefing.generatedAt)}. Briefingen endrer ingen underliggende data.</p>
                </div>
                <div className="flex items-center gap-2 rounded-xl border border-current/20 px-4 py-3 text-sm"><ShieldCheck size={18}/> Read-only beslutningsstøtte</div>
              </div>
            </section>

            <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
              {[
                ["Aktive varsler", briefing.summary.activeAlerts, AlertTriangle],
                ["Beslutninger", briefing.summary.decisionsToday, Target],
                ["Forfalt arbeid", briefing.summary.overdueExecution, Clock3],
                ["Kalender i dag", briefing.summary.calendarToday, CalendarDays],
                ["Ufordelt", briefing.summary.unassignedPriorityWork, UsersRound],
                ["Mål med avvik", briefing.summary.goalsBehind, Gauge],
              ].map(([label, value, Icon]: any) => (
                <div key={label} className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
                  <Icon size={18} className="mb-3 text-primary-400"/>
                  <div className="text-2xl font-bold">{value}</div>
                  <div className="text-xs text-slate-500">{label}</div>
                </div>
              ))}
            </section>

            <section className="grid gap-3 md:grid-cols-3">
              {briefing.summary.highRiskClosings !== null && (
                <Link href="/closing" className="rounded-xl border border-slate-800 bg-slate-900/70 p-4 hover:border-slate-700">
                  <Target size={18} className="mb-3 text-amber-400"/><div className="text-2xl font-bold">{briefing.summary.highRiskClosings}</div><div className="text-sm text-slate-400">Closing med høy risiko</div>
                </Link>
              )}
              {briefing.summary.overdueCommission !== null && (
                <Link href="/commissions" className="rounded-xl border border-slate-800 bg-slate-900/70 p-4 hover:border-slate-700">
                  <Banknote size={18} className="mb-3 text-emerald-400"/><div className="text-2xl font-bold">{money(briefing.summary.overdueCommission)}</div><div className="text-sm text-slate-400">Forfalt provisjon</div>
                </Link>
              )}
              {briefing.summary.keyholdingRenewals !== null && (
                <Link href="/service-revenue" className="rounded-xl border border-slate-800 bg-slate-900/70 p-4 hover:border-slate-700">
                  <KeyRound size={18} className="mb-3 text-blue-400"/><div className="text-2xl font-bold">{briefing.summary.keyholdingRenewals}</div><div className="text-sm text-slate-400">Keyholding-fornyelser</div>
                </Link>
              )}
            </section>

            <section className="space-y-3">
              <div className="flex items-center justify-between"><h2 className="text-xl font-semibold">Dagens beslutninger</h2><span className="text-xs text-slate-500">Maksimalt åtte, sortert etter konsekvens</span></div>
              {briefing.decisions.map((item) => <DecisionCard key={item.id} item={item}/>) }
              {!briefing.decisions.length && <div className="rounded-2xl border border-dashed border-emerald-800/60 bg-emerald-950/15 p-10 text-center text-emerald-200"><CheckCircle2 className="mx-auto mb-3"/>Ingen kritiske eller høyt prioriterte beslutninger er identifisert.</div>}
            </section>

            <section className="grid gap-6 xl:grid-cols-2">
              <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
                <div className="mb-4 flex items-center justify-between"><h2 className="text-xl font-semibold">Dagens agenda</h2><Link href="/calendar" className="text-sm text-primary-400 hover:underline">Åpne kalender</Link></div>
                <div className="space-y-3">
                  {briefing.agenda.map((event) => (
                    <div key={event.id} className="rounded-xl border border-slate-800 bg-slate-950/40 p-4">
                      <div className="flex items-start justify-between gap-3"><div><div className="font-medium">{event.title}</div><div className="mt-1 text-sm text-slate-400">{event.allDay ? "Hele dagen" : dateTime(event.start)}{event.location ? ` · ${event.location}` : ""}</div></div>{event.href && <a href={event.href} target="_blank" rel="noreferrer" className="text-xs text-primary-400 hover:underline">Google</a>}</div>
                    </div>
                  ))}
                  {!briefing.agenda.length && <div className="rounded-xl border border-dashed border-slate-700 p-8 text-center text-sm text-slate-500">Ingen tilgjengelige kalenderavtaler i dag.</div>}
                </div>
              </div>

              <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
                <div className="mb-4 flex items-center justify-between"><h2 className="text-xl font-semibold">Målstatus</h2><Link href="/goals" className="text-sm text-primary-400 hover:underline">Åpne mål</Link></div>
                <div className="space-y-3">
                  {briefing.goals.map((metric) => (
                    <div key={metric.id} className="rounded-xl border border-slate-800 bg-slate-950/40 p-4">
                      <div className="flex items-center justify-between gap-3"><div><div className="font-medium">{metric.label}</div><div className="mt-1 text-xs text-slate-500">{metric.detail}</div></div><span className={`rounded-full px-2 py-1 text-[10px] font-bold ${metric.status === "BEHIND" ? "bg-red-950 text-red-300" : metric.status === "AT_RISK" ? "bg-amber-950 text-amber-300" : metric.status === "ACHIEVED" ? "bg-emerald-950 text-emerald-300" : "bg-slate-800 text-slate-300"}`}>{metric.status}</span></div>
                      <div className="mt-3 text-sm text-slate-300">{metric.unit === "EUR" ? money(metric.actual) : Math.round(metric.actual)}{metric.target !== null ? ` / ${metric.unit === "EUR" ? money(metric.target) : Math.round(metric.target)}` : " · mål ikke satt"}</div>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            <section className="grid gap-6 xl:grid-cols-2">
              <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
                <div className="mb-4 flex items-center justify-between"><h2 className="text-xl font-semibold">Teamkapasitet</h2><Link href="/team-workload" className="text-sm text-primary-400 hover:underline">Åpne team</Link></div>
                <div className="grid grid-cols-4 gap-3 text-center">
                  {[["Personer", briefing.team.members], ["Overbelastet", briefing.team.overloaded], ["Ufordelt", briefing.team.unassigned], ["Forfalt", briefing.team.overdue]].map(([label, value]) => <div key={label} className="rounded-xl bg-slate-950/50 p-3"><div className="text-xl font-bold">{value}</div><div className="mt-1 text-[10px] text-slate-500">{label}</div></div>)}
                </div>
              </div>

              <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
                <h2 className="mb-4 text-xl font-semibold">Datadekning</h2>
                <div className="space-y-2">
                  {briefing.dataSources.map((source) => <div key={source.id} className="flex items-center justify-between gap-3 rounded-lg bg-slate-950/40 px-3 py-2 text-sm"><span>{source.label}</span><span className={source.available ? "text-emerald-300" : "text-amber-300"}>{source.available ? "Tilgjengelig" : "Ikke tilgjengelig"}</span></div>)}
                </div>
              </div>
            </section>

            {briefing.warnings.length > 0 && <section className="space-y-2">{briefing.warnings.map((warning) => <div key={warning} className="rounded-xl border border-amber-800/50 bg-amber-950/20 p-3 text-sm text-amber-200">{warning}</div>)}</section>}
          </>
        )}
      </div>
    </div>
  );
}
