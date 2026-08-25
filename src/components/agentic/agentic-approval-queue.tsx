"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Bot, Check, CheckCircle2, Cpu, Loader2, X } from "lucide-react";

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

type ResolutionNotice = {
  id: string;
  decision: "approve" | "reject";
  title: string;
  executionOk: boolean | null;
};

const eur = (v?: number | null) => (v == null ? null : new Intl.NumberFormat("en-US", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(v));
const riskColor = (r?: string | null) => (r === "critical" || r === "high" ? "#fb7185" : r === "medium" ? "#fbbf24" : "#34d399");

export function AgenticApprovalQueue() {
  const params = useSearchParams();
  const requestedApprovalId = params.get("approvalId");
  const [items, setItems] = useState<AgenticApproval[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [resolution, setResolution] = useState<ResolutionNotice | null>(null);

  const focusedId = useMemo(() => requestedApprovalId || null, [requestedApprovalId]);

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

  useEffect(() => {
    if (!focusedId || loading) return;
    const el = document.getElementById(`agentic-approval-${focusedId}`);
    if (el) requestAnimationFrame(() => el.scrollIntoView({ behavior: "smooth", block: "center" }));
  }, [focusedId, loading, items]);

  const resolve = useCallback(async (id: string, decision: "approve" | "reject") => {
    setBusyId(id);
    setError(null);
    const item = items.find((candidate) => candidate.id === id);
    try {
      const res = await fetch(`/api/agentic/approvals/${id}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ decision }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        const executionOk = decision === "approve"
          ? typeof data?.execution?.ok === "boolean" ? data.execution.ok : null
          : null;
        setResolution({ id, decision, title: item?.title || "Agent-handling", executionOk });
        setItems((prev) => prev.filter((i) => i.id !== id));
      } else {
        setError(data.error || "Handling feilet");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nettverksfeil");
    } finally {
      setBusyId(null);
    }
  }, [items]);

  if (loading && items.length === 0 && !resolution) return null;
  if (items.length === 0 && !resolution) return null;

  return (
    <section className="rounded-2xl border border-violet-500/25 bg-violet-500/[0.06] p-5">
      <div className="mb-3 flex items-center gap-2">
        <Cpu size={17} className="text-violet-300" />
        <h2 className="text-lg font-semibold text-white">Agent-handlinger</h2>
        <span className="rounded-full border border-violet-400/30 bg-violet-500/10 px-2 py-0.5 text-xs text-violet-200">{items.length}</span>
        <span className="ml-2 text-xs text-slate-500">Generiske agent-handlinger som krever godkjenning</span>
      </div>

      {error && <div className="mb-3 rounded-lg border border-rose-400/30 bg-rose-400/10 px-3 py-2 text-sm text-rose-200">{error}</div>}

      {resolution && (
        <div className={`mb-4 rounded-xl border p-4 ${resolution.decision === "approve" ? "border-emerald-400/30 bg-emerald-400/10" : "border-rose-400/30 bg-rose-400/10"}`}>
          <div className="flex items-start gap-3">
            <CheckCircle2 size={20} className={resolution.decision === "approve" ? "mt-0.5 text-emerald-300" : "mt-0.5 text-rose-300"} />
            <div className="min-w-0 flex-1">
              <div className={`font-semibold ${resolution.decision === "approve" ? "text-emerald-200" : "text-rose-200"}`}>{resolution.decision === "approve" ? "Godkjent" : "Avvist"}: {resolution.title}</div>
              <p className="mt-1 text-sm text-slate-300">
                {resolution.decision === "reject"
                  ? "Approvalen er avvist. Ingen publisering skal utføres fra denne approvalen."
                  : resolution.executionOk === true
                    ? "Approval og execution ble behandlet. Åpne Nexus Director for den faktiske publiseringsstatusen."
                    : resolution.executionOk === false
                      ? "Approvalen er godkjent, men execution rapporterte feil. Nexus Director viser den faktiske statusen og eventuell retry-behov."
                      : "Approvalen er godkjent. Åpne Nexus Director for den faktiske execution-/publiseringsstatusen."}
              </p>
              <Link href="/nexus-os/director" className="mt-3 inline-flex rounded-lg bg-white px-3 py-2 text-xs font-black text-slate-900">Tilbake til Nexus Director →</Link>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {items.map((a) => {
          const focused = focusedId === a.id;
          return (
            <div
              key={a.id}
              id={`agentic-approval-${a.id}`}
              className={`scroll-mt-28 rounded-xl border p-4 transition-all ${focused ? "border-cyan-300 bg-cyan-400/10 ring-2 ring-cyan-300/50" : "border-slate-700/60 bg-slate-900/50"}`}
            >
              {focused && <div className="mb-2 text-[10px] font-black uppercase tracking-[0.18em] text-cyan-300">Åpnet fra Nexus Director</div>}
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
          );
        })}
      </div>
    </section>
  );
}
