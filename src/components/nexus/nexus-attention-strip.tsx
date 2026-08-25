"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, RefreshCw } from "lucide-react";

type Status = {
  generatedAt: string;
  sourceState: { healthy: boolean };
  summary: {
    approvalsPending: number;
    bookPending: number;
    automationFailures24h: number;
    automationPartial24h: number;
    scheduledAutomationEnabled: number;
    scheduledAutomationHealthy: number;
    scheduledAutomationStale: number;
    instagramConnected: number;
    instagramCommentReadReady: number;
    socialSyncEnabled: boolean;
    socialAutoReplyLive: boolean;
  };
  attention: Array<{
    id: string;
    severity: "high" | "medium" | "low";
    title: string;
    href: string;
  }>;
  social: { lastSync: { status: string; createdAt: string } | null };
};

function ageLabel(value?: string | null) {
  if (!value) return "ingen sync";
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60000));
  if (!Number.isFinite(minutes)) return "ukjent sync";
  if (minutes < 2) return "nettopp";
  if (minutes < 60) return `${minutes} min siden`;
  return `${Math.floor(minutes / 60)} t siden`;
}

export function NexusAttentionStrip() {
  const [data, setData] = useState<Status | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/os/status", { cache: "no-store", credentials: "same-origin" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error || `HTTP ${response.status}`);
      setData(body as Status);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  const top = data?.attention?.[0];
  const high = data?.attention?.filter((item) => item.severity === "high").length ?? 0;
  const summary = data?.summary;

  return <div className="border-b border-white/10 bg-slate-900/95 px-4 py-2 text-white">
    <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-x-4 gap-y-2 text-xs">
      <Link href="/os" className="inline-flex items-center gap-2 font-black text-cyan-300 hover:text-cyan-200">
        {error ? <AlertTriangle className="h-4 w-4 text-rose-400" /> : data?.sourceState?.healthy ? <CheckCircle2 className="h-4 w-4 text-emerald-400" /> : <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />}
        Live Attention
      </Link>

      {error ? <span className="font-semibold text-rose-300">Status utilgjengelig: {error}</span> : <>
        <span className={high ? "font-black text-rose-300" : "font-semibold text-emerald-300"}>{high} high priority</span>
        <span className="text-slate-400">Approvals <b className="text-slate-200">{summary?.approvalsPending ?? "—"}</b></span>
        <Link href="/automation" className={summary?.scheduledAutomationStale ? "font-bold text-rose-300" : "text-slate-400 hover:text-slate-200"}>Scheduler <b>{summary?.scheduledAutomationHealthy ?? "—"}/{summary?.scheduledAutomationEnabled ?? "—"}</b> ferske</Link>
        <span className="text-slate-400">Automation-feil 24t <b className="text-slate-200">{summary?.automationFailures24h ?? "—"}</b></span>
        <span className="text-slate-400">Book review <b className="text-slate-200">{summary?.bookPending ?? "—"}</b></span>
        <span className="text-slate-400">IG comment-read <b className="text-slate-200">{summary?.instagramCommentReadReady ?? "—"}/{summary?.instagramConnected ?? "—"}</b></span>
        <span className="text-slate-500">Social sync {ageLabel(data?.social?.lastSync?.createdAt)}</span>
        {summary?.socialAutoReplyLive && <Link href="/nexus-os/runtime" className="rounded-full border border-rose-500/40 bg-rose-500/10 px-2 py-1 font-black text-rose-300">AUTO-REPLY LIVE</Link>}
        {top && top.id !== "os:clear" && <Link href={top.href} className="ml-auto max-w-[520px] truncate font-bold text-amber-300 hover:text-amber-200">Neste: {top.title} →</Link>}
      </>}

      <button type="button" onClick={() => void load()} disabled={loading} className="ml-auto inline-flex items-center gap-1 text-slate-500 hover:text-slate-200 disabled:opacity-50" aria-label="Oppdater Nexus-status">
        <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
      </button>
    </div>
  </div>;
}
