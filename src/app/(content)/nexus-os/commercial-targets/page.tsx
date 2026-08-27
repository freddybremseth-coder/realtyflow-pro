"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  Loader2,
  RefreshCw,
  Save,
  ShieldCheck,
  Target,
} from "lucide-react";
import { businessPipelineForBrand } from "@/lib/business-pipeline-registry";

type StoredTarget = {
  brandId: string;
  pipelineId: string;
  targetNewPerWeek: number | null;
  targetConversionsPerMonth: number | null;
  updatedAt: string | null;
};

type GrowthPlan = {
  brandId: string;
  status: string;
  conversionGoals: string[];
  primaryCtas: string[];
  updatedAt: string | null;
};

type TargetPayload = {
  targets: StoredTarget[];
  plans: GrowthPlan[];
  error?: string;
};

type TargetEvidence = StoredTarget & {
  acquisitionEvidenceReady: boolean;
  acquisitionBaselineDays: number | null;
  newOpportunities7d: number | null;
  conversionEvidenceReady: boolean;
  realizedConversions30d: number | null;
  reason: string;
};

type CommandPayload = {
  commercialTargets?: TargetEvidence[];
  syncHealth?: {
    state: "healthy" | "attention" | "stale" | "unknown";
    trustedForPipelineDecisions: boolean;
    lastRunAt: string | null;
    ageMinutes: number | null;
    storeCount: number;
    reason: string;
  };
  error?: string;
};

type Draft = { weekly: string; monthly: string };

function numberOrNull(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function key(brandId: string, pipelineId: string) {
  return `${brandId}:${pipelineId}`;
}

function syncBadge(state?: string) {
  if (state === "healthy") return "bg-emerald-100 text-emerald-800";
  if (state === "attention") return "bg-rose-100 text-rose-800";
  if (state === "stale") return "bg-amber-100 text-amber-800";
  return "bg-slate-100 text-slate-700";
}

export default function NexusCommercialTargetsPage() {
  const [targetsPayload, setTargetsPayload] = useState<TargetPayload | null>(null);
  const [command, setCommand] = useState<CommandPayload | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [targetsResponse, commandResponse] = await Promise.all([
        fetch("/api/nexus/revenue-command/targets", { cache: "no-store", credentials: "same-origin" }),
        fetch("/api/nexus/revenue-command", { cache: "no-store", credentials: "same-origin" }),
      ]);
      const targetsBody = await targetsResponse.json().catch(() => ({}));
      const commandBody = await commandResponse.json().catch(() => ({}));
      if (!targetsResponse.ok) throw new Error(targetsBody?.error || `Targets feilet (${targetsResponse.status})`);
      if (!commandResponse.ok) throw new Error(commandBody?.error || `Revenue Command feilet (${commandResponse.status})`);

      const targetData = targetsBody as TargetPayload;
      setTargetsPayload(targetData);
      setCommand(commandBody as CommandPayload);

      const nextDrafts: Record<string, Draft> = {};
      for (const plan of targetData.plans || []) {
        const binding = businessPipelineForBrand(plan.brandId);
        if (!binding) continue;
        const id = key(plan.brandId, binding.pipeline.id);
        const target = (targetData.targets || []).find(
          (item) => item.brandId === plan.brandId && item.pipelineId === binding.pipeline.id,
        );
        nextDrafts[id] = {
          weekly: target?.targetNewPerWeek ? String(target.targetNewPerWeek) : "",
          monthly: target?.targetConversionsPerMonth ? String(target.targetConversionsPerMonth) : "",
        };
      }
      setDrafts(nextDrafts);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const evidence = useMemo(
    () => new Map((command?.commercialTargets || []).map((row) => [key(row.brandId, row.pipelineId), row])),
    [command?.commercialTargets],
  );

  const save = useCallback(async (brandId: string, pipelineId: string, clear = false) => {
    const id = key(brandId, pipelineId);
    const draft = drafts[id] || { weekly: "", monthly: "" };
    setSavingKey(id);
    setError(null);
    setSaved(null);
    try {
      const response = await fetch("/api/nexus/revenue-command/targets", {
        method: "PUT",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brandId,
          pipelineId,
          targetNewPerWeek: clear ? null : numberOrNull(draft.weekly),
          targetConversionsPerMonth: clear ? null : numberOrNull(draft.monthly),
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error || `Lagring feilet (${response.status})`);
      setSaved(id);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSavingKey(null);
    }
  }, [drafts, load]);

  const plans = targetsPayload?.plans || [];
  const sync = command?.syncHealth;

  return (
    <main className="mx-auto max-w-[1400px] space-y-6 p-4 sm:p-6">
      <header className="rounded-3xl border border-slate-800 bg-slate-950 p-6 text-white shadow-xl">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <Link href="/nexus-os/revenue-command" className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-cyan-300">
              <ArrowLeft size={15} /> Revenue Command
            </Link>
            <div className="mt-4 flex items-center gap-2 text-xs font-black uppercase tracking-[0.2em] text-violet-300">
              <Target size={17} /> Commercial Targets
            </div>
            <h1 className="mt-2 text-3xl font-black">Sett retning uten at Nexus finner på målene</h1>
            <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-300">
              Hver merkevare beholder sin egen pipeline og sine egne success-events. Du setter eksplisitte mål; Nexus kan først bruke dem når datagrunnlaget er verifisert modent.
            </p>
          </div>
          <button onClick={() => void load()} disabled={loading} className="inline-flex items-center justify-center rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-sm font-black hover:bg-white/10 disabled:opacity-50">
            {loading ? <Loader2 size={16} className="mr-2 animate-spin" /> : <RefreshCw size={16} className="mr-2" />} Oppdater
          </button>
        </div>
      </header>

      <section className="grid gap-3 lg:grid-cols-[1fr_2fr]">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-xs font-black uppercase tracking-wider text-slate-400">Opportunity Sync</div>
              <div className="mt-1 text-xl font-black text-slate-950">Datatillit</div>
            </div>
            <span className={`rounded-full px-3 py-1 text-xs font-black uppercase ${syncBadge(sync?.state)}`}>{sync?.state || "unknown"}</span>
          </div>
          <p className="mt-3 text-sm leading-6 text-slate-600">{sync?.reason || "Ingen sync-health tilgjengelig ennå."}</p>
          <div className="mt-3 text-xs font-bold text-slate-500">{sync?.storeCount ?? 0} opportunities · {sync?.ageMinutes == null ? "ukjent alder" : `${sync.ageMinutes} min siden sync`}</div>
        </div>

        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-sm text-emerald-950">
          <div className="flex items-start gap-3"><ShieldCheck size={20} className="mt-0.5 shrink-0" /><div><b>Guarded goals.</b> Et tall du lagrer blir ikke automatisk et press-signal. Weekly Demand Generation krever trusted sync og minst 7 dager med Nexus first-seen-observasjon. Monthly conversions lagres, men brukes ikke av Director før hver business har en verifisert conversion-timestamp-kilde.</div></div>
        </div>
      </section>

      {error && <section className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-900">{error}</section>}

      <section className="space-y-4">
        {plans.map((plan) => {
          const binding = businessPipelineForBrand(plan.brandId);
          if (!binding) {
            return <article key={plan.brandId} className="rounded-2xl border border-amber-200 bg-amber-50 p-5"><div className="flex items-center gap-2 font-black text-amber-900"><AlertTriangle size={18} /> {plan.brandId}</div><p className="mt-2 text-sm text-amber-800">Ingen business-pipeline binding finnes ennå. Nexus setter derfor ikke kommersielle mål for denne merkevaren.</p></article>;
          }

          const pipelineId = binding.pipeline.id;
          const id = key(plan.brandId, pipelineId);
          const draft = drafts[id] || { weekly: "", monthly: "" };
          const targetEvidence = evidence.get(id);
          const isSaving = savingKey === id;
          const isActive = String(plan.status || "").toLowerCase() === "active";

          return (
            <article key={id} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-slate-950 px-2.5 py-1 text-[10px] font-black uppercase text-white">{plan.brandId}</span>
                    <span className="rounded-full bg-cyan-50 px-2.5 py-1 text-[10px] font-black text-cyan-800">{binding.pipeline.name}</span>
                    <span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase ${isActive ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-600"}`}>{plan.status}</span>
                  </div>
                  <h2 className="mt-3 text-xl font-black text-slate-950">{binding.pipeline.successEvent}</h2>
                  <p className="mt-1 text-sm text-slate-600">{binding.binding.note}</p>
                  <div className="mt-3 text-xs text-slate-500"><b>Eksisterende conversion goals:</b> {(plan.conversionGoals || []).join(" · ") || "—"}</div>
                  <div className="mt-1 text-xs text-slate-500"><b>CTA-er:</b> {(plan.primaryCtas || []).join(" · ") || "—"}</div>
                </div>

                <div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:w-[520px]">
                  <label className="block">
                    <span className="text-xs font-black uppercase tracking-wider text-slate-500">Nye opportunities / uke</span>
                    <input type="number" min="0" step="1" inputMode="numeric" value={draft.weekly} onChange={(e) => setDrafts((current) => ({ ...current, [id]: { ...draft, weekly: e.target.value } }))} placeholder="Ikke satt" className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm font-bold outline-none focus:border-cyan-500" />
                  </label>
                  <label className="block">
                    <span className="text-xs font-black uppercase tracking-wider text-slate-500">Conversions / måned</span>
                    <input type="number" min="0" step="1" inputMode="numeric" value={draft.monthly} onChange={(e) => setDrafts((current) => ({ ...current, [id]: { ...draft, monthly: e.target.value } }))} placeholder="Ikke satt" className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm font-bold outline-none focus:border-cyan-500" />
                  </label>
                  <button onClick={() => void save(plan.brandId, pipelineId)} disabled={isSaving} className="inline-flex items-center justify-center rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-black text-white hover:bg-slate-800 disabled:opacity-50">{isSaving ? <Loader2 size={16} className="mr-2 animate-spin" /> : <Save size={16} className="mr-2" />}Lagre mål</button>
                  <button onClick={() => void save(plan.brandId, pipelineId, true)} disabled={isSaving} className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-black text-slate-700 hover:bg-slate-50 disabled:opacity-50">Fjern mål</button>
                </div>
              </div>

              <div className={`mt-5 rounded-2xl border p-4 text-sm ${targetEvidence?.acquisitionEvidenceReady ? "border-emerald-200 bg-emerald-50 text-emerald-950" : "border-slate-200 bg-slate-50 text-slate-700"}`}>
                <div className="font-black">Evidence readiness</div>
                <div className="mt-1 leading-6">{targetEvidence?.reason || (isActive ? "Ingen eksplisitt target er lagret for denne pipeline-en." : "Planen er ikke aktiv; targets kan lagres, men driver ikke Director.")}</div>
                {targetEvidence && <div className="mt-2 text-xs font-bold">Baseline: {targetEvidence.acquisitionBaselineDays == null ? "—" : `${Math.floor(targetEvidence.acquisitionBaselineDays)} dager`} · Nye siste 7d: {targetEvidence.newOpportunities7d ?? "ikke trusted ennå"} · Conversion evidence: {targetEvidence.conversionEvidenceReady ? "klar" : "venter på business-spesifikk sannhetskilde"}</div>}
              </div>

              {saved === id && <div className="mt-3 text-xs font-black text-emerald-700">Mål lagret og Revenue Command oppdatert.</div>}
            </article>
          );
        })}

        {!loading && plans.length === 0 && <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">Ingen Brand Growth-planer finnes ennå.</div>}
      </section>
    </main>
  );
}
