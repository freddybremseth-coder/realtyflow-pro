"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowRight, Building2, CheckCircle2, Mail, MessageSquareText, RefreshCw, Search, ShieldCheck, Sparkles } from "lucide-react";

type Candidate = {
  id: string;
  source: "corporate_buyer" | "corporate_partner";
  companyName: string;
  website: string | null;
  industry: string | null;
  status: string;
  fitTier: string;
  fitScore: number;
  fitReasons: string[];
  evidenceGaps: string[];
  referralAngle: string | null;
  signalEntries: Array<{ key: string; sourceUrl: string | null; terms: string[] }>;
  officialChannel: { email: string | null; contactPage: string | null; checkedAt: string | null; companyLevelOnly: boolean; personalDataCollected: boolean };
  stage: string;
  hasWarmEvidence: boolean;
  nextAction: string;
  automationClass: string;
};

type Policy = {
  action_class: string;
  mode: "auto" | "guarded_auto" | "approval" | "blocked";
  min_confidence: number;
  daily_limit: number | null;
  rationale: string;
};

type Payload = {
  generatedAt: string;
  summary: {
    total: number;
    researched: number;
    officialChannelFound: number;
    warmEvidence: number;
    readyForReview: number;
    stages: Record<string, number>;
  };
  policies: Policy[];
  candidates: Candidate[];
  safety: Record<string, string>;
};

const stageLabels: Record<string, string> = {
  DISCOVERED: "Oppdaget",
  RESEARCHED: "Research",
  CHANNEL_FOUND: "Kanal funnet",
  READY_FOR_REVIEW: "Klar for vurdering",
  CONTACTED: "Kontaktet",
};

function modeClass(mode: Policy["mode"]) {
  if (mode === "auto") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (mode === "guarded_auto") return "border-cyan-200 bg-cyan-50 text-cyan-800";
  if (mode === "approval") return "border-amber-200 bg-amber-50 text-amber-800";
  return "border-rose-200 bg-rose-50 text-rose-800";
}

export default function OutboundEngagementPage() {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [stage, setStage] = useState("ALL");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/nexus/outbound-engagement", { cache: "no-store", credentials: "same-origin" });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error || "Kunne ikke hente outbound-data");
      setData(body);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  const candidates = useMemo(() => {
    const rows = data?.candidates || [];
    return stage === "ALL" ? rows : rows.filter((row) => row.stage === stage);
  }, [data, stage]);

  const policyByClass = useMemo(() => new Map((data?.policies || []).map((row) => [row.action_class, row])), [data]);

  return <main className="mx-auto max-w-[1500px] space-y-6 p-4 sm:p-6">
    <header className="rounded-3xl border border-violet-900/30 bg-gradient-to-br from-slate-950 via-slate-900 to-violet-950 p-6 text-white shadow-xl">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.22em] text-violet-300"><Sparkles size={16} /> Nexus · Outbound & Engagement</div>
          <h1 className="mt-2 text-3xl font-black">Research automatisk. Kontakt med kontroll.</h1>
          <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-300">Nexus gjør discovery, company research, kanaloppdagelse og utkast automatisk. Første kalde promotering, cold DM og masse-engagement forblir blokkert eller approval-styrt.</p>
        </div>
        <button onClick={() => void load()} disabled={loading} className="inline-flex items-center rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-sm font-black hover:bg-white/10 disabled:opacity-50"><RefreshCw size={16} className={loading ? "mr-2 animate-spin" : "mr-2"} />Oppdater</button>
      </div>
    </header>

    {error && <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900"><AlertTriangle size={17} className="mr-2 inline" />{error}</div>}

    {data && <>
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {[
          ["Kandidater", data.summary.total],
          ["Research", data.summary.researched],
          ["Offisiell kanal", data.summary.officialChannelFound],
          ["Warm evidence", data.summary.warmEvidence],
          ["Klar for vurdering", data.summary.readyForReview],
        ].map(([label, value]) => <div key={String(label)} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="text-xs font-black uppercase tracking-wider text-slate-400">{label}</div><div className="mt-2 text-3xl font-black text-slate-950">{value}</div></div>)}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><div className="text-xs font-black uppercase tracking-wider text-slate-400">Funnel</div><h2 className="mt-1 text-xl font-black text-slate-950">DISCOVERED → RESEARCHED → CHANNEL → REVIEW → CONTACTED</h2></div>
          <Link href="/nexus-os/autonomy" className="text-sm font-black text-cyan-700">Se autonomipolicy <ArrowRight size={14} className="ml-1 inline" /></Link>
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-5">
          {["DISCOVERED","RESEARCHED","CHANNEL_FOUND","READY_FOR_REVIEW","CONTACTED"].map((key) => <button key={key} onClick={() => setStage(stage === key ? "ALL" : key)} className={`rounded-xl border p-3 text-left ${stage === key ? "border-slate-950 bg-slate-950 text-white" : "border-slate-200 bg-slate-50 text-slate-900"}`}><div className="text-xs font-black">{stageLabels[key]}</div><div className="mt-1 text-2xl font-black">{data.summary.stages[key] || 0}</div></button>)}
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        {["company_research","official_channel_discovery","outreach_draft","warm_signal_dm","external_comment_post","cold_promotional_email"].map((key) => {
          const policy = policyByClass.get(key);
          if (!policy) return null;
          return <div key={key} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3"><div className="font-black text-slate-950">{key.replaceAll("_"," ")}</div><span className={`rounded-full border px-2 py-1 text-[10px] font-black uppercase ${modeClass(policy.mode)}`}>{policy.mode.replaceAll("_"," ")}</span></div>
            <p className="mt-2 text-xs leading-5 text-slate-600">{policy.rationale}</p>
          </div>;
        })}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-200 p-5 sm:flex-row sm:items-end sm:justify-between">
          <div><div className="text-xs font-black uppercase tracking-wider text-slate-400">Prioritert arbeidskø</div><h2 className="mt-1 text-xl font-black text-slate-950">{stage === "ALL" ? "Alle relevante kandidater" : stageLabels[stage]}</h2></div>
          {stage !== "ALL" && <button onClick={() => setStage("ALL")} className="text-xs font-black text-cyan-700">Vis alle</button>}
        </div>
        <div className="divide-y divide-slate-100">
          {candidates.slice(0, 50).map((row) => <article key={row.source + row.id} className="p-5">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Building2 size={17} className="text-slate-500" />
                  <h3 className="font-black text-slate-950">{row.companyName}</h3>
                  <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-black text-slate-600">{row.source === "corporate_partner" ? "Partner" : "Corporate buyer"}</span>
                  <span className="rounded-full bg-violet-50 px-2 py-1 text-[10px] font-black text-violet-700">Tier {row.fitTier} · {row.fitScore}</span>
                  <span className="rounded-full bg-cyan-50 px-2 py-1 text-[10px] font-black text-cyan-700">{stageLabels[row.stage] || row.stage}</span>
                </div>
                {row.fitReasons.length > 0 && <div className="mt-2 text-sm text-slate-600">{row.fitReasons.slice(0,3).join(" · ")}</div>}
                {row.signalEntries.length > 0 && <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900"><CheckCircle2 size={15} className="mr-2 inline" /><b>Dokumentert signal:</b> {row.signalEntries.map((s) => s.terms.length ? s.terms.join(", ") : s.key.replaceAll("_"," ")).join(" · ")}</div>}
                <div className="mt-3 flex flex-wrap gap-3 text-xs text-slate-500">
                  {row.officialChannel.email && <span><Mail size={14} className="mr-1 inline" />{row.officialChannel.email}</span>}
                  {row.officialChannel.contactPage && <a className="font-bold text-cyan-700" href={row.officialChannel.contactPage} target="_blank" rel="noreferrer">Offisiell kontaktside</a>}
                  {row.website && <a className="font-bold text-cyan-700" href={row.website.startsWith("http") ? row.website : `https://${row.website}`} target="_blank" rel="noreferrer">Nettside</a>}
                </div>
              </div>
              <div className="w-full rounded-xl border border-slate-200 bg-slate-50 p-4 xl:w-[370px]">
                <div className="text-[10px] font-black uppercase tracking-wider text-slate-400">Neste tillatte steg</div>
                <div className="mt-1 text-sm font-black text-slate-950">{row.nextAction}</div>
                <div className="mt-2 text-xs text-slate-500">Policy: <b>{row.automationClass.replaceAll("_"," ")}</b></div>
              </div>
            </div>
          </article>)}
          {candidates.length === 0 && <div className="p-8 text-center text-sm text-slate-500">Ingen kandidater i dette steget.</div>}
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-3">
        <Link href="/corporate-homes" className="rounded-xl border border-slate-200 bg-white p-4 font-black text-slate-900 hover:bg-slate-50"><Building2 size={16} className="mr-2 inline" />Corporate Homes <ArrowRight size={14} className="ml-2 inline" /></Link>
        <Link href="/nexus-os/communications/social" className="rounded-xl border border-slate-200 bg-white p-4 font-black text-slate-900 hover:bg-slate-50"><MessageSquareText size={16} className="mr-2 inline" />Social Inbox <ArrowRight size={14} className="ml-2 inline" /></Link>
        <Link href="/nexus-os/autonomy" className="rounded-xl border border-slate-200 bg-white p-4 font-black text-slate-900 hover:bg-slate-50"><ShieldCheck size={16} className="mr-2 inline" />Autopilot-regler <ArrowRight size={14} className="ml-2 inline" /></Link>
      </section>
    </>}
  </main>;
}
