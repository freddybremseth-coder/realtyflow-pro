"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, BadgeCheck, Bot, CircleDollarSign, Cpu, Sparkles } from "lucide-react";

/* Revenue Command Center 2027 — agentic-lag på startsiden (/today).
 * Viser hva agentene har foreslått/utført og hva som venter din godkjenning. */

interface NextBestAction {
  id: string;
  title: string;
  subjectType: string;
  risk?: string | null;
  opportunityEur?: number | null;
}
interface Summary {
  pendingCount: number;
  pendingOpportunityEur: number;
  agentRecommended: number;
  agentExecuted: number;
  attributedRevenueEur: number;
  nextBestActions: NextBestAction[];
}

const eur = (v: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(v || 0);
const riskColor = (r?: string | null) => (r === "critical" || r === "high" ? "#fb7185" : r === "medium" ? "#fbbf24" : "#34d399");

export function AgenticCommandSummary() {
  const [s, setS] = useState<Summary | null>(null);

  useEffect(() => {
    fetch("/api/agentic/command-center", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d && d.summary) setS(d.summary as Summary); })
      .catch(() => {});
  }, []);

  if (!s) return null;
  const quiet = s.pendingCount === 0 && s.agentRecommended === 0 && s.agentExecuted === 0;
  if (quiet) return null;

  const stat = (label: string, value: string, Icon: typeof Bot, tone: string) => (
    <div className="rounded-xl border border-slate-700/60 bg-slate-900/50 p-3">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-slate-500"><Icon size={12} style={{ color: tone }} />{label}</div>
      <p className="mt-1 text-lg font-bold text-white">{value}</p>
    </div>
  );

  return (
    <section className="rounded-2xl border border-violet-500/25 bg-violet-500/[0.06] p-5">
      <div className="mb-3 flex items-center gap-2">
        <Cpu size={17} className="text-violet-300" />
        <h2 className="text-lg font-semibold text-white">Agentic Revenue</h2>
        <span className="ml-1 rounded-full border border-violet-400/30 bg-violet-500/10 px-2 py-0.5 text-[11px] text-violet-200">Command Center 2027</span>
        <Link href="/nexus" className="ml-auto flex items-center gap-1 text-xs text-slate-400 hover:text-white">Dealflow OS <ArrowRight size={12} /></Link>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {stat("Venter godkjenning", String(s.pendingCount), BadgeCheck, "#fbbf24")}
        {stat("Mulighet i kø", eur(s.pendingOpportunityEur), CircleDollarSign, "#34d399")}
        {stat("Agent-forslag (30d)", String(s.agentRecommended), Sparkles, "#a78bfa")}
        {stat("Attribuert inntekt", eur(s.attributedRevenueEur), CircleDollarSign, "#22d3ee")}
      </div>

      {s.nextBestActions.length > 0 && (
        <div className="mt-4">
          <div className="mb-2 flex items-center gap-1.5 text-sm font-medium text-violet-200"><Sparkles size={14} /> AI anbefaler — neste beste handling</div>
          <div className="space-y-2">
            {s.nextBestActions.map((a) => (
              <Link key={a.id} href="/approvals" className="flex items-center justify-between gap-3 rounded-xl border border-slate-700/60 bg-slate-900/40 px-3 py-2.5 transition-colors hover:border-violet-400/40">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-white">{a.title}</p>
                  <p className="font-mono text-[11px] text-slate-500">{a.subjectType}{a.opportunityEur ? ` · ${eur(a.opportunityEur)}` : ""}</p>
                </div>
                <span className="flex items-center gap-2 shrink-0">
                  <span className="rounded-md px-2 py-0.5 text-[10px] font-medium uppercase" style={{ color: riskColor(a.risk), background: `${riskColor(a.risk)}18` }}>{a.risk ?? "?"}</span>
                  <ArrowRight size={14} className="text-slate-500" />
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
