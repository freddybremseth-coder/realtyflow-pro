"use client";

import { useCallback, useEffect, useState } from "react";
import { Bot, Check, Cpu, Loader2, X } from "lucide-react";

/* Agent-handlinger i den generelle Approval Gateway (agentic_approvals).
 * Montert i Approval Center slik at LI-approvals og generiske agent-handlinger
 * lever i ÉN kø. Direkte godkjenn/avvis via /api/agentic/approvals. */

interface AgenticApproval {
  id: string;
  title: string;
  gatedActionClass: string;
  subjectType: string;
  subjectRef?: string | null;
  reason?: string | null;
  risk?: string | null;
  decisionMode?: string | null;
  confidence?: number | null;
  estimatedOpportunityEur?: number | null;
}

const eur = (v?: number | null) => (v == null ? null : new Intl.NumberFormat("en-US", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(v));
const riskColor = (r?: string | null) => (r === "critical" || r === "high" ? "#fb7185" : r === "medium" ? "#fbbf24" : "#34d399");

export function AgenticApprovalQueue() {
  const [items, setItems] = useState<AgenticApproval[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/agentic/approvals", { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (res.ok && Array.isArray(data.approvals)) setItems(data.approvals);
    } catch {
      /* stille — LI-køen under er hovedinnholdet */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const resolve = useCallback(async (id: string, decision: "approve" | "reject") => {
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch(`/api/agentic/approvals/${id}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ decision }),
      });
      if (res.ok) setItems((prev) => prev.filter((i) => i.id !== id));
      else { const d = await res.json().catch(() => ({})); setError(d.error || "Handling feilet"); }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nettverksfeil");
    } finally {
      setBusyId(null);
    }
  }, []);

  if (loading && items.length === 0) return null;
  if (items.length === 0) return null;

  return (
    <section className="rounded-2xl border border-violet-500/25 bg-violet-500/[0.06] p-5">
      <div className="mb-3 flex items-center gap-2">
        <Cpu size={17} className="text-violet-300" />
        <h2 className="text-lg font-semibold text-white">Agent-handlinger</h2>
        <span className="rounded-full border border-violet-400/30 bg-violet-500/10 px-2 py-0.5 text-xs text-violet-200">{items.length}</span>
        <span className="ml-2 text-xs text-slate-500">Generiske agent-handlinger som krever godkjenning</span>
      </div>

      {error && <div className="mb-3 rounded-lg border border-rose-400/30 bg-rose-400/10 px-3 py-2 text-sm text-rose-200">{error}</div>}

      <div className="space-y-3">
        {items.map((a) => (
          <div key={a.id} className="rounded-xl border border-slate-700/60 bg-slate-900/50 p-4">
            <div className="mb-1 flex items-start justify-between gap-3">
              <p className="font-semibold text-white">{a.title}</p>
              <span className="shrink-0 rounded-md px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide" style={{ color: riskColor(a.risk), background: `${riskColor(a.risk)}18` }}>{a.risk ?? "?"}</span>
            </div>
            {a.reason && <p className="mb-2 text-sm text-slate-400">{a.reason}</p>}
            <div className="mb-3 flex flex-wrap items-center gap-2 font-mono text-[11px] text-slate-500">
              <span className="rounded border border-slate-700 bg-black/30 px-1.5 py-0.5 text-cyan-300/80">{a.subjectType}{a.subjectRef ? `:${a.subjectRef}` : ""}</span>
              <span className="flex items-center gap-1"><Bot size={12} /> {a.gatedActionClass}</span>
              {a.confidence != null && <span>conf {Math.round(a.confidence > 1 ? a.confidence : a.confidence * 100)}%</span>}
              {eur(a.estimatedOpportunityEur) && <span className="text-emerald-300/80">{eur(a.estimatedOpportunityEur)}</span>}
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => resolve(a.id, "approve")} disabled={busyId === a.id} className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-emerald-400/30 bg-emerald-400/10 px-3 py-2 text-sm font-semibold text-emerald-300 transition-colors hover:bg-emerald-400/20 disabled:opacity-40">
                {busyId === a.id ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />} Godkjenn
              </button>
              <button onClick={() => resolve(a.id, "reject")} disabled={busyId === a.id} className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-rose-400/30 bg-rose-400/10 px-3 py-2 text-sm font-semibold text-rose-300 transition-colors hover:bg-rose-400/20 disabled:opacity-40">
                <X size={15} /> Avvis
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
