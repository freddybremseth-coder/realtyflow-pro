"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, ClipboardList, Loader2, RefreshCw, ShieldCheck } from "lucide-react";

type AuditEvent = {
  id: string;
  action: "email_connection_health_repair" | "email_history_backfill";
  status: string;
  agentName?: string | null;
  createdAt: string;
  brandId?: string | null;
  accountId?: string | null;
  emailAddress?: string | null;
  mode?: string | null;
  sinceDays?: number | null;
  maxMessages?: number | null;
  fetched?: number | null;
  candidates?: number | null;
  duplicates?: number | null;
  skippedMissingMessageId?: number | null;
  inserted?: number | null;
  accountFetchComplete?: boolean | null;
  autoFetchPreserved?: boolean | null;
  reason?: string | null;
  error?: string | null;
  failedAccounts?: Array<{ email?: string | null; error?: string | null }>;
};

type AuditResponse = {
  success: boolean;
  generatedAt?: string;
  readOnly?: boolean;
  events?: AuditEvent[];
  summary?: { total?: number; repair?: number; backfill?: number; failedOrBlocked?: number };
  error?: string;
};

function fmt(value?: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleString("nb-NO", { dateStyle: "short", timeStyle: "short" });
}

function statusClasses(status: string) {
  if (status === "success") return "border-emerald-300 bg-emerald-50 text-emerald-950";
  if (status === "blocked") return "border-amber-300 bg-amber-50 text-amber-950";
  if (status === "failed") return "border-rose-300 bg-rose-50 text-rose-950";
  return "border-slate-300 bg-slate-50 text-slate-950";
}

export default function EmailOperationsAuditPage() {
  const [data, setData] = useState<AuditResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [brand, setBrand] = useState("");

  async function load(brandFilter = brand) {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      const normalizedBrand = brandFilter.trim();
      if (normalizedBrand) params.set("brand", normalizedBrand);
      const response = await fetch(`/api/email/operations-audit${params.size ? `?${params.toString()}` : ""}`, { cache: "no-store" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error || `HTTP ${response.status}`);
      setData(body);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(""); }, []);

  const knownBrands = useMemo(() => {
    return Array.from(new Set((data?.events || []).map((event) => event.brandId).filter(Boolean) as string[])).sort();
  }, [data?.events]);

  return (
    <div className="mx-auto max-w-[1500px] space-y-6 p-4 text-slate-950 sm:p-6">
      <header className="rounded-3xl border border-cyan-800 bg-gradient-to-br from-slate-950 via-slate-900 to-cyan-950 p-6 text-white shadow-xl">
        <div className="text-xs font-black uppercase tracking-[.22em] text-cyan-200">Nexus OS · Communications</div>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-black">Email Operations Audit</h1>
            <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-200">Read-only historikk for kontrollert connection repair og historisk e-post-backfill. Siden viser kun whitelisted metadata fra automation audit og kan ikke starte, reparere, importere, sende eller koble CRM-data.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/nexus-os/communications/readiness" className="rounded-xl border border-slate-600 bg-slate-900/70 px-4 py-2 text-sm font-black text-white">Email Readiness</Link>
            <Link href="/nexus-os/communications" className="rounded-xl border border-slate-600 bg-slate-900/70 px-4 py-2 text-sm font-black text-white">Communications</Link>
          </div>
        </div>
      </header>

      <section className="grid gap-3 sm:grid-cols-4">
        <div className="rounded-2xl border border-slate-300 bg-white p-4 shadow-sm"><ClipboardList className="h-5 w-5 text-cyan-800" /><div className="mt-3 text-xs font-bold uppercase text-slate-600">Hendelser</div><div className="mt-1 text-2xl font-black">{data?.summary?.total ?? "—"}</div></div>
        <div className="rounded-2xl border border-slate-300 bg-white p-4 shadow-sm"><ShieldCheck className="h-5 w-5 text-emerald-700" /><div className="mt-3 text-xs font-bold uppercase text-slate-600">Repair</div><div className="mt-1 text-2xl font-black">{data?.summary?.repair ?? "—"}</div></div>
        <div className="rounded-2xl border border-slate-300 bg-white p-4 shadow-sm"><CheckCircle2 className="h-5 w-5 text-cyan-800" /><div className="mt-3 text-xs font-bold uppercase text-slate-600">Backfill</div><div className="mt-1 text-2xl font-black">{data?.summary?.backfill ?? "—"}</div></div>
        <div className="rounded-2xl border border-slate-300 bg-white p-4 shadow-sm"><AlertTriangle className="h-5 w-5 text-amber-700" /><div className="mt-3 text-xs font-bold uppercase text-slate-600">Blocked / failed</div><div className="mt-1 text-2xl font-black">{data?.summary?.failedOrBlocked ?? "—"}</div></div>
      </section>

      <section className="rounded-2xl border border-slate-300 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-end gap-3">
          <label className="min-w-[220px] flex-1 text-sm font-bold">Brand
            <input value={brand} onChange={(event) => setBrand(event.target.value)} list="audit-brands" placeholder="Alle brands" className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 font-medium" />
          </label>
          <datalist id="audit-brands">{knownBrands.map((item) => <option key={item} value={item} />)}</datalist>
          <button onClick={() => void load()} disabled={loading} className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-black text-white disabled:opacity-50">
            {loading ? <Loader2 className="mr-2 inline h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 inline h-4 w-4" />}
            Oppdater
          </button>
          {brand && <button onClick={() => { setBrand(""); void load(""); }} className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-black">Alle brands</button>}
        </div>
      </section>

      {error && <div className="rounded-xl border border-rose-300 bg-rose-50 p-4 text-sm font-semibold text-rose-950">{error}</div>}

      <section className="space-y-3">
        {!loading && !error && (data?.events || []).length === 0 && <div className="rounded-2xl border border-slate-300 bg-white p-6 text-sm text-slate-700 shadow-sm">Ingen repair- eller backfill-hendelser er registrert ennå.</div>}
        {(data?.events || []).map((event) => (
          <article key={event.id} className={`rounded-2xl border p-5 shadow-sm ${statusClasses(event.status)}`}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-xs font-black uppercase tracking-wide">{event.action === "email_connection_health_repair" ? "Connection repair" : "Historical backfill"}</div>
                <div className="mt-1 text-lg font-black">{event.brandId || "Ukjent brand"}{event.emailAddress ? ` · ${event.emailAddress}` : ""}</div>
              </div>
              <div className="text-right"><div className="rounded-full border border-current/20 bg-white/70 px-3 py-1 text-xs font-black uppercase">{event.status}</div><div className="mt-2 text-xs opacity-75">{fmt(event.createdAt)}</div></div>
            </div>

            <div className="mt-4 grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
              {event.mode && <div><b>Mode:</b> {event.mode}</div>}
              {event.fetched !== null && event.fetched !== undefined && <div><b>Hentet:</b> {event.fetched}</div>}
              {event.candidates !== null && event.candidates !== undefined && <div><b>Kandidater:</b> {event.candidates}</div>}
              {event.inserted !== null && event.inserted !== undefined && <div><b>Importert:</b> {event.inserted}</div>}
              {event.duplicates !== null && event.duplicates !== undefined && <div><b>Duplikater:</b> {event.duplicates}</div>}
              {event.sinceDays !== null && event.sinceDays !== undefined && <div><b>Periode:</b> {event.sinceDays} dager</div>}
              {event.maxMessages !== null && event.maxMessages !== undefined && <div><b>Maks:</b> {event.maxMessages}</div>}
              {event.accountFetchComplete !== null && event.accountFetchComplete !== undefined && <div><b>Account fetch:</b> {event.accountFetchComplete ? "Komplett" : "Ufullstendig"}</div>}
              {event.autoFetchPreserved !== null && event.autoFetchPreserved !== undefined && <div><b>Auto-fetch:</b> {event.autoFetchPreserved ? "Bevart" : "—"}</div>}
            </div>

            {(event.reason || event.error) && <div className="mt-4 rounded-xl border border-current/20 bg-white/70 p-3 text-sm font-semibold">{event.reason || event.error}</div>}
            {(event.failedAccounts || []).length > 0 && <div className="mt-3 space-y-1 text-xs">{event.failedAccounts?.map((account, index) => <div key={`${account.email}-${index}`} className="rounded-lg border border-current/20 bg-white/70 p-2"><b>{account.email || "Ukjent konto"}</b>{account.error ? ` · ${account.error}` : ""}</div>)}</div>}
            {event.agentName && <div className="mt-3 text-xs opacity-60">Agent: {event.agentName}</div>}
          </article>
        ))}
      </section>

      <div className="rounded-2xl border border-cyan-300 bg-cyan-50 p-4 text-sm text-cyan-950"><ShieldCheck className="mr-2 inline h-5 w-5" /><b>Read-only:</b> Denne siden kan ikke endre health, aktivere auto-fetch, importere historikk, sende e-post eller koble meldinger til CRM. Den leser kun normaliserte audit-metadata.</div>
    </div>
  );
}
