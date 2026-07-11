"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  CircleAlert,
  Database,
  GitMerge,
  Loader2,
  RefreshCw,
  Server,
  ShieldCheck,
  Tags,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type {
  ProductionReadinessCheck,
  QualityCategory,
  QualitySeverity,
  RevenueDataHealthReport,
  RevenueDataIssue,
  RevenueDataBrand,
} from "@/lib/revenue/data-quality";

const BRAND_LABELS: Record<RevenueDataBrand, string> = {
  zeneco: "Zen Eco Homes",
  soleada: "Soleada.no",
  pinosoecolife: "Pinoso EcoLife",
  keyholding: "Keyholding",
};
const CATEGORY_LABELS: Record<QualityCategory, string> = {
  DUPLICATE: "Duplikater",
  BRAND: "Brand",
  SOURCE: "Kilde",
  FOLLOWUP: "Oppfølging",
  VALUE: "Verdi",
  COMMISSION: "Provisjon",
  STATUS: "Status",
  CONTACT: "Kontaktdata",
  KEYHOLDING: "Keyholding",
};
const SEVERITY_LABELS: Record<QualitySeverity, string> = {
  CRITICAL: "Kritisk",
  HIGH: "Høy",
  MEDIUM: "Middels",
  LOW: "Lav",
};

function severityClass(severity: QualitySeverity) {
  if (severity === "CRITICAL") return "border-red-500/40 bg-red-500/10 text-red-200";
  if (severity === "HIGH") return "border-orange-500/40 bg-orange-500/10 text-orange-200";
  if (severity === "MEDIUM") return "border-amber-500/40 bg-amber-500/10 text-amber-200";
  return "border-slate-600 bg-slate-800 text-slate-300";
}

function readinessClass(status: "READY" | "WARNING" | "BLOCKED") {
  if (status === "READY") return "border-emerald-500/35 bg-emerald-500/10 text-emerald-200";
  if (status === "BLOCKED") return "border-red-500/35 bg-red-500/10 text-red-200";
  return "border-amber-500/35 bg-amber-500/10 text-amber-200";
}

function futureIso(days: number) {
  return new Date(Date.now() + days * 86_400_000).toISOString();
}

function Metric({ label, value, icon: Icon }: { label: string; value: string | number; icon: LucideIcon }) {
  return <article className="rounded-xl border border-slate-700/70 bg-slate-900/60 p-4">
    <Icon size={19} className="text-cyan-300" />
    <p className="mt-3 text-[10px] font-semibold uppercase text-slate-500">{label}</p>
    <strong className="mt-1 block text-2xl text-white">{value}</strong>
  </article>;
}

function CheckRow({ check }: { check: ProductionReadinessCheck }) {
  return <div className="flex items-start justify-between gap-3 border-b border-slate-700/40 py-3 last:border-0">
    <div className="min-w-0">
      <p className="text-sm font-medium text-white">{check.label}</p>
      <p className="mt-1 text-xs text-slate-500">{check.detail}</p>
      {(check.count !== undefined || check.latencyMs !== undefined) && <p className="mt-1 font-mono text-[10px] text-slate-600">{check.count !== undefined ? `${check.count ?? "–"} rader` : ""}{check.latencyMs !== undefined ? ` · ${check.latencyMs ?? "–"} ms` : ""}</p>}
    </div>
    <span className={`shrink-0 rounded-full border px-2 py-1 text-[10px] font-semibold ${readinessClass(check.status)}`}>{check.status}</span>
  </div>;
}

export default function RevenueDataHealthPage() {
  const [report, setReport] = useState<RevenueDataHealthReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [category, setCategory] = useState<QualityCategory | "ALL">("ALL");
  const [severity, setSeverity] = useState<QualitySeverity | "ALL">("ALL");
  const [brandDrafts, setBrandDrafts] = useState<Record<string, RevenueDataBrand>>({});

  async function load() {
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/revenue/data-quality", { cache: "no-store" });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error || "Kunne ikke hente Revenue Data Health.");
      setReport(body?.report || null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunne ikke hente Revenue Data Health.");
    } finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, []);

  const visible = useMemo(() => (report?.issues || []).filter((issue) => {
    if (category !== "ALL" && issue.category !== category) return false;
    if (severity !== "ALL" && issue.severity !== severity) return false;
    return true;
  }), [report?.issues, category, severity]);

  async function act(issue: RevenueDataIssue, action: string, extra: Record<string, unknown> = {}) {
    if (action === "MARK_DUPLICATE_REVIEWED" && !window.confirm("Markere duplikatgruppen som manuelt gjennomgått? Ingen poster slås sammen eller slettes.")) return;
    setBusy(`${issue.id}-${action}`); setFeedback("");
    try {
      const payload = action === "MARK_DUPLICATE_REVIEWED"
        ? { action, contactIds: issue.contactIds, ...extra }
        : { action, contactId: issue.primaryContactId, ...extra };
      const response = await fetch("/api/revenue/data-quality", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error || "Rettelsen feilet.");
      setFeedback("Intern datakvalitetsendring er registrert. Ingen kundekontakt ble sendt.");
      await load();
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : "Rettelsen feilet.");
    } finally { setBusy(null); }
  }

  function ActionButton({ issue, action, children, onClick }: { issue: RevenueDataIssue; action: string; children: ReactNode; onClick?: () => void }) {
    const key = `${issue.id}-${action}`;
    return <Button size="sm" variant="outline" disabled={Boolean(busy)} onClick={onClick || (() => void act(issue, action))}>
      {busy === key && <Loader2 size={14} className="mr-2 animate-spin" />}{children}
    </Button>;
  }

  if (loading && !report) return <div className="flex min-h-[50vh] items-center justify-center text-slate-400"><Loader2 className="mr-2 animate-spin" />Kontrollerer produksjon og CRM-data …</div>;

  return <div className="mx-auto max-w-7xl space-y-6">
    <header className="flex flex-col gap-4 rounded-2xl border border-slate-700/70 bg-slate-900/70 p-6 lg:flex-row lg:items-center lg:justify-between">
      <div>
        <div className="mb-2 flex items-center gap-2 text-sm font-medium text-cyan-300"><ShieldCheck size={17} /> Freddy Revenue OS</div>
        <h1 className="text-3xl font-bold text-white">Revenue Data Health</h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-400">Produksjonsstatus, CRM-kvalitet og kontrollerte rettelser uten automatisk sammenslåing, utsending eller økonomisk bokføring.</p>
      </div>
      <div className="flex flex-wrap gap-2"><Button asChild variant="outline"><Link href="/data-health">Supabase Data Health</Link></Button><Button asChild variant="outline"><Link href="/revenue-command">Revenue Command</Link></Button><Button onClick={load} disabled={loading}>{loading ? <Loader2 size={15} className="mr-2 animate-spin" /> : <RefreshCw size={15} className="mr-2" />}Oppdater</Button></div>
    </header>

    <div className="flex gap-3 rounded-xl border border-cyan-500/25 bg-cyan-500/5 p-4 text-sm text-slate-300"><ShieldCheck size={20} className="shrink-0 text-cyan-300" /><div><strong className="text-white">Manuell kontroll:</strong> Systemet foreslår rettelser, men sender ikke e-post, WhatsApp eller SMS. Duplikater slettes eller slås aldri sammen her.</div></div>
    {error && <div className="flex gap-2 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200"><AlertTriangle size={18} />{error}</div>}
    {feedback && <div className="flex gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-200"><CheckCircle2 size={17} />{feedback}</div>}

    {report && <>
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-7">
        <Metric label="Samlet score" value={`${report.score}%`} icon={ShieldCheck} />
        <Metric label="Readiness" value={`${report.readiness.score}%`} icon={Server} />
        <Metric label="Kontakter" value={report.summary.contacts} icon={Database} />
        <Metric label="Problemer" value={report.summary.issues} icon={CircleAlert} />
        <Metric label="Kritiske" value={report.summary.critical} icon={AlertTriangle} />
        <Metric label="Duplikatgrupper" value={report.summary.duplicateGroups} icon={GitMerge} />
        <Metric label="Provisjonsdekning" value={`${report.summary.wonCommissionCoveragePercent}%`} icon={Tags} />
      </section>

      <section className="grid gap-4 xl:grid-cols-[1fr_1.4fr]">
        <article className="rounded-xl border border-slate-700/70 bg-slate-900/60 p-5">
          <div className="flex items-center justify-between"><div><p className="text-xs uppercase text-slate-500">Production readiness</p><h2 className="mt-1 text-xl font-semibold text-white">Miljø og datakilder</h2></div><span className={`rounded-full border px-3 py-1 text-xs font-semibold ${readinessClass(report.readiness.status)}`}>{report.readiness.status}</span></div>
          <div className="mt-4">{report.readiness.checks.map((check) => <CheckRow key={check.id} check={check} />)}</div>
          <p className="mt-4 font-mono text-[10px] text-slate-600">Miljø: {report.readiness.environment.vercelEnv || "ukjent"} · deploy {report.readiness.environment.deploymentUrl || "ukjent"} · commit {report.readiness.environment.commitSha?.slice(0, 10) || "ukjent"}</p>
        </article>
        <article className="rounded-xl border border-slate-700/70 bg-slate-900/60 p-5">
          <p className="text-xs uppercase text-slate-500">Datadekning</p><h2 className="mt-1 text-xl font-semibold text-white">Revenue OS-kvalitet</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[
              ["Kjent brand", report.summary.knownBrandPercent], ["Kjent kilde", report.summary.knownSourcePercent],
              ["Aktiv oppfølging", report.summary.activeFollowupCoveragePercent], ["Vunnet provisjon", report.summary.wonCommissionCoveragePercent],
              ["Vunnet salgsverdi", report.summary.wonValueCoveragePercent], ["Kontakter i duplikater", report.summary.contactsInDuplicateGroups],
            ].map(([label, value]) => <div key={String(label)} className="rounded-lg bg-slate-950/40 p-4"><p className="text-[10px] uppercase text-slate-500">{label}</p><strong className="mt-1 block text-xl text-white">{typeof value === "number" && String(label) !== "Kontakter i duplikater" ? `${value}%` : value}</strong></div>)}
          </div>
          <div className="mt-5 flex flex-wrap gap-2">{Object.entries(report.categoryCounts).filter(([, count]) => count > 0).map(([id, count]) => <button key={id} onClick={() => setCategory(id as QualityCategory)} className="rounded-full border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs text-slate-300 hover:border-cyan-500/50">{CATEGORY_LABELS[id as QualityCategory]} · {count}</button>)}</div>
        </article>
      </section>

      <div className="flex flex-col gap-3 rounded-xl border border-slate-700 bg-slate-900/50 p-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap gap-2"><button onClick={() => setCategory("ALL")} className={`rounded-full border px-3 py-1.5 text-xs ${category === "ALL" ? "border-cyan-400/50 bg-cyan-500/15 text-cyan-200" : "border-slate-700 text-slate-400"}`}>Alle kategorier</button>{Object.entries(CATEGORY_LABELS).map(([id, label]) => <button key={id} onClick={() => setCategory(id as QualityCategory)} className={`rounded-full border px-3 py-1.5 text-xs ${category === id ? "border-cyan-400/50 bg-cyan-500/15 text-cyan-200" : "border-slate-700 text-slate-400"}`}>{label}</button>)}</div>
        <select value={severity} onChange={(event) => setSeverity(event.target.value as QualitySeverity | "ALL")} className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-200"><option value="ALL">Alle alvorligheter</option>{Object.entries(SEVERITY_LABELS).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select>
      </div>

      {visible.length === 0 ? <div className="rounded-xl border border-slate-700 bg-slate-900/50 p-8 text-center text-slate-400">Ingen problemer i dette filteret.</div> : <section className="space-y-4">{visible.map((issue) => <article key={issue.id} className="rounded-xl border border-slate-700/70 bg-slate-900/60 p-5">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${severityClass(issue.severity)}`}>{SEVERITY_LABELS[issue.severity]}</span><span className="rounded-full border border-slate-700 bg-slate-800 px-2.5 py-1 text-[11px] text-slate-300">{CATEGORY_LABELS[issue.category]}</span>{issue.brandId && <span className="text-xs text-slate-500">{BRAND_LABELS[issue.brandId as RevenueDataBrand] || issue.brandId}</span>}</div><h2 className="mt-3 text-xl font-semibold text-white">{issue.title}</h2><p className="mt-1 text-sm text-cyan-200">{issue.contactName}{issue.contactIds.length > 1 ? ` · ${issue.contactIds.length} kontakter` : ""}</p><p className="mt-3 text-sm text-slate-400">{issue.description}</p>{issue.currentValue && <p className="mt-2 font-mono text-xs text-slate-500">Nå: {issue.currentValue}{issue.suggestedValue ? ` → Forslag: ${issue.suggestedValue}` : ""}</p>}<div className="mt-4 rounded-lg border border-cyan-500/20 bg-cyan-500/5 p-3"><p className="text-[10px] font-semibold uppercase text-cyan-300">Anbefalt kontroll</p><p className="mt-1 text-sm text-slate-200">{issue.recommendation}</p></div></div>
          <div className="flex w-full flex-col gap-2 xl:w-80">
            {issue.actions.includes("NORMALIZE_STATUS") && <ActionButton issue={issue} action="NORMALIZE_STATUS">Normaliser til {issue.suggestedValue}</ActionButton>}
            {issue.actions.includes("APPLY_DETECTED_SOURCE") && <ActionButton issue={issue} action="APPLY_DETECTED_SOURCE">Bruk dokumentert kilde</ActionButton>}
            {issue.actions.includes("SET_BRAND") && <div className="flex gap-2"><select value={brandDrafts[issue.id] || "soleada"} onChange={(event) => setBrandDrafts((current) => ({ ...current, [issue.id]: event.target.value as RevenueDataBrand }))} className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-950 px-2 py-2 text-xs text-slate-200">{Object.entries(BRAND_LABELS).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select><ActionButton issue={issue} action="SET_BRAND" onClick={() => void act(issue, "SET_BRAND", { brandId: brandDrafts[issue.id] || "soleada" })}>Lagre</ActionButton></div>}
            {issue.actions.includes("SCHEDULE_FOLLOWUP") && <div className="grid grid-cols-2 gap-2"><ActionButton issue={issue} action="SCHEDULE_FOLLOWUP_7" onClick={() => void act(issue, "SCHEDULE_FOLLOWUP", { date: futureIso(7) })}><CalendarClock size={14} className="mr-1" />+7 dager</ActionButton><ActionButton issue={issue} action="SCHEDULE_FOLLOWUP_30" onClick={() => void act(issue, "SCHEDULE_FOLLOWUP", { date: futureIso(30) })}>+30 dager</ActionButton></div>}
            {issue.actions.includes("MARK_DUPLICATE_REVIEWED") && <ActionButton issue={issue} action="MARK_DUPLICATE_REVIEWED"><GitMerge size={14} className="mr-1" />Marker gjennomgått</ActionButton>}
            <Button asChild size="sm"><Link href={issue.href}>Åpne arbeidsflate <ArrowRight size={14} className="ml-2" /></Link></Button>
          </div>
        </div>
      </article>)}</section>}
    </>}
  </div>;
}
