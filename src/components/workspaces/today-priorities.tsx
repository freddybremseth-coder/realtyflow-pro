"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowRight, BrainCircuit, RefreshCw, Sparkles } from "lucide-react";
import type { WorkspacePermission } from "@/lib/workspaces/brand-policy";
import {
  buildWorkspaceTodayActions,
  type WorkspaceAttentionSignal,
  type WorkspaceTodayArea,
} from "@/lib/workspaces/today-priority";

type InsightsResponse = {
  attention?: WorkspaceAttentionSignal[];
};

export function WorkspaceTodayPriorities({
  brandKey,
  permissions,
  contactCount,
  onOpen,
}: {
  brandKey: string;
  permissions: WorkspacePermission[];
  contactCount: number;
  onOpen: (area: WorkspaceTodayArea) => void;
}) {
  const [attention, setAttention] = useState<WorkspaceAttentionSignal[]>([]);
  const [loadingSignals, setLoadingSignals] = useState(false);

  async function loadSignals() {
    if (!permissions.includes("nexus.read")) {
      setAttention([]);
      return;
    }
    setLoadingSignals(true);
    try {
      const response = await fetch(`/api/workspaces/${encodeURIComponent(brandKey)}/nexus-insights`, {
        cache: "no-store",
      });
      const body = await response.json().catch(() => ({})) as InsightsResponse;
      setAttention(response.ok && Array.isArray(body.attention) ? body.attention : []);
    } catch {
      setAttention([]);
    } finally {
      setLoadingSignals(false);
    }
  }

  useEffect(() => { void loadSignals(); }, [brandKey, permissions]);

  const actions = useMemo(() => buildWorkspaceTodayActions({
    brandKey,
    permissions,
    contactCount,
    attention,
    limit: 4,
  }), [brandKey, permissions, contactCount, attention]);

  return <section className="rounded-2xl border border-cyan-900/60 bg-cyan-950/10 p-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-cyan-300">Nexus-prioritering</p>
        <h2 className="mt-2 text-xl font-bold">Dette bør du gjøre i dag</h2>
        <p className="mt-2 max-w-2xl text-sm text-slate-400">
          Prioriteringen bruker bare det du har tilgang til i denne merkevaren. Systemjobber, andre brands og admin-funksjoner holdes skjult.
        </p>
      </div>
      {permissions.includes("nexus.read") && <button type="button" onClick={() => void loadSignals()} disabled={loadingSignals}
        className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-300 disabled:opacity-40">
        <RefreshCw size={14}/>{loadingSignals ? "Oppdaterer…" : "Oppdater signaler"}
      </button>}
    </div>

    <div className="mt-5 space-y-3">
      {actions.map((action, index) => <button
        key={action.id}
        type="button"
        onClick={() => onOpen(action.area)}
        className="w-full rounded-xl border border-slate-800 bg-slate-950/55 p-4 text-left hover:border-cyan-600"
      >
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-cyan-900 bg-cyan-950/50 text-sm font-bold text-cyan-200">
            {index + 1}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-semibold text-slate-100">{action.title}</h3>
              {action.source === "nexus" && <span className="inline-flex items-center gap-1 rounded-full border border-violet-900 bg-violet-950/35 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-violet-300">
                <BrainCircuit size={11}/> Nexus
              </span>}
              {index === 0 && <span className="inline-flex items-center gap-1 rounded-full border border-emerald-900 bg-emerald-950/35 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-300">
                <Sparkles size={11}/> Start her
              </span>}
            </div>
            <p className="mt-1 text-sm text-slate-300">{action.description}</p>
            <p className="mt-2 text-xs leading-5 text-slate-500">Hvorfor: {action.reason}</p>
          </div>
          <ArrowRight size={18} className="mt-1 shrink-0 text-slate-500"/>
        </div>
      </button>)}
    </div>
  </section>;
}
