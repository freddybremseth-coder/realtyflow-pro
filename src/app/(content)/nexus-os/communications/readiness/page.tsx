"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, Eye, Loader2, MailCheck, RefreshCw, ShieldCheck } from "lucide-react";

type EmailAccount = {
  id: string;
  brand_id: string;
  email_address: string;
  display_name?: string | null;
  health_status?: string | null;
  health_message?: string | null;
  last_success_at?: string | null;
  last_fetched_at?: string | null;
  auto_fetch_paused_by_system?: boolean;
  readiness?: {
    state?: string;
    label?: string;
    reason?: string;
    hasCredentials?: boolean;
    canTestConnection?: boolean;
    canBackfillHistory?: boolean;
  };
};

type CommunicationsData = {
  generatedAt: string;
  summary?: {
    unhealthyEmailAccounts?: number;
    emailBackfillReady?: number;
  };
  emailAccounts: EmailAccount[];
};

type CheckResult = {
  success: boolean;
  checkedAt?: string;
  inboxFound?: boolean;
  sentFound?: boolean;
  mailboxCount?: number;
  error?: string;
  detail?: string;
};

type BackfillPreview = {
  success: boolean;
  mode?: string;
  since_days?: number;
  max_messages?: number;
  include_sent?: boolean;
  fetched?: number;
  candidates?: number;
  duplicates?: number;
  skipped_missing_message_id?: number;
  inserted?: number;
  accounts?: Array<{
    email: string;
    fetched: number;
    candidates: number;
    duplicates: number;
    skipped_missing_message_id: number;
    inserted: number;
    mailboxes: { inbox?: number; sent?: number };
    error?: string;
  }>;
  error?: string;
};

function fmt(value?: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleString("nb-NO", { dateStyle: "short", timeStyle: "short" });
}

function readinessClasses(state?: string) {
  if (state === "ready") return "border-emerald-300 bg-emerald-50 text-emerald-950";
  if (state === "paused") return "border-rose-300 bg-rose-50 text-rose-950";
  if (state === "needs_connection") return "border-amber-300 bg-amber-50 text-amber-950";
  return "border-slate-300 bg-slate-50 text-slate-950";
}

export default function EmailReadinessPage() {
  const [data, setData] = useState<CommunicationsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [checking, setChecking] = useState<string | null>(null);
  const [checks, setChecks] = useState<Record<string, CheckResult>>({});
  const [previewing, setPreviewing] = useState<string | null>(null);
  const [previews, setPreviews] = useState<Record<string, BackfillPreview>>({});

  async function load() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/nexus/communications", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error || `HTTP ${response.status}`);
      setData(body);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  async function checkConnection(account: EmailAccount) {
    setChecking(account.id);
    setChecks((current) => ({ ...current, [account.id]: { success: false } }));
    try {
      const response = await fetch("/api/email/connection-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId: account.id }),
      });
      const body = await response.json().catch(() => ({}));
      setChecks((current) => ({
        ...current,
        [account.id]: {
          success: response.ok && body?.success === true,
          checkedAt: body?.checkedAt,
          inboxFound: body?.inboxFound,
          sentFound: body?.sentFound,
          mailboxCount: body?.mailboxCount,
          error: response.ok ? undefined : body?.error || `HTTP ${response.status}`,
          detail: body?.detail,
        },
      }));
    } catch (err) {
      setChecks((current) => ({
        ...current,
        [account.id]: { success: false, error: err instanceof Error ? err.message : String(err) },
      }));
    } finally {
      setChecking(null);
    }
  }

  async function previewBackfill(account: EmailAccount) {
    setPreviewing(account.id);
    setPreviews((current) => ({ ...current, [account.id]: { success: false } }));
    try {
      const response = await fetch("/api/email/inbox/backfill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brand_id: account.brand_id,
          since_days: 180,
          max_messages: 200,
          include_sent: true,
          mode: "preview",
        }),
      });
      const body = await response.json().catch(() => ({}));
      setPreviews((current) => ({
        ...current,
        [account.id]: {
          ...body,
          success: response.ok && body?.success === true,
          error: response.ok ? undefined : body?.error || `HTTP ${response.status}`,
        },
      }));
    } catch (err) {
      setPreviews((current) => ({
        ...current,
        [account.id]: { success: false, error: err instanceof Error ? err.message : String(err) },
      }));
    } finally {
      setPreviewing(null);
    }
  }

  return (
    <div className="mx-auto max-w-[1500px] space-y-6 p-4 text-slate-950 sm:p-6">
      <header className="rounded-3xl border border-cyan-800 bg-gradient-to-br from-slate-950 via-slate-900 to-cyan-950 p-6 text-white shadow-xl">
        <div className="text-xs font-black uppercase tracking-[.22em] text-cyan-200">Nexus OS · Communications</div>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-black">Email Readiness</h1>
            <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-200">Kanonisk status for credentials, tilkoblingshelse og historisk backfill. Tilkoblingstesten leser kun mailbox-metadata. Backfill preview leser historikk og beregner kandidater/duplikater uten database-write.</p>
          </div>
          <div className="flex gap-2">
            <Link href="/nexus-os/communications" className="rounded-xl border border-slate-600 bg-slate-900/70 px-4 py-2 text-sm font-black text-white">Communications</Link>
            <button onClick={load} disabled={loading} className="rounded-xl bg-cyan-300 px-4 py-2 text-sm font-black text-slate-950 disabled:opacity-60">
              {loading ? <Loader2 className="mr-2 inline h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 inline h-4 w-4" />}
              Oppdater
            </button>
          </div>
        </div>
      </header>

      {error && <div className="rounded-xl border border-rose-400 bg-rose-50 p-4 text-sm font-semibold text-rose-950"><AlertTriangle className="mr-2 inline h-4 w-4" />{error}</div>}

      <section className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-300 bg-white p-4 shadow-sm"><MailCheck className="h-5 w-5 text-cyan-800" /><div className="mt-3 text-xs font-bold uppercase text-slate-600">Aktive kontoer</div><div className="mt-1 text-2xl font-black">{data?.emailAccounts?.length ?? "—"}</div></div>
        <div className="rounded-2xl border border-slate-300 bg-white p-4 shadow-sm"><AlertTriangle className="h-5 w-5 text-amber-700" /><div className="mt-3 text-xs font-bold uppercase text-slate-600">Ikke klare</div><div className="mt-1 text-2xl font-black">{data?.summary?.unhealthyEmailAccounts ?? "—"}</div></div>
        <div className="rounded-2xl border border-slate-300 bg-white p-4 shadow-sm"><CheckCircle2 className="h-5 w-5 text-emerald-700" /><div className="mt-3 text-xs font-bold uppercase text-slate-600">Backfill-klare</div><div className="mt-1 text-2xl font-black">{data?.summary?.emailBackfillReady ?? "—"}</div></div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        {(data?.emailAccounts || []).map((account) => {
          const readiness = account.readiness || {};
          const check = checks[account.id];
          const preview = previews[account.id];
          return (
            <article key={account.id} className={`rounded-2xl border p-5 shadow-sm ${readinessClasses(readiness.state)}`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div><div className="text-lg font-black">{account.display_name || account.brand_id}</div><div className="mt-1 text-sm opacity-80">{account.email_address}</div></div>
                <span className="rounded-full border border-current/20 bg-white/70 px-2.5 py-1 text-[10px] font-black uppercase">{readiness.label || readiness.state || "Ukjent"}</span>
              </div>
              <div className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
                <div><b>Credentials:</b> {readiness.hasCredentials ? "Finnes" : "Mangler"}</div>
                <div><b>Systempause:</b> {account.auto_fetch_paused_by_system ? "Ja" : "Nei"}</div>
                <div><b>Siste suksess:</b> {fmt(account.last_success_at)}</div>
                <div><b>Sist hentet:</b> {fmt(account.last_fetched_at)}</div>
                <div><b>Connection check:</b> {readiness.canTestConnection ? "Tillatt" : "Blokkert"}</div>
                <div><b>Historisk backfill:</b> {readiness.canBackfillHistory ? "Klar" : "Blokkert"}</div>
              </div>
              {readiness.reason && <div className="mt-4 rounded-xl border border-current/20 bg-white/70 p-3 text-sm font-semibold">{readiness.reason}</div>}
              {account.health_message && <div className="mt-3 text-xs opacity-80">Health: {account.health_message}</div>}
              <div className="mt-4 flex flex-wrap gap-2">
                <button onClick={() => checkConnection(account)} disabled={!readiness.canTestConnection || checking === account.id} className="rounded-xl bg-slate-950 px-4 py-2 text-xs font-black text-white disabled:cursor-not-allowed disabled:opacity-40">
                  {checking === account.id ? <Loader2 className="mr-2 inline h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-2 inline h-4 w-4" />}
                  Test tilkobling
                </button>
                <button onClick={() => previewBackfill(account)} disabled={!readiness.canBackfillHistory || previewing === account.id} className="rounded-xl border border-current/20 bg-white/80 px-4 py-2 text-xs font-black disabled:cursor-not-allowed disabled:opacity-40">
                  {previewing === account.id ? <Loader2 className="mr-2 inline h-4 w-4 animate-spin" /> : <Eye className="mr-2 inline h-4 w-4" />}
                  Preview historikk
                </button>
                <Link href="/nexus-os/communications" className="rounded-xl border border-current/20 bg-white/70 px-4 py-2 text-xs font-black">Åpne Communications</Link>
              </div>
              {!readiness.canBackfillHistory && <div className="mt-3 text-xs font-semibold opacity-75">Historikk-preview er låst til kontoen har dokumentert vellykket tilkobling og ren readiness-status.</div>}
              {check && <div className={`mt-4 rounded-xl border p-3 text-sm font-semibold ${check.success ? "border-emerald-300 bg-emerald-100 text-emerald-950" : "border-rose-300 bg-rose-100 text-rose-950"}`}>
                {check.success ? `Tilkobling OK · Inbox ${check.inboxFound ? "funnet" : "ikke funnet"} · Sent ${check.sentFound ? "funnet" : "ikke funnet"} · ${check.mailboxCount ?? "—"} mapper` : `Tilkobling feilet: ${check.error || check.detail || "ukjent feil"}`}
                {check.checkedAt && <div className="mt-1 text-xs opacity-70">Sjekket {fmt(check.checkedAt)}</div>}
              </div>}
              {preview && <div className={`mt-4 rounded-xl border p-3 text-sm ${preview.success ? "border-cyan-300 bg-cyan-50 text-cyan-950" : "border-rose-300 bg-rose-100 text-rose-950"}`}>
                {preview.success ? <>
                  <div className="font-black">Backfill preview · ingen writes</div>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    <div>Periode: siste {preview.since_days ?? 180} dager</div>
                    <div>Maks: {preview.max_messages ?? 200} meldinger</div>
                    <div>Hentet: {preview.fetched ?? 0}</div>
                    <div>Nye kandidater: {preview.candidates ?? 0}</div>
                    <div>Duplikater: {preview.duplicates ?? 0}</div>
                    <div>Mangler Message-ID: {preview.skipped_missing_message_id ?? 0}</div>
                    <div>Inserted: {preview.inserted ?? 0}</div>
                    <div>Sent inkludert: {preview.include_sent ? "Ja" : "Nei"}</div>
                  </div>
                  {(preview.accounts || []).map((row) => <div key={row.email} className="mt-3 rounded-lg border border-cyan-200 bg-white/70 p-2 text-xs">
                    <b>{row.email}</b> · Inbox {row.mailboxes?.inbox ?? 0} · Sent {row.mailboxes?.sent ?? 0} · kandidater {row.candidates} · duplikater {row.duplicates}{row.error ? ` · feil: ${row.error}` : ""}
                  </div>)}
                </> : <div className="font-semibold">Preview feilet: {preview.error || "ukjent feil"}</div>}
              </div>}
            </article>
          );
        })}
      </section>

      <div className="rounded-2xl border border-cyan-300 bg-cyan-50 p-4 text-sm text-cyan-950"><ShieldCheck className="mr-2 inline h-5 w-5" /><b>Sikkerhetsgrense:</b> Denne siden aktiverer ikke auto-fetch, reconnect eller backfill apply. Connection-check endrer ikke health. Historikk-preview leser historikk og beregner kandidater, men skriver ikke til email_messages og sender ingenting.</div>
    </div>
  );
}
