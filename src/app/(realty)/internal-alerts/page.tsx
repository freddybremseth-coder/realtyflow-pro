"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Banknote,
  BellRing,
  CheckCircle2,
  Clock3,
  ExternalLink,
  KeyRound,
  ListTodo,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Target,
  UsersRound,
} from "lucide-react";
import type {
  InternalAlert,
  InternalAlertCategory,
  InternalAlertCenter,
  InternalAlertSeverity,
} from "@/lib/revenue/internal-alerts";
import type { AccessRole } from "@/lib/access-control";

type Payload = {
  center: InternalAlertCenter;
  user: { email: string; role: AccessRole };
  canAcknowledge: boolean;
  acknowledgementHistoryCount: number;
};

const categoryLabels: Record<InternalAlertCategory, string> = {
  TEAM: "Team",
  CLOSING: "Closing",
  FINANCE: "Økonomi",
  KEYHOLDING: "Keyholding",
  EXECUTION: "Execution",
};

const escalationLabels = {
  IMMEDIATE: "Umiddelbart",
  TODAY: "I dag",
  THIS_WEEK: "Denne uken",
  MONITOR: "Følg med",
};

function categoryIcon(category: InternalAlertCategory) {
  if (category === "TEAM") return UsersRound;
  if (category === "CLOSING") return Target;
  if (category === "FINANCE") return Banknote;
  if (category === "KEYHOLDING") return KeyRound;
  return ListTodo;
}

function severityClass(severity: InternalAlertSeverity, acknowledged: boolean) {
  if (acknowledged) return "border-slate-800 bg-slate-900/45 text-slate-400";
  if (severity === "CRITICAL") return "border-red-700/70 bg-red-950/30 text-red-100";
  if (severity === "HIGH") return "border-amber-700/60 bg-amber-950/20 text-amber-100";
  if (severity === "MEDIUM") return "border-blue-700/50 bg-blue-950/20 text-blue-100";
  return "border-slate-700 bg-slate-900/60 text-slate-200";
}

function formatDate(value: string | null) {
  if (!value) return "Ingen frist";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("nb-NO", { dateStyle: "medium", timeStyle: value.includes("T") ? "short" : undefined }).format(date);
}

function formatMoney(value: number | null) {
  if (!value) return null;
  return new Intl.NumberFormat("nb-NO", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(value);
}

export default function InternalAlertsPage() {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [view, setView] = useState<"ACTIVE" | "ACKNOWLEDGED" | "ALL">("ACTIVE");
  const [category, setCategory] = useState<"ALL" | InternalAlertCategory>("ALL");
  const [severity, setSeverity] = useState<"ALL" | InternalAlertSeverity>("ALL");
  const [mineOnly, setMineOnly] = useState(false);
  const [notes, setNotes] = useState<Record<string, string>>({});

  const load = async () => {
    setLoading(true);
    setError("");
    const response = await fetch("/api/internal-alerts", { cache: "no-store" });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) setError(body.error || "Kunne ikke hente interne varsler.");
    else setData(body);
    setLoading(false);
  };

  useEffect(() => { void load(); }, []);

  const updateAlert = async (alert: InternalAlert, action: "ACKNOWLEDGE" | "REOPEN") => {
    if (!data?.canAcknowledge) return;
    setBusy(alert.id);
    setError("");
    setNotice("");
    const response = await fetch("/api/internal-alerts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action,
        alertId: alert.id,
        fingerprint: alert.fingerprint,
        note: notes[alert.id] || "",
      }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) setError(body.error || "Kunne ikke oppdatere varselet.");
    else {
      setNotice(body.unchanged ? "Varselstatusen var allerede registrert." : action === "ACKNOWLEDGE" ? "Varselet er kvittert internt." : "Varselet er gjenåpnet.");
      setNotes((current) => ({ ...current, [alert.id]: "" }));
      await load();
    }
    setBusy("");
  };

  const visible = useMemo(() => {
    const alerts = data?.center.alerts || [];
    return alerts.filter((alert) => {
      if (view === "ACTIVE" && alert.acknowledged) return false;
      if (view === "ACKNOWLEDGED" && !alert.acknowledged) return false;
      if (category !== "ALL" && alert.category !== category) return false;
      if (severity !== "ALL" && alert.severity !== severity) return false;
      if (mineOnly && alert.ownerEmail !== data?.user.email) return false;
      return true;
    });
  }, [data, view, category, severity, mineOnly]);

  if (loading) return <div className="p-8 text-slate-400">Laster interne varsler og eskaleringer…</div>;

  const center = data?.center;
  return (
    <div className="min-h-screen bg-slate-950 p-4 text-slate-100 md:p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2 text-sm font-medium text-primary-400"><BellRing size={18}/> Internal Alerts & Escalation</div>
            <h1 className="text-3xl font-bold">Varsler & eskalering</h1>
            <p className="mt-2 max-w-3xl text-slate-400">Samler interne risikosignaler fra team, closing, provisjon, Keyholding og execution. Kvittering dokumenterer gjennomgang, men løser aldri selve forholdet.</p>
          </div>
          <button onClick={() => void load()} className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-sm hover:bg-slate-800"><RefreshCw size={15}/> Oppdater</button>
        </header>

        {error && <div className="rounded-xl border border-red-700/60 bg-red-950/40 p-4 text-red-200"><AlertTriangle className="mr-2 inline" size={17}/>{error}</div>}
        {notice && <div className="rounded-xl border border-emerald-700/60 bg-emerald-950/40 p-4 text-emerald-200"><CheckCircle2 className="mr-2 inline" size={17}/>{notice}</div>}
        {!data?.canAcknowledge && <div className="rounded-xl border border-blue-800/50 bg-blue-950/20 p-4 text-sm text-blue-200"><ShieldCheck className="mr-2 inline" size={17}/>Du har read-only tilgang. Varsler kan åpnes, men ikke kvitteres eller gjenåpnes.</div>}
        {(center?.warnings || []).map((warning) => <div key={warning} className="rounded-xl border border-amber-800/50 bg-amber-950/20 p-3 text-sm text-amber-200">{warning}</div>)}

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-7">
          {[
            ["Aktive", center?.summary.active || 0, BellRing],
            ["Kritiske", center?.summary.critical || 0, AlertTriangle],
            ["Høy", center?.summary.high || 0, Target],
            ["Umiddelbart", center?.summary.immediate || 0, Clock3],
            ["Ufordelte", center?.summary.unassigned || 0, UsersRound],
            ["Forfalt", center?.summary.overdue || 0, ListTodo],
            ["Kvittert", center?.summary.acknowledged || 0, CheckCircle2],
          ].map(([label, value, Icon]: any) => <div key={label} className="rounded-xl border border-slate-800 bg-slate-900/70 p-4"><Icon size={18} className="mb-3 text-primary-400"/><div className="text-2xl font-bold">{value}</div><div className="text-xs text-slate-500">{label}</div></div>)}
        </section>

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {(Object.keys(categoryLabels) as InternalAlertCategory[]).map((item) => {
            const Icon = categoryIcon(item);
            const count = center?.summary.byCategory[item] || 0;
            return <button key={item} onClick={() => setCategory(category === item ? "ALL" : item)} className={`rounded-xl border p-4 text-left transition ${category === item ? "border-primary-500 bg-primary-950/20" : "border-slate-800 bg-slate-900/60 hover:border-slate-700"}`}><Icon size={18} className="mb-2 text-primary-400"/><div className="text-xl font-bold">{count}</div><div className="text-xs text-slate-500">{categoryLabels[item]}</div></button>;
          })}
        </section>

        <section className="space-y-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div><h2 className="text-xl font-semibold">Varslingskø <span className="text-sm font-normal text-slate-500">({visible.length})</span></h2><div className="text-xs text-slate-500">{data?.acknowledgementHistoryCount || 0} kvitteringshendelser lagret</div></div>
            <div className="flex flex-wrap gap-2">
              {(["ACTIVE", "ACKNOWLEDGED", "ALL"] as const).map((item) => <button key={item} onClick={() => setView(item)} className={`rounded-lg px-3 py-2 text-xs ${view === item ? "bg-primary-600 text-white" : "border border-slate-700 text-slate-300"}`}>{item === "ACTIVE" ? "Aktive" : item === "ACKNOWLEDGED" ? "Kvitterte" : "Alle"}</button>)}
              <select value={severity} onChange={(event) => setSeverity(event.target.value as any)} className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs"><option value="ALL">Alle alvorligheter</option><option value="CRITICAL">Kritisk</option><option value="HIGH">Høy</option><option value="MEDIUM">Middels</option><option value="LOW">Lav</option></select>
              <button onClick={() => setMineOnly(!mineOnly)} className={`rounded-lg px-3 py-2 text-xs ${mineOnly ? "bg-primary-600 text-white" : "border border-slate-700 text-slate-300"}`}>Mine saker</button>
              {(category !== "ALL" || severity !== "ALL" || mineOnly) && <button onClick={() => { setCategory("ALL"); setSeverity("ALL"); setMineOnly(false); }} className="rounded-lg border border-slate-700 px-3 py-2 text-xs">Nullstill</button>}
            </div>
          </div>

          <div className="space-y-3">
            {visible.map((alert) => {
              const Icon = categoryIcon(alert.category);
              return (
                <article key={alert.id} className={`rounded-2xl border p-5 ${severityClass(alert.severity, alert.acknowledged)}`}>
                  <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="mb-2 flex flex-wrap items-center gap-2 text-[10px] font-semibold uppercase">
                        <span className="inline-flex items-center gap-1 rounded bg-slate-950/60 px-2 py-1"><Icon size={12}/>{categoryLabels[alert.category]}</span>
                        <span>{alert.severity}</span>
                        <span className="rounded bg-slate-950/60 px-2 py-1">{escalationLabels[alert.escalation]}</span>
                        {alert.acknowledged && <span className="rounded bg-emerald-950 px-2 py-1 text-emerald-300">KVITTERT</span>}
                        {alert.brandId && <span className="text-slate-500">{alert.brandId}</span>}
                      </div>
                      <h3 className="text-lg font-semibold">{alert.title}</h3>
                      <p className="mt-1 text-sm text-slate-400">{alert.detail}</p>
                      <div className="mt-3 grid gap-3 text-sm md:grid-cols-2">
                        <div className="rounded-lg bg-slate-950/40 p-3"><div className="text-[10px] uppercase text-slate-500">Hvorfor</div><div className="mt-1">{alert.reason}</div></div>
                        <div className="rounded-lg bg-slate-950/40 p-3"><div className="text-[10px] uppercase text-slate-500">Anbefalt handling</div><div className="mt-1">{alert.recommendedAction}</div></div>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-500">
                        <span>Frist: {formatDate(alert.dueAt)}</span>
                        {alert.ownerEmail && <span>Ansvarlig: {alert.ownerName || alert.ownerEmail}</span>}
                        {formatMoney(alert.amountEur) && <span>Beløp: {formatMoney(alert.amountEur)}</span>}
                        <span>Score: {alert.score}</span>
                      </div>
                      {alert.acknowledged && <div className="mt-3 text-xs text-emerald-300">Kvittert {formatDate(alert.acknowledgedAt)} av {alert.acknowledgedBy}{alert.acknowledgementNote ? ` · ${alert.acknowledgementNote}` : ""}</div>}
                    </div>
                    <div className="flex w-full flex-col gap-2 xl:w-80">
                      <Link href={alert.href} className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-sm hover:bg-slate-800"><ExternalLink size={14}/> Åpne arbeidsflate</Link>
                      {data?.canAcknowledge && (
                        <>
                          <input value={notes[alert.id] || ""} onChange={(event) => setNotes((current) => ({ ...current, [alert.id]: event.target.value }))} maxLength={500} placeholder="Intern merknad (valgfritt)" className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm" />
                          <button disabled={busy === alert.id} onClick={() => void updateAlert(alert, alert.acknowledged ? "REOPEN" : "ACKNOWLEDGE")} className={`inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium ${alert.acknowledged ? "border border-slate-700 hover:bg-slate-800" : "bg-primary-600 text-white hover:bg-primary-500"}`}>
                            {alert.acknowledged ? <RotateCcw size={14}/> : <CheckCircle2 size={14}/>}{busy === alert.id ? "Lagrer…" : alert.acknowledged ? "Gjenåpne varsel" : "Kvitter som gjennomgått"}
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
            {!visible.length && <div className="rounded-2xl border border-dashed border-slate-700 p-10 text-center text-slate-500">Ingen varsler matcher filtrene.</div>}
          </div>
        </section>

        <footer className="rounded-xl border border-slate-800 bg-slate-900/50 p-4 text-xs text-slate-500">RealtyFlow sender ingen varsler til kunder eller teammedlemmer. Siden leses manuelt. Kvittering er bare intern dokumentasjon og blir ugyldig dersom den underliggende situasjonen endres.</footer>
      </div>
    </div>
  );
}
