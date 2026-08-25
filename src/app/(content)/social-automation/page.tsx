"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

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

const FLOW = [
  ["1", "Readiness & connections", "/marketing-readiness", "Meta/Instagram-tilkobling, Brand Brain og pilot readiness."],
  ["2", "Content Studio", "/content-studio", "Produser og klargjør innhold før publisering."],
  ["3", "AI Media Studio", "/media-studio", "Lag bilde/video-assets og kampanjemateriell."],
  ["4", "Growth Hub", "/growth-hub", "Styr vekstarbeid og kampanjer på tvers av kanaler."],
  ["5", "Posts & publishing", "/posts", "Se publiseringsarbeid og kanalinnhold."],
  ["6", "Analytics", "/analytics", "Mål views, reach, engasjement og utvikling over tid."],
] as const;

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

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await fetch("/api/marketing/readiness", { cache: "no-store", credentials: "same-origin" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || `Readiness feilet (${res.status})`);
      setData(body as Payload);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const rows = data?.rows ?? [];
  const connected = rows.filter((r) => r.connected).length;
  const pilotReady = rows.filter((r) => r.pilotReady).length;
  const liveLearning = rows.filter((r) => r.liveLearning).length;
  const published = rows.reduce((s, r) => s + Number(r.published || 0), 0);
  const eligible = rows.reduce((s, r) => s + Number(r.measuredEligible || 0), 0);
  const blockers = useMemo(() => rows.filter((r) => r.connected && !r.pilotReady && r.pilotBlockReason), [rows]);
  const gate = data?.controlGate;

  return <div className="mx-auto max-w-[1500px] space-y-6 p-6">
    <header className="rounded-2xl border border-fuchsia-900/30 bg-gradient-to-br from-slate-950 via-slate-900 to-fuchsia-950 p-6 text-white shadow-xl">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div><div className="text-xs font-black uppercase tracking-[0.2em] text-fuchsia-300">Social Growth OS</div><h1 className="mt-2 text-3xl font-black">Instagram & Social Automation</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">Live kontrollflate for tilkoblinger, readiness, publisering, learning og neste automatiseringssteg.</p></div>
        <button onClick={() => void load()} disabled={loading} className="rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm font-bold hover:bg-white/10 disabled:opacity-50">{loading ? "Oppdaterer…" : "Oppdater status"}</button>
      </div>
    </header>

    {error && <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800"><b>Readiness-feil:</b> {error}</div>}

    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      {[
        ["Tilkoblede kanaler", connected], ["Pilot ready", pilotReady], ["Live learning", liveLearning], ["Published", published], ["Learning eligible", eligible],
      ].map(([label, value]) => <div key={String(label)} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="text-xs font-black uppercase tracking-wider text-slate-400">{label}</div><div className="mt-2 text-3xl font-black text-slate-900">{value}</div></div>)}
    </section>

    {gate && <section className={`rounded-2xl border p-5 ${gate.status === "RUN_NEXT_CANARY" ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><div className="text-xs font-black uppercase tracking-wider opacity-70">Instagram control gate</div><div className="mt-1 text-xl font-black">{gate.status}</div><div className="mt-2 text-sm">{gate.reason}</div></div>
        <div className="text-right text-sm"><div><b>{gate.eligibleObservations}/{gate.requiredObservations}</b> eligible observations</div><div>{gate.evaluatedRules} evaluated rules · {gate.actionableRules} actionable</div></div>
      </div>
      {gate.nextRecommendedCanary?.path && <Link href={gate.nextRecommendedCanary.path} className="mt-4 inline-flex rounded-lg bg-emerald-700 px-3 py-2 text-xs font-black text-white">Åpne anbefalt canary →</Link>}
      {!gate.nextRecommendedCanary?.path && gate.nextEvaluationAt && <div className="mt-3 text-xs opacity-75">Neste mulige evaluering: {new Date(gate.nextEvaluationAt).toLocaleString("nb-NO")}</div>}
    </section>}

    <section>
      <h2 className="text-xl font-black text-slate-900">Kanalstatus</h2>
      <div className="mt-3 overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <table className="w-full border-collapse text-sm">
          <thead><tr className="bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-500">{["Brand", "Kanal", "Status", "Publisert", "Eligible", "Quarantine", "Rules", "Blokkering"].map((h) => <th key={h} className="border-b border-slate-200 p-3">{h}</th>)}</tr></thead>
          <tbody>{rows.map((r) => <tr key={`${r.brandId}-${r.platform ?? "none"}`} className="align-top"><td className="border-b border-slate-100 p-3 font-bold text-slate-900">{r.brandName}</td><td className="border-b border-slate-100 p-3">{r.platform ?? "—"}<div className="text-xs text-slate-400">{r.accountName ?? ""}</div></td><td className="border-b border-slate-100 p-3"><span className={`rounded-full border px-2 py-1 text-[10px] font-black ${badge(r.status)}`}>{r.status}</span></td><td className="border-b border-slate-100 p-3">{r.published}</td><td className="border-b border-slate-100 p-3">{r.measuredEligible}</td><td className="border-b border-slate-100 p-3">{r.quarantined}</td><td className="border-b border-slate-100 p-3">{r.evaluatedRules}/{r.actionableRules}</td><td className="max-w-sm border-b border-slate-100 p-3 text-xs text-slate-500">{r.pilotBlockReason ?? "—"}</td></tr>)}</tbody>
        </table>
      </div>
    </section>

    {blockers.length > 0 && <section><h2 className="text-lg font-black text-slate-900">Blokkeringer å rydde</h2><div className="mt-3 grid gap-3 md:grid-cols-2">{blockers.map((r) => <Link key={`${r.brandId}-${r.platform}`} href="/marketing-readiness" className="rounded-xl border border-amber-200 bg-amber-50 p-4"><div className="font-bold text-amber-950">{r.brandName} · {r.platform}</div><div className="mt-1 text-sm text-amber-900">{r.pilotBlockReason}</div></Link>)}</div></section>}

    <section><h2 className="text-xl font-black text-slate-900">Arbeidsflyt</h2><div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">{FLOW.map(([step, title, href, text]) => <Link key={href} href={href} className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-fuchsia-300 hover:shadow-md"><div className="flex items-center gap-3"><span className="flex h-8 w-8 items-center justify-center rounded-full bg-fuchsia-100 text-xs font-black text-fuchsia-800">{step}</span><h3 className="font-black text-slate-900 group-hover:text-fuchsia-800">{title}</h3></div><p className="mt-3 text-sm leading-5 text-slate-600">{text}</p></Link>)}</div></section>

    <section><h2 className="text-lg font-black text-slate-900">Automatisering & kontroll</h2><div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{[["/automation","Automation Center"],["/agents","AI Agents"],["/approvals","Approval Center"],["/attribution","Attribution"]].map(([href,title]) => <Link key={href} href={href} className="rounded-xl border border-slate-200 bg-white p-4 font-bold text-slate-900 transition hover:bg-slate-50">{title}</Link>)}</div></section>

    <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><b>Kontrollregel:</b> ingen post, konto eller learning-status vises som bekreftet uten data fra readiness-/publiseringssystemet.</div>
  </div>;
}
