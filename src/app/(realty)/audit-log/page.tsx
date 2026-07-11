"use client";

import { useEffect, useMemo, useState } from "react";
import { Activity, AlertTriangle, RefreshCw, Search, ShieldCheck, UserRoundCheck } from "lucide-react";

type AuditEvent = {
  id: string;
  at: string;
  actor: string;
  action: string;
  category: string;
  resourceType: string;
  resourceId: string | null;
  resourceName: string | null;
  source: string;
  field: string | null;
  before: unknown;
  after: unknown;
  details: Record<string, unknown>;
  actorKnown: boolean;
};
type AuditTrail = {
  generatedAt: string;
  summary: { total: number; last7Days: number; accessChanges: number; customerEvents: number; unknownActor: number; actorCoveragePercent: number };
  events: AuditEvent[];
  warnings: string[];
};

const categories = ["ALL", "ACCESS", "CUSTOMER", "SALES", "CLOSING", "FINANCE", "MARKETING", "KEYHOLDING", "COMMUNICATION", "EXECUTION", "SYSTEM"];
const categoryClass: Record<string, string> = {
  ACCESS: "border-violet-700/50 bg-violet-950/30 text-violet-200",
  FINANCE: "border-emerald-700/50 bg-emerald-950/30 text-emerald-200",
  CLOSING: "border-amber-700/50 bg-amber-950/30 text-amber-200",
  KEYHOLDING: "border-orange-700/50 bg-orange-950/30 text-orange-200",
  COMMUNICATION: "border-cyan-700/50 bg-cyan-950/30 text-cyan-200",
  EXECUTION: "border-blue-700/50 bg-blue-950/30 text-blue-200",
  MARKETING: "border-pink-700/50 bg-pink-950/30 text-pink-200",
  SALES: "border-indigo-700/50 bg-indigo-950/30 text-indigo-200",
  CUSTOMER: "border-slate-600 bg-slate-800/50 text-slate-200",
  SYSTEM: "border-slate-700 bg-slate-900 text-slate-300",
};

function compact(value: unknown) {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "string") return value;
  try { return JSON.stringify(value); } catch { return String(value); }
}

export default function AuditLogPage() {
  const [trail, setTrail] = useState<AuditTrail | null>(null);
  const [coverage, setCoverage] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [category, setCategory] = useState("ALL");
  const [actor, setActor] = useState("ALL");
  const [query, setQuery] = useState("");

  const load = async () => {
    setLoading(true); setError("");
    const response = await fetch("/api/audit-log?limit=1000", { cache: "no-store" });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) setError(body.error || "Kunne ikke hente audit-loggen.");
    else { setTrail(body.trail); setCoverage(body.coverage || {}); }
    setLoading(false);
  };
  useEffect(() => { void load(); }, []);

  const actors = useMemo(() => ["ALL", ...Array.from(new Set((trail?.events || []).map((event) => event.actor))).sort()], [trail]);
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (trail?.events || []).filter((event) => {
      if (category !== "ALL" && event.category !== category) return false;
      if (actor !== "ALL" && event.actor !== actor) return false;
      if (!needle) return true;
      return [event.actor, event.action, event.resourceName, event.resourceId, event.source, event.field, compact(event.before), compact(event.after)]
        .filter(Boolean).join(" ").toLowerCase().includes(needle);
    });
  }, [trail, category, actor, query]);

  if (loading) return <div className="p-8 text-slate-400">Laster audit-logg…</div>;

  return (
    <div className="min-h-screen bg-slate-950 p-4 text-slate-100 md:p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div><div className="mb-2 flex items-center gap-2 text-sm font-medium text-violet-400"><Activity size={18}/> Kontrollspor</div><h1 className="text-3xl font-bold">Audit Log</h1><p className="mt-2 max-w-3xl text-slate-400">Samler tilgangsendringer og eksisterende kundetidslinjer. Eldre hendelser kan mangle aktør eller før-/etterverdi og merkes tydelig.</p></div>
          <button onClick={() => void load()} className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-sm hover:bg-slate-800"><RefreshCw size={15}/> Oppdater</button>
        </header>

        {error && <div className="rounded-xl border border-red-700/60 bg-red-950/40 p-4 text-red-200"><AlertTriangle className="mr-2 inline" size={17}/>{error}</div>}

        {trail && <>
          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {[
              ["Hendelser", trail.summary.total], ["Siste 7 dager", trail.summary.last7Days], ["Tilgangsendringer", trail.summary.accessChanges], ["Aktørdekning", `${trail.summary.actorCoveragePercent}%`], ["Ukjent aktør", trail.summary.unknownActor],
            ].map(([label, value]) => <div key={label} className="rounded-xl border border-slate-800 bg-slate-900/70 p-4"><div className="text-xs uppercase tracking-wide text-slate-500">{label}</div><div className="mt-1 text-2xl font-semibold">{value}</div></div>)}
          </section>

          {trail.warnings.map((warning) => <div key={warning} className="rounded-xl border border-amber-700/40 bg-amber-950/20 p-3 text-sm text-amber-200"><AlertTriangle className="mr-2 inline" size={16}/>{warning}</div>)}

          <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
            <div className="grid gap-3 md:grid-cols-[1fr_220px_220px]">
              <label className="relative"><Search className="absolute left-3 top-2.5 text-slate-500" size={17}/><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Søk etter aktør, handling, kunde eller verdi" className="w-full rounded-lg border border-slate-700 bg-slate-950 py-2 pl-10 pr-3"/></label>
              <select value={category} onChange={(e) => setCategory(e.target.value)} className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2">{categories.map((item) => <option key={item}>{item}</option>)}</select>
              <select value={actor} onChange={(e) => setActor(e.target.value)} className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2">{actors.map((item) => <option key={item}>{item}</option>)}</select>
            </div>
            <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-500"><span>{filtered.length} synlige hendelser</span><span>·</span><span>Kontaktinteraksjoner: {coverage.contactInteractions ? "ja" : "nei"}</span><span>·</span><span>Tilgangsendringer: {coverage.accessChanges ? "ja" : "nei"}</span><span>·</span><span>Kalenderaktør: {coverage.calendarActorCoverage ? "ja" : "ikke komplett"}</span></div>
          </section>

          <section className="space-y-3">
            {filtered.map((event) => (
              <article key={event.id} className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2"><span className={`rounded-full border px-2 py-0.5 text-[11px] ${categoryClass[event.category] || categoryClass.SYSTEM}`}>{event.category}</span><span className="font-semibold">{event.action}</span>{!event.actorKnown && <span className="rounded bg-amber-950/50 px-2 py-0.5 text-[11px] text-amber-300">Aktør mangler</span>}</div>
                    <div className="mt-2 text-sm text-slate-300">{event.resourceName || event.resourceId || event.resourceType}</div>
                    <div className="mt-1 text-xs text-slate-500">Kilde: {event.source}{event.field ? ` · Felt: ${event.field}` : ""}</div>
                  </div>
                  <div className="text-right text-sm"><div className="flex items-center justify-end gap-1 text-slate-300">{event.actorKnown ? <UserRoundCheck size={15} className="text-emerald-400"/> : <AlertTriangle size={15} className="text-amber-400"/>}{event.actor}</div><div className="mt-1 text-xs text-slate-500">{new Date(event.at).toLocaleString("nb-NO")}</div></div>
                </div>
                {(event.before !== null || event.after !== null) && <div className="mt-4 grid gap-3 md:grid-cols-2"><div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3"><div className="mb-1 text-[11px] uppercase text-slate-500">Før</div><div className="break-words text-sm text-slate-300">{compact(event.before)}</div></div><div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3"><div className="mb-1 text-[11px] uppercase text-slate-500">Etter</div><div className="break-words text-sm text-slate-300">{compact(event.after)}</div></div></div>}
              </article>
            ))}
            {!filtered.length && <div className="rounded-2xl border border-dashed border-slate-700 p-10 text-center text-slate-500">Ingen hendelser matcher filtrene.</div>}
          </section>

          <section className="rounded-xl border border-violet-800/40 bg-violet-950/20 p-4 text-sm text-violet-200"><ShieldCheck className="mr-2 inline" size={17}/>Sensitive nøkler som passord, token, cookies, pass-/NIE- og kontonummer redigeres bort før visning.</section>
        </>}
      </div>
    </div>
  );
}
