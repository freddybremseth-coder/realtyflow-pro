"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowRight, BrainCircuit, BriefcaseBusiness, CheckCircle2, Lightbulb, Loader2, RefreshCw, Sparkles } from "lucide-react";
import { revenuePriorityEvidenceDimensions, revenueWorkEvidenceDimensions } from "@/lib/morning-brief-evidence";
import { rankMorningBriefPriorities } from "@/lib/morning-brief-priority";
import { todayDestination, type TodayDestinationType } from "@/lib/personal-intelligence/today-destination";

type AttentionItem = {
  id: string;
  severity: "high" | "medium" | "low";
  score: number;
  title: string;
  detail: string;
  href: string;
  source: string;
};

type RevenuePriority = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";

type RevenuePriorityItem = {
  score: number;
  value: number;
  kind: string;
  stage: string;
  isOverdue: boolean;
  nextFollowupAt?: string | null;
};

type RevenueWorkItem = {
  priority?: string | null;
  dueAt?: string | null;
  aiScore?: number | null;
  sourceType?: string | null;
};

type RevenuePayload = {
  priorities?: RevenuePriorityItem[];
  workItems?: RevenueWorkItem[];
  recommendedPlay?: {
    source?: "customer_priority" | "work_item";
    title: string;
    primaryAction: string;
    reason: string;
    href: string;
    priority: RevenuePriority;
    score: number;
  } | null;
};

type PersonalTodayItem = {
  id: string;
  type: TodayDestinationType;
  title: string;
  reason: string;
  priority: number;
  dueAt?: string | null;
  source?: string;
};

type PersonalTodaySnapshot = {
  oneThing: PersonalTodayItem | null;
  secondary: PersonalTodayItem[];
  learning: PersonalTodayItem | null;
  generatedAt: string;
  warnings?: string[];
};

type AttentionPayload = { attention?: AttentionItem[] };
type PersonalPayload = { snapshot?: PersonalTodaySnapshot };
type LoadState<T> = { data: T | null; error: string | null };

type UnifiedItem = {
  id: string;
  lane: "business" | "personal" | "learning";
  label: string;
  title: string;
  detail: string;
  href: string;
  source: string;
  urgency: number;
  impact: number;
  deadlineOrIrreversibility: number;
  ownerRequired: number;
  evidence?: string[];
  score?: number;
};

async function readJson<T>(url: string): Promise<LoadState<T>> {
  try {
    const response = await fetch(url, { cache: "no-store", credentials: "same-origin" });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body?.error || `${url} feilet (${response.status})`);
    return { data: body as T, error: null };
  } catch (error) {
    return { data: null, error: error instanceof Error ? error.message : String(error) };
  }
}

function businessUrgency(priority: RevenuePriority) {
  if (priority === "CRITICAL") return 100;
  if (priority === "HIGH") return 90;
  if (priority === "MEDIUM") return 70;
  return 50;
}

function personalDeadlineScore(dueAt?: string | null) {
  if (!dueAt) return 45;
  const timestamp = Date.parse(dueAt);
  if (!Number.isFinite(timestamp)) return 45;
  const hours = (timestamp - Date.now()) / 3_600_000;
  if (hours <= 0) return 100;
  if (hours <= 24) return 90;
  if (hours <= 72) return 75;
  if (hours <= 168) return 60;
  return 40;
}

export default function MorningBriefPage() {
  const [attention, setAttention] = useState<LoadState<AttentionPayload>>({ data: null, error: null });
  const [revenue, setRevenue] = useState<LoadState<RevenuePayload>>({ data: null, error: null });
  const [personal, setPersonal] = useState<LoadState<PersonalPayload>>({ data: null, error: null });
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const [attentionResult, revenueResult, personalResult] = await Promise.all([
      readJson<AttentionPayload>("/api/os/status"),
      readJson<RevenuePayload>("/api/revenue/today"),
      readJson<PersonalPayload>("/api/personal-intelligence/today"),
    ]);
    setAttention(attentionResult);
    setRevenue(revenueResult);
    setPersonal(personalResult);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const unified = useMemo<UnifiedItem[]>(() => {
    const items: UnifiedItem[] = [];
    const play = revenue.data?.recommendedPlay;
    if (play) {
      const canonicalEvidence = play.source === "work_item"
        ? revenueWorkEvidenceDimensions(revenue.data?.workItems?.[0] ?? { priority: play.priority, aiScore: play.score })
        : revenuePriorityEvidenceDimensions(revenue.data?.priorities?.[0] ?? { score: play.score });

      items.push({
        id: "business:recommended-play",
        lane: "business",
        label: "BUSINESS",
        title: play.title,
        detail: `${play.primaryAction} — ${play.reason}`,
        href: play.href,
        source: "Nexus Revenue Today",
        urgency: canonicalEvidence.urgency || businessUrgency(play.priority),
        impact: canonicalEvidence.impact,
        deadlineOrIrreversibility: canonicalEvidence.deadlineOrIrreversibility,
        ownerRequired: canonicalEvidence.ownerRequired,
        evidence: canonicalEvidence.evidence,
      });
    }

    const operational = (attention.data?.attention ?? []).filter((item) => item.id !== "os:clear")[0];
    if (operational) items.push({
      id: `attention:${operational.id}`,
      lane: "business",
      label: "OPERATIONS",
      title: operational.title,
      detail: operational.detail,
      href: operational.href,
      source: operational.source || "Nexus Attention",
      urgency: operational.severity === "high" ? 95 : operational.severity === "medium" ? 75 : 55,
      impact: Math.max(50, Math.min(100, operational.score || 60)),
      deadlineOrIrreversibility: operational.severity === "high" ? 90 : operational.severity === "medium" ? 70 : 50,
      ownerRequired: operational.severity === "high" ? 75 : 55,
      evidence: [`attention severity ${operational.severity}`, `attention score ${operational.score}/100`],
    });

    const snapshot = personal.data?.snapshot;
    if (snapshot?.oneThing) items.push({
      id: `personal:${snapshot.oneThing.id}`,
      lane: "personal",
      label: "THINK / DECIDE",
      title: snapshot.oneThing.title,
      detail: snapshot.oneThing.reason,
      href: todayDestination(snapshot.oneThing.type),
      source: snapshot.oneThing.source || "Personal Intelligence TODAY",
      urgency: Math.max(45, 85 - snapshot.oneThing.priority * 5),
      impact: 78,
      deadlineOrIrreversibility: personalDeadlineScore(snapshot.oneThing.dueAt),
      ownerRequired: 100,
      evidence: [snapshot.oneThing.dueAt ? `due ${snapshot.oneThing.dueAt}` : "no explicit due date", "Personal Intelligence selected ONE THING"],
    });

    if (snapshot?.learning) items.push({
      id: `learning:${snapshot.learning.id}`,
      lane: "learning",
      label: "WORTH KNOWING",
      title: snapshot.learning.title,
      detail: snapshot.learning.reason,
      href: todayDestination(snapshot.learning.type),
      source: snapshot.learning.source || "Personal Intelligence TODAY",
      urgency: 40,
      impact: 50,
      deadlineOrIrreversibility: personalDeadlineScore(snapshot.learning.dueAt),
      ownerRequired: 65,
      evidence: ["Personal Intelligence learning signal"],
    });

    const continuation = snapshot?.secondary?.[0];
    if (continuation) items.push({
      id: `continue:${continuation.id}`,
      lane: "personal",
      label: "CONTINUE",
      title: continuation.title,
      detail: continuation.reason,
      href: todayDestination(continuation.type),
      source: continuation.source || "Personal Intelligence TODAY",
      urgency: 35,
      impact: 55,
      deadlineOrIrreversibility: personalDeadlineScore(continuation.dueAt),
      ownerRequired: 85,
      evidence: ["existing commitment / continuation signal"],
    });

    return rankMorningBriefPriorities(items).map(({ item, priority }) => ({ ...item, score: priority.score }));
  }, [attention.data?.attention, personal.data?.snapshot, revenue.data?.priorities, revenue.data?.recommendedPlay, revenue.data?.workItems]);

  const primary = unified[0] ?? null;
  const rest = unified.slice(1, 5);
  const errors = [attention.error, revenue.error, personal.error].filter((value): value is string => Boolean(value));

  return <main className="mx-auto max-w-[1400px] space-y-6 p-4 sm:p-6">
    <header className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.2em] text-cyan-700"><Sparkles size={16} /> Unified Attention</div>
          <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-950">Morning Brief</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">Et read-only oppmerksomhetslag over Nexus og Personal Intelligence. Business execution forblir i Nexus; personlig læring, refleksjon og memory forblir i Personal Intelligence.</p>
        </div>
        <button type="button" onClick={() => void load()} disabled={loading} className="inline-flex items-center justify-center rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-black text-white disabled:opacity-60">
          {loading ? <Loader2 size={16} className="mr-2 animate-spin" /> : <RefreshCw size={16} className="mr-2" />}Oppdater
        </button>
      </div>
    </header>

    {errors.length > 0 && <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950"><div className="flex items-start gap-2"><AlertTriangle size={18} className="mt-0.5 shrink-0" /><div><strong>Briefen er delvis.</strong><div className="mt-1 text-amber-800">{errors.join(" · ")}</div></div></div></section>}

    <section className="rounded-3xl border border-slate-200 bg-slate-950 p-6 text-white shadow-sm">
      <div className="text-[10px] font-black uppercase tracking-[0.24em] text-cyan-300">ONE THING</div>
      {primary ? <div className="mt-3 grid gap-5 lg:grid-cols-[1fr_auto] lg:items-end">
        <div>
          <div className="text-xs font-black text-slate-400">{primary.label} · {primary.source} · decision score {primary.score}/100</div>
          <h2 className="mt-2 text-2xl font-black tracking-tight">{primary.title}</h2>
          <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-300">{primary.detail}</p>
          <div className="mt-3 flex flex-wrap gap-2 text-[10px] font-black uppercase tracking-wide text-slate-300">
            <span className="rounded-full border border-slate-700 px-2 py-1">Urgency {primary.urgency}</span>
            <span className="rounded-full border border-slate-700 px-2 py-1">Impact {primary.impact}</span>
            <span className="rounded-full border border-slate-700 px-2 py-1">Deadline / irreversible {primary.deadlineOrIrreversibility}</span>
            <span className="rounded-full border border-slate-700 px-2 py-1">Needs you {primary.ownerRequired}</span>
          </div>
          {primary.evidence?.length ? <div className="mt-3 text-xs leading-5 text-slate-400"><strong className="text-slate-300">Evidence:</strong> {primary.evidence.join(" · ")}</div> : null}
        </div>
        <Link href={primary.href} className="inline-flex items-center justify-center rounded-xl bg-cyan-300 px-4 py-2.5 text-sm font-black text-slate-950">Open <ArrowRight size={16} className="ml-2" /></Link>
      </div> : <div className="mt-4 flex items-start gap-3 rounded-2xl border border-emerald-800 bg-emerald-950/40 p-4 text-emerald-100"><CheckCircle2 size={19} className="mt-0.5" /><div><div className="font-black">Ingen sterk kandidat akkurat nå.</div><div className="mt-1 text-sm text-emerald-200">Det er bedre enn å produsere kunstig urgency.</div></div></div>}
    </section>

    <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {rest.map((item) => <Link key={item.id} href={item.href} className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-cyan-300 hover:shadow-md">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.16em] text-cyan-700">
            {item.lane === "business" ? <BriefcaseBusiness size={15} /> : item.lane === "learning" ? <Lightbulb size={15} /> : <BrainCircuit size={15} />}{item.label}
          </div>
          <ArrowRight size={16} className="text-slate-300 transition group-hover:translate-x-1 group-hover:text-cyan-700" />
        </div>
        <h3 className="mt-3 font-black text-slate-950">{item.title}</h3>
        <p className="mt-2 text-sm leading-5 text-slate-600">{item.detail}</p>
        <div className="mt-3 text-[11px] font-bold text-slate-400">Source: {item.source} · score {item.score}/100</div>
        {item.evidence?.length ? <div className="mt-2 text-[11px] leading-4 text-slate-400">{item.evidence.slice(0, 3).join(" · ")}</div> : null}
      </Link>)}
    </section>

    <section className="grid gap-4 lg:grid-cols-2">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="text-xs font-black uppercase tracking-wider text-slate-400">Execution boundary</div>
        <h2 className="mt-1 text-lg font-black text-slate-950">Nexus owns business action</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">Leads, revenue, operations, marketing blockers og faktiske business-handlinger utføres fortsatt i Nexus sine canonical flater.</p>
        <Link href="/nexus-os/today" className="mt-4 inline-flex text-sm font-black text-cyan-700">Open Nexus Today <ArrowRight size={15} className="ml-2" /></Link>
      </div>
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="text-xs font-black uppercase tracking-wider text-slate-400">Personal boundary</div>
        <h2 className="mt-1 text-lg font-black text-slate-950">Personal Intelligence owns memory and learning</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">Denne briefen kan vise prioriteringssignaler, men lager ikke claims, goals, observations eller learning records. Varige personlige signaler krever fortsatt eksplisitt handling i Personal Intelligence.</p>
        <Link href="/personal-intelligence" className="mt-4 inline-flex text-sm font-black text-cyan-700">Open Personal Intelligence <ArrowRight size={15} className="ml-2" /></Link>
      </div>
    </section>
  </main>;
}
