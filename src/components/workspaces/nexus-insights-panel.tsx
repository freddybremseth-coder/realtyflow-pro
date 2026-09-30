"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, BrainCircuit, RefreshCw, Sparkles, Target } from "lucide-react";

type Attention = { level: "info" | "watch" | "action"; title: string; detail: string };
type Source = {
  type: string; title: string; priority: number; channels: string[];
  status: string; blockedReason: string | null; updatedAt: string | null;
};
type Rule = {
  channel: string | null; dimension: string; value: string; sample: number;
  qualifiedLeadRate: number; lift: number; verdict: string | null;
  finding: string | null; updatedAt: string | null;
};
type Payload = {
  readOnly: boolean;
  generatedAt: string;
  sourceSummary: {
    total: number; ready: number; drafted: number; blocked: number; pending: number;
    byStatus: Record<string, number>; byType: Record<string, number>;
  };
  topSources: Source[];
  learningSummary: { total: number; rules: Rule[] };
  growthPlan: null | {
    status: string; sourceTypes: string[]; plannedChannels: string[];
    conversionGoals: string[]; primaryCtas: string[]; updatedAt: string | null;
  };
  ownerFocus: Array<{
    key: string; title: string; intensity: number;
    successDefinition: string | null; reviewDueAt: string | null;
  }>;
  attention: Attention[];
  warnings: string[];
};

function pct(value: number) {
  if (!Number.isFinite(value)) return "0";
  const normalized = Math.abs(value) <= 1 ? value * 100 : value;
  return normalized.toLocaleString("nb-NO", { maximumFractionDigits: 1 });
}

function statusText(value: string) {
  const map: Record<string, string> = {
    ready: "Klar", drafted: "Utkast laget", blocked: "Blokkert", pending: "Venter",
    active: "Aktiv", pilot: "Pilot", configured: "Konfigurert",
  };
  return map[value] || value;
}

export function WorkspaceNexusInsightsPanel({ brandKey }: { brandKey: string }) {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/workspaces/${encodeURIComponent(brandKey)}/nexus-insights`, {
        cache: "no-store",
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error?.code || "Nexus Innsikt er ikke tilgjengelig.");
      setData(body);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Nexus Innsikt er ikke tilgjengelig.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [brandKey]);

  return <div className="space-y-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h3 className="flex items-center gap-2 text-lg font-semibold text-violet-100">
          <BrainCircuit size={20}/> Nexus OS · innsikt
        </h3>
        <p className="mt-1 max-w-2xl text-sm text-slate-400">
          Se hva Nexus lærer om denne merkevaren, hvilke kilder som er klare og hvilke prioriteringer som gjelder.
          Denne arbeidsflaten er kun lesing.
        </p>
      </div>
      <button type="button" onClick={() => void load()} disabled={loading}
        className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-xs disabled:opacity-40">
        <RefreshCw size={14}/>{loading ? "Oppdaterer…" : "Oppdater"}
      </button>
    </div>

    <div className="rounded-xl border border-violet-900/60 bg-violet-950/15 p-4 text-sm">
      <strong className="text-violet-100">Trygg innsiktsmodus</strong>
      <p className="mt-1 text-xs text-slate-400">
        Ingen runtime-kontroller, autonomy-policy, canary, kundeidentitet, provisjon eller agentisk utførelse er tilgjengelig her.
        Du trenger ikke kjøre systemjobber manuelt fra denne siden.
      </p>
    </div>

    {error && <p role="alert" className="rounded-lg border border-amber-800 bg-amber-950/25 p-3 text-sm text-amber-200">{error}</p>}
    {data?.warnings?.length ? <div className="rounded-lg border border-amber-900/70 bg-amber-950/15 p-3 text-xs text-amber-200">
      {data.warnings.join(" · ")}
    </div> : null}

    {data && <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {[
        ["Kilder", data.sourceSummary.total],
        ["Klare", data.sourceSummary.ready],
        ["Utkast", data.sourceSummary.drafted],
        ["Læringsregler", data.learningSummary.total],
      ].map(([label, value]) => <div key={String(label)} className="rounded-xl border border-slate-800 bg-slate-950/50 p-4">
        <p className="text-xs uppercase tracking-wider text-slate-500">{label}</p>
        <strong className="mt-1 block text-2xl">{Number(value).toLocaleString("nb-NO")}</strong>
      </div>)}
    </div>}

    {data?.attention?.length ? <section>
      <h4 className="flex items-center gap-2 font-semibold"><AlertTriangle size={16}/> Trenger oppmerksomhet</h4>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        {data.attention.map((item, index) => <article key={index}
          className="rounded-xl border border-slate-800 bg-slate-950/45 p-4">
          <p className="text-[10px] font-black uppercase tracking-wider text-violet-300">{item.level}</p>
          <h5 className="mt-1 font-semibold">{item.title}</h5>
          <p className="mt-1 text-xs leading-5 text-slate-400">{item.detail}</p>
        </article>)}
      </div>
    </section> : null}

    {data?.ownerFocus?.length ? <section className="rounded-xl border border-cyan-900/50 bg-cyan-950/10 p-4">
      <h4 className="flex items-center gap-2 font-semibold text-cyan-100"><Target size={16}/> Prioritet fra eier</h4>
      <div className="mt-3 space-y-3">
        {data.ownerFocus.map(item => <article key={item.key} className="rounded-lg border border-cyan-900/40 bg-slate-950/35 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <strong>{item.title}</strong><span className="text-xs text-cyan-300">Intensitet {item.intensity}</span>
          </div>
          {item.successDefinition && <p className="mt-2 text-xs text-cyan-100">Mål: {item.successDefinition}</p>}
        </article>)}
      </div>
    </section> : null}

    {data?.growthPlan && <section className="rounded-xl border border-slate-800 bg-slate-950/45 p-4">
      <h4 className="font-semibold">Vekstplan</h4>
      <p className="mt-1 text-xs text-slate-500">Status: {statusText(data.growthPlan.status)}</p>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <div><p className="text-xs font-semibold text-slate-300">Planlagte kanaler</p>
          <p className="mt-1 text-xs text-slate-500">{data.growthPlan.plannedChannels.join(" · ") || "Ingen registrert"}</p></div>
        <div><p className="text-xs font-semibold text-slate-300">Konverteringsmål</p>
          <p className="mt-1 text-xs text-slate-500">{data.growthPlan.conversionGoals.join(" · ") || "Ingen registrert"}</p></div>
        <div><p className="text-xs font-semibold text-slate-300">Kildetyper</p>
          <p className="mt-1 text-xs text-slate-500">{data.growthPlan.sourceTypes.join(" · ") || "Ingen registrert"}</p></div>
        <div><p className="text-xs font-semibold text-slate-300">Primære CTA-er</p>
          <p className="mt-1 text-xs text-slate-500">{data.growthPlan.primaryCtas.join(" · ") || "Ingen registrert"}</p></div>
      </div>
    </section>}

    {data?.learningSummary.rules.length ? <section>
      <h4 className="flex items-center gap-2 font-semibold"><Sparkles size={16}/> Hva Nexus lærer</h4>
      <p className="mt-1 text-xs text-slate-500">Målte regler for denne merkevaren. Dette er signaler, ikke automatisk tillatelse til å publisere eller kontakte kunder.</p>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        {data.learningSummary.rules.map((rule, index) => <article key={index}
          className="rounded-xl border border-slate-800 bg-slate-950/45 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <strong className="text-sm">{rule.dimension}{rule.value ? ` · ${rule.value}` : ""}</strong>
            {rule.channel && <span className="text-[10px] uppercase tracking-wider text-violet-300">{rule.channel}</span>}
          </div>
          {rule.finding && <p className="mt-2 text-xs leading-5 text-slate-300">{rule.finding}</p>}
          <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-slate-500">
            <span>Datagrunnlag {rule.sample}</span>
            {rule.lift !== 0 && <span>Lift {pct(rule.lift)}%</span>}
            {rule.qualifiedLeadRate !== 0 && <span>Kvalifisert lead-rate {pct(rule.qualifiedLeadRate)}%</span>}
            {rule.verdict && <span>{rule.verdict}</span>}
          </div>
        </article>)}
      </div>
    </section> : null}

    {data?.topSources?.length ? <section>
      <h4 className="font-semibold">Kilder Nexus følger</h4>
      <p className="mt-1 text-xs text-slate-500">Kun tittel, type, status og anbefalte kanaler vises. Rå payload og interne kilde-ID-er er skjult.</p>
      <div className="mt-3 space-y-2">
        {data.topSources.map((source, index) => <article key={index}
          className="rounded-xl border border-slate-800 bg-slate-950/45 p-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-wider text-slate-500">{source.type} · {statusText(source.status)}</p>
              <h5 className="mt-1 text-sm font-medium">{source.title}</h5>
              {source.blockedReason && <p className="mt-1 text-xs text-amber-300">{source.blockedReason}</p>}
            </div>
            <div className="text-right text-xs text-slate-500">
              <div>Prioritet {source.priority.toLocaleString("nb-NO", { maximumFractionDigits: 1 })}</div>
              <div className="mt-1">{source.channels.join(" · ")}</div>
            </div>
          </div>
        </article>)}
      </div>
    </section> : null}
  </div>;
}
