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
  status: string;
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
  if (status === "BRAND_BRAIN_READY") return "bg-amber-100 text-amber-800 border-amber-200";
  if (status === "CONNECTED") return "bg-blue-100 text-blue-700 border-blue-200";
  return "bg-slate-100 text-slate-600 border-slate-200";
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
  const gate = data?.controlGate;

  return (
    <div className="mx-auto max-w-[1500px] space-y-5 p-6">
      <header className="rounded-2xl border border-fuchsia-900/30 bg-gradient-to-br from-slate-950 via-slate-900 to-fuchsia-950 p-6 text-white shadow-xl">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-xs font-black uppercase tracking-[0.2em] text-fuchsia-300">Marketing Autopilot</div>
            <h1 className="mt-2 text-3xl font-black">Social Automation</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">Én arbeidsflate for hva som skjer i dag, hva som trenger handling, hva som er publisert og hva Nexus lærer.</p>
          </div>
          <button onClick={() => void load()} disabled={loading} className="rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm font-bold hover:bg-white/10 disabled:opacity-50">{loading ? "Oppdaterer…" : "Oppdater"}</button>
        </div>
      </header>

      {error && <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800"><b>Readiness-feil:</b> {error}</div>}

      <nav className="flex gap-2 overflow-x-auto rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
        {TABS.map((tab) => (
          <button key={tab.id} onClick={() => setView(tab.id)} className={`whitespace-nowrap rounded-xl px-4 py-2 text-sm font-bold transition ${view === tab.id ? "bg-slate-900 text-white" : "text-slate-500 hover:bg-slate-100 hover:text-slate-900"}`}>
            {tab.label}{tab.id === "attention" && summary.needsAttention > 0 ? ` · ${summary.needsAttention}` : ""}
          </button>
        ))}
      </nav>

      {view === "today" && (
        <>
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            {[
              ["Connected", summary.connected],
              ["Pilot ready", summary.pilotReady],
              ["Live learning", summary.liveLearning],
              ["Published", summary.published],
              ["Needs attention", summary.needsAttention],
            ].map(([label, value]) => <div key={String(label)} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="text-xs font-black uppercase tracking-wider text-slate-400">{label}</div><div className="mt-2 text-3xl font-black text-slate-900">{value}</div></div>)}
          </section>

          {gate && <section className={`rounded-2xl border p-5 ${gate.status === "RUN_NEXT_CANARY" ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"}`}>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div><div className="text-xs font-black uppercase tracking-wider opacity-70">Neste anbefalte steg</div><div className="mt-1 text-xl font-black">{gate.status}</div><div className="mt-2 max-w-3xl text-sm">{gate.reason}</div></div>
              <div className="text-right text-sm"><div><b>{gate.eligibleObservations}/{gate.requiredObservations}</b> observations</div><div>{gate.evaluatedRules} rules evaluert · {gate.actionableRules} actionable</div></div>
            </div>
            {gate.nextRecommendedCanary?.path && <Link href={gate.nextRecommendedCanary.path} className="mt-4 inline-flex rounded-lg bg-emerald-700 px-3 py-2 text-xs font-black text-white">Åpne anbefalt handling →</Link>}
            {!gate.nextRecommendedCanary?.path && gate.nextEvaluationAt && <div className="mt-3 text-xs opacity-75">Neste evaluering: {new Date(gate.nextEvaluationAt).toLocaleString("nb-NO")}</div>}
          </section>}

          <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {[
              ["Content Studio", "/content-studio", "Lag og klargjør dagens innhold."],
              ["Posts & publishing", "/posts", "Se planlagt og publiseringsklart innhold."],
              ["Approval Center", "/approvals", "Godkjenn handlinger som krever menneskelig beslutning."],
              ["Marketing Readiness", "/marketing-readiness", "Rydd kanal- og Brand Brain-blokkeringer."],
            ].map(([title, href, text]) => <Link key={href} href={href} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-fuchsia-300"><h3 className="font-black text-slate-900">{title}</h3><p className="mt-2 text-sm leading-5 text-slate-600">{text}</p></Link>)}
          </section>
        </>
      )}

      {view === "calendar" && (
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-black text-slate-900">Calendar</h2>
          <p className="mt-2 max-w-2xl text-sm text-slate-600">Planlegging og publisering beholdes i eksisterende publiseringsflate. Nexus skal ikke lage en parallell kalender før samme sannhetskilde kan brukes direkte her.</p>
          <div className="mt-4 flex flex-wrap gap-2"><Link href="/posts" className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-bold text-white">Åpne posts & publishing</Link><Link href="/content-studio" className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-bold text-slate-700">Lag nytt innhold</Link></div>
        </section>
      )}

      {view === "attention" && (
        <section className="space-y-3">
          <div><h2 className="text-xl font-black text-slate-900">Needs attention</h2><p className="mt-1 text-sm text-slate-500">Bare forhold som faktisk krever menneskelig oppmerksomhet.</p></div>
          {summary.blockers.length === 0 && summary.quarantined === 0 ? <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-sm text-emerald-900">Ingen registrerte kanalblokkeringer eller quarantined items akkurat nå.</div> : null}
          {summary.blockers.map((row) => <Link key={`${row.brandId}-${row.platform}`} href="/marketing-readiness" className="block rounded-2xl border border-amber-200 bg-amber-50 p-5"><div className="font-black text-amber-950">{row.brandName} · {row.platform}</div><div className="mt-2 text-sm text-amber-900">{row.pilotBlockReason}</div><div className="mt-3 text-xs font-bold text-amber-800">Åpne Marketing Readiness →</div></Link>)}
          {summary.quarantined > 0 && <Link href="/posts" className="block rounded-2xl border border-rose-200 bg-rose-50 p-5"><div className="font-black text-rose-950">{summary.quarantined} quarantined item(s)</div><div className="mt-2 text-sm text-rose-900">Gå gjennom publiseringsarbeid som er holdt tilbake av kontrollsystemet.</div></Link>}
        </section>
      )}

      {view === "published" && (
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="text-xs font-black uppercase tracking-wider text-slate-400">Bekreftet fra readiness-systemet</div>
          <div className="mt-2 text-5xl font-black text-slate-900">{summary.published}</div>
          <p className="mt-3 text-sm text-slate-600">Publiseringshistorikk og enkeltposter åpnes i Posts & publishing, som fortsatt er sannhetskilde for postnivå.</p>
          <Link href="/posts" className="mt-4 inline-flex rounded-lg bg-slate-900 px-4 py-2 text-sm font-bold text-white">Se publiserte poster →</Link>
        </section>
      )}

      {view === "performance" && (
        <section className="grid gap-3 md:grid-cols-3">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="text-xs font-black uppercase tracking-wider text-slate-400">Learning eligible</div><div className="mt-2 text-4xl font-black text-slate-900">{summary.eligible}</div></div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="text-xs font-black uppercase tracking-wider text-slate-400">Live learning</div><div className="mt-2 text-4xl font-black text-slate-900">{summary.liveLearning}</div></div>
          <Link href="/analytics" className="rounded-2xl border border-fuchsia-200 bg-fuchsia-50 p-5 shadow-sm"><div className="text-xs font-black uppercase tracking-wider text-fuchsia-500">Performance</div><div className="mt-2 text-lg font-black text-fuchsia-950">Åpne Analytics →</div><p className="mt-2 text-sm text-fuchsia-900">Views, reach, engagement og utvikling over tid.</p></Link>
        </section>
      )}

      <details className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <summary className="cursor-pointer px-5 py-4 text-sm font-black text-slate-700">Advanced channel status</summary>
        <div className="overflow-x-auto border-t border-slate-200">
          <table className="w-full border-collapse text-sm">
            <thead><tr className="bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-500">{["Brand", "Kanal", "Status", "Publisert", "Eligible", "Quarantine", "Rules", "Blokkering"].map((h) => <th key={h} className="border-b border-slate-200 p-3">{h}</th>)}</tr></thead>
            <tbody>{rows.map((row) => <tr key={`${row.brandId}-${row.platform ?? "none"}`} className="align-top"><td className="border-b border-slate-100 p-3 font-bold text-slate-900">{row.brandName}</td><td className="border-b border-slate-100 p-3">{row.platform ?? "—"}<div className="text-xs text-slate-400">{row.accountName ?? ""}</div></td><td className="border-b border-slate-100 p-3"><span className={`rounded-full border px-2 py-1 text-[10px] font-black ${badge(row.status)}`}>{row.status}</span></td><td className="border-b border-slate-100 p-3">{row.published}</td><td className="border-b border-slate-100 p-3">{row.measuredEligible}</td><td className="border-b border-slate-100 p-3">{row.quarantined}</td><td className="border-b border-slate-100 p-3">{row.evaluatedRules}/{row.actionableRules}</td><td className="max-w-sm border-b border-slate-100 p-3 text-xs text-slate-500">{row.pilotBlockReason ?? "—"}</td></tr>)}</tbody>
          </table>
        </div>
      </details>

      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><b>Kontrollregel:</b> ingen post, konto eller learning-status vises som bekreftet uten data fra readiness-/publiseringssystemet.</div>
    </div>
  );
}
