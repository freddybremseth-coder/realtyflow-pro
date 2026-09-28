"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { summarizeSocialAutopilot } from "@/lib/social-autopilot";

type Row = {
  brandId: string;
  brandName: string;
  platform: string | null;
  accountName: string | null;
  connected: boolean;
  brandBrainReady: boolean;
  planned: boolean;
  pilotReady: boolean;
  pilotBlockReason: string | null;
  published: number;
  measuredEligible: number;
  quarantined: number;
  evaluatedRules: number;
  actionableRules: number;
  liveLearning: boolean;
  surfaceKind: "destination" | "signal";
  attentionRequired: boolean;
  attentionReason: string | null;
  status: string;
};

type NextAction = {
  id: string;
  kind: string;
  brandId: string;
  brandName: string;
  channel: string | null;
  sourceChannel: string | null;
  title: string;
  reason: string;
  href: string | null;
  execution: "AUTO_READY" | "HUMAN_REQUIRED" | "SYSTEM_WORK" | "WAIT";
  priority: "HIGH" | "MEDIUM" | "LOW";
  evidence: string[];
};

type Payload = {
  generatedAt: string;
  controlGate: {
    status: string;
    eligibleObservations: number;
    requiredObservations: number;
    maturityHours: number;
    evaluatedRules: number;
    actionableRules: number;
    nextEvaluationAt: string | null;
    nextRecommendedCanary: { path?: string } | null;
    reason: string;
  };
  automationSummary?: {
    autoReady: number;
    humanRequired: number;
    systemWork: number;
    waiting: number;
    connectedSignals: number;
    connectedDestinations: number;
  };
  nextActions?: NextAction[];
  rows: Row[];
};

type View = "today" | "calendar" | "attention" | "published" | "performance";

const TABS: Array<{ id: View; label: string }> = [
  { id: "today", label: "Today" },
  { id: "calendar", label: "Calendar" },
  { id: "attention", label: "Needs attention" },
  { id: "published", label: "Published" },
  { id: "performance", label: "Performance" },
];

function badge(status: string) {
  if (status === "LIVE_LEARNING") return "bg-emerald-100 text-emerald-700 border-emerald-200";
  if (status === "PILOT_READY") return "bg-cyan-100 text-cyan-700 border-cyan-200";
  if (status === "SIGNAL_READY") return "bg-violet-100 text-violet-700 border-violet-200";
  if (status === "BRAND_BRAIN_READY") return "bg-amber-100 text-amber-800 border-amber-200";
  if (status === "CONNECTED") return "bg-blue-100 text-blue-700 border-blue-200";
  return "bg-slate-100 text-slate-600 border-slate-200";
}

function executionTone(execution: NextAction["execution"]) {
  if (execution === "HUMAN_REQUIRED") return "border-amber-200 bg-amber-50 text-amber-950";
  if (execution === "AUTO_READY") return "border-emerald-200 bg-emerald-50 text-emerald-950";
  if (execution === "SYSTEM_WORK") return "border-blue-200 bg-blue-50 text-blue-950";
  return "border-slate-200 bg-slate-50 text-slate-700";
}

function executionLabel(execution: NextAction["execution"]) {
  if (execution === "HUMAN_REQUIRED") return "Needs you";
  if (execution === "AUTO_READY") return "Auto ready";
  if (execution === "SYSTEM_WORK") return "System work";
  return "Watching";
}

export default function SocialAutomationPage() {
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>("today");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/marketing/readiness", { cache: "no-store", credentials: "same-origin" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || `Readiness feilet (${res.status})`);
      setData(body as Payload);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const rows = data?.rows ?? [];
  const summary = useMemo(() => summarizeSocialAutopilot(rows), [rows]);
  const actions = data?.nextActions ?? [];
  const autoActions = actions.filter((action) => action.execution === "AUTO_READY");
  const humanActions = actions.filter((action) => action.execution === "HUMAN_REQUIRED");
  const systemActions = actions.filter((action) => action.execution === "SYSTEM_WORK");
  const signals = rows.filter((row) => row.surfaceKind === "signal");
  const destinations = rows.filter((row) => row.surfaceKind === "destination");

  return (
    <div className="mx-auto max-w-[1500px] space-y-5 p-6">
      <header className="rounded-2xl border border-fuchsia-900/30 bg-gradient-to-br from-slate-950 via-slate-900 to-fuchsia-950 p-6 text-white shadow-xl">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-xs font-black uppercase tracking-[0.2em] text-fuchsia-300">Marketing Autopilot</div>
            <h1 className="mt-2 text-3xl font-black">Social Automation</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">Nexus velger neste sikre handling fra live learning, publisering, Search-signaler og CRM-evidens. Du skal primært se det som faktisk trenger deg.</p>
          </div>
          <button onClick={() => void load()} disabled={loading} className="rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm font-bold hover:bg-white/10 disabled:opacity-50">{loading ? "Oppdaterer…" : "Oppdater"}</button>
        </div>
      </header>

      {error && <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800"><b>Readiness-feil:</b> {error}</div>}

      <nav className="flex gap-2 overflow-x-auto rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
        {TABS.map((tab) => (
          <button key={tab.id} onClick={() => setView(tab.id)} className={`whitespace-nowrap rounded-xl px-4 py-2 text-sm font-bold transition ${view === tab.id ? "bg-slate-900 text-white" : "text-slate-500 hover:bg-slate-100 hover:text-slate-900"}`}>
            {tab.label}{tab.id === "attention" && humanActions.length > 0 ? ` · ${humanActions.length}` : ""}
          </button>
        ))}
      </nav>

      {view === "today" && (
        <>
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            {[
              ["Destinations", data?.automationSummary?.connectedDestinations ?? summary.connected],
              ["Signals", data?.automationSummary?.connectedSignals ?? summary.connectedSignals],
              ["Auto ready", data?.automationSummary?.autoReady ?? autoActions.length],
              ["Live learning", summary.liveLearning],
              ["Needs you", data?.automationSummary?.humanRequired ?? humanActions.length],
            ].map(([label, value]) => <div key={String(label)} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="text-xs font-black uppercase tracking-wider text-slate-400">{label}</div><div className="mt-2 text-3xl font-black text-slate-900">{value}</div></div>)}
          </section>

          <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-xs font-black uppercase tracking-wider text-emerald-700">Growth Autopilot queue</div>
                <h2 className="mt-1 text-xl font-black text-slate-950">Neste handlinger valgt av Nexus</h2>
                <p className="mt-1 max-w-3xl text-sm text-slate-700">AUTO READY køes automatisk av den timebaserte Marketing Autopilot. Hvis kanalen ikke er live-forhåndsgodkjent, lages bare kontrollert utkast/review; eksisterende claim-, account-, approval- og rollback-guards gjelder alltid.</p>
              </div>
              <Link href="/nexus-os/growth-scaling" className="rounded-lg bg-slate-950 px-3 py-2 text-xs font-black text-white">Scaling Control →</Link>
            </div>
            <div className="mt-4 grid gap-3 lg:grid-cols-3">
              {actions.filter((action) => action.execution !== "WAIT").slice(0, 6).map((action) => (
                <div key={action.id} className={`rounded-xl border p-4 ${executionTone(action.execution)}`}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="rounded-full bg-white/80 px-2 py-1 text-[10px] font-black uppercase">{executionLabel(action.execution)}</span>
                    <span className="text-[10px] font-black uppercase opacity-60">{action.priority}</span>
                  </div>
                  <div className="mt-3 font-black">{action.title}</div>
                  <p className="mt-2 text-sm leading-5 opacity-80">{action.reason}</p>
                  {action.sourceChannel && action.sourceChannel !== action.channel && <div className="mt-2 text-xs font-bold opacity-70">Læring fra {action.sourceChannel} → {action.channel}</div>}
                  {action.execution === "AUTO_READY" && <div className="mt-3 text-xs font-black text-emerald-800">Kjøres automatisk · ingen knapp nødvendig</div>}
                  {action.href && action.execution !== "AUTO_READY" && <Link href={action.href} className="mt-3 inline-flex rounded-lg bg-white px-3 py-2 text-xs font-black text-slate-900 shadow-sm">Åpne kontrollflate →</Link>}
                </div>
              ))}
              {!loading && actions.filter((action) => action.execution !== "WAIT").length === 0 && <div className="lg:col-span-3 rounded-xl border border-emerald-200 bg-white/70 p-4 text-sm text-emerald-900">Ingen ny handling må startes nå. Autopilot venter på nye modne signaler.</div>}
            </div>
          </section>

          <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            {[
              ["Content Studio", "/content-studio", "Lag og klargjør dagens innhold."],
              ["Posts & publishing", "/posts", "Se planlagt og publiseringsklart innhold."],
              ["Approval Center", "/approvals", "Kun beslutninger som faktisk krever menneske."],
              ["Marketing Readiness", "/marketing-readiness", "Destinations og measurement-signaler separat."],
              ["Scaling Control", "/nexus-os/growth-scaling", "Skaler bare med dokumentert læring og CRM-resultater."],
            ].map(([title, href, text]) => <Link key={href} href={href} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-fuchsia-300"><h3 className="font-black text-slate-900">{title}</h3><p className="mt-2 text-sm leading-5 text-slate-600">{text}</p></Link>)}
          </section>
        </>
      )}

      {view === "calendar" && (
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-black text-slate-900">Calendar</h2>
          <p className="mt-2 max-w-2xl text-sm text-slate-600">Planlegging og publisering bruker fortsatt samme sannhetskilde som Posts & publishing. Growth Autopilot skal ikke lage en parallell kalender.</p>
          <div className="mt-4 flex flex-wrap gap-2"><Link href="/posts" className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-bold text-white">Åpne posts & publishing</Link><Link href="/content-studio" className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-bold text-slate-700">Lag nytt innhold</Link></div>
        </section>
      )}

      {view === "attention" && (
        <section className="space-y-3">
          <div><h2 className="text-xl font-black text-slate-900">Needs attention</h2><p className="mt-1 text-sm text-slate-500">Kun beslutninger og sikkerhetsavvik som faktisk trenger et menneske. Publisher-governance og venting på data ligger ikke lenger her.</p></div>
          {humanActions.length === 0 ? <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-sm text-emerald-900">Ingen marketing-beslutninger krever deg akkurat nå.</div> : null}
          {humanActions.map((action) => (
            <Link key={action.id} href={action.href ?? "/marketing-readiness"} className="block rounded-2xl border border-amber-200 bg-amber-50 p-5">
              <div className="text-[10px] font-black uppercase tracking-wider text-amber-700">{action.priority} · {action.kind}</div>
              <div className="mt-1 font-black text-amber-950">{action.title}</div>
              <div className="mt-2 text-sm text-amber-900">{action.reason}</div>
              <div className="mt-3 text-xs font-bold text-amber-800">Åpne beslutning →</div>
            </Link>
          ))}
        </section>
      )}

      {view === "published" && (
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="text-xs font-black uppercase tracking-wider text-slate-400">Bekreftet fra publiseringssystemet</div>
          <div className="mt-2 text-5xl font-black text-slate-900">{summary.published}</div>
          <p className="mt-3 text-sm text-slate-600">Tallet inkluderer publiserings-destinations, ikke Search Console eller andre measurement-signaler.</p>
          <Link href="/posts" className="mt-4 inline-flex rounded-lg bg-slate-900 px-4 py-2 text-sm font-bold text-white">Se publiserte poster →</Link>
        </section>
      )}

      {view === "performance" && (
        <section className="grid gap-3 md:grid-cols-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="text-xs font-black uppercase tracking-wider text-slate-400">Learning eligible</div><div className="mt-2 text-4xl font-black text-slate-900">{summary.eligible}</div></div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="text-xs font-black uppercase tracking-wider text-slate-400">Live learning</div><div className="mt-2 text-4xl font-black text-slate-900">{summary.liveLearning}</div></div>
          <div className="rounded-2xl border border-violet-200 bg-violet-50 p-5 shadow-sm"><div className="text-xs font-black uppercase tracking-wider text-violet-500">Measurement signals</div><div className="mt-2 text-4xl font-black text-violet-950">{signals.filter((row) => row.connected).length}</div><p className="mt-2 text-xs text-violet-800">GSC og andre read-only signals.</p></div>
          <Link href="/analytics" className="rounded-2xl border border-fuchsia-200 bg-fuchsia-50 p-5 shadow-sm"><div className="text-xs font-black uppercase tracking-wider text-fuchsia-500">Business performance</div><div className="mt-2 text-lg font-black text-fuchsia-950">Åpne Analytics →</div><p className="mt-2 text-sm text-fuchsia-900">Reach → clicks → leads → kvalifisering → salg.</p></Link>
        </section>
      )}

      <details className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <summary className="cursor-pointer px-5 py-4 text-sm font-black text-slate-700">Advanced destination status · {destinations.length}</summary>
        <div className="overflow-x-auto border-t border-slate-200">
          <table className="w-full border-collapse text-sm">
            <thead><tr className="bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-500">{["Brand", "Destination", "Status", "Publisert", "Eligible", "Quarantine", "Rules", "Systemstatus"].map((h) => <th key={h} className="border-b border-slate-200 p-3">{h}</th>)}</tr></thead>
            <tbody>{destinations.map((row) => <tr key={`${row.brandId}-${row.platform ?? "none"}`} className="align-top"><td className="border-b border-slate-100 p-3 font-bold text-slate-900">{row.brandName}</td><td className="border-b border-slate-100 p-3">{row.platform ?? "—"}<div className="text-xs text-slate-400">{row.accountName ?? ""}</div></td><td className="border-b border-slate-100 p-3"><span className={`rounded-full border px-2 py-1 text-[10px] font-black ${badge(row.status)}`}>{row.status}</span></td><td className="border-b border-slate-100 p-3">{row.published}</td><td className="border-b border-slate-100 p-3">{row.measuredEligible}</td><td className="border-b border-slate-100 p-3">{row.quarantined}</td><td className="border-b border-slate-100 p-3">{row.evaluatedRules}/{row.actionableRules}</td><td className="max-w-sm border-b border-slate-100 p-3 text-xs text-slate-500">{row.attentionRequired ? row.attentionReason : row.pilotBlockReason ?? "—"}</td></tr>)}</tbody>
          </table>
        </div>
      </details>

      <details className="rounded-2xl border border-violet-200 bg-violet-50 shadow-sm">
        <summary className="cursor-pointer px-5 py-4 text-sm font-black text-violet-900">Signals & measurement · {signals.length}</summary>
        <div className="overflow-x-auto border-t border-violet-200 bg-white">
          <table className="w-full border-collapse text-sm">
            <thead><tr className="bg-violet-50 text-left text-xs uppercase tracking-wider text-violet-700">{["Brand", "Signal", "Konto", "Status"].map((h) => <th key={h} className="border-b border-violet-100 p-3">{h}</th>)}</tr></thead>
            <tbody>{signals.map((row) => <tr key={`${row.brandId}-${row.platform}`}><td className="border-b border-slate-100 p-3 font-bold">{row.brandName}</td><td className="border-b border-slate-100 p-3">{row.platform}</td><td className="border-b border-slate-100 p-3">{row.accountName ?? "—"}</td><td className="border-b border-slate-100 p-3"><span className={`rounded-full border px-2 py-1 text-[10px] font-black ${badge(row.status)}`}>{row.status}</span></td></tr>)}</tbody>
          </table>
        </div>
      </details>

      {systemActions.length > 0 && <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900"><b>{systemActions.length} systemoppgave(r)</b> ligger i Growth Autopilot-køen, blant annet publisher-governance. Disse teller ikke som «Needs attention» for deg.</div>}
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700"><b>Kontrollregel:</b> measurement-signaler kan påvirke beslutningsgrunnlaget, men blir aldri behandlet som publiseringsdestinations. Ingen post eller learning-status regnes som bekreftet uten data fra readiness-/publiseringssystemet.</div>
    </div>
  );
}
