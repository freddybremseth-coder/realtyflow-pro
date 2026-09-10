"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Clock3, MailCheck, RefreshCw, ShieldCheck } from "lucide-react";

const BRAND_LABELS: Record<string, string> = {
  zeneco: "Zen Eco Homes",
  soleada: "Soleada.no",
  pinosoecolife: "Pinoso EcoLife",
  chatgenius: "ChatGenius.pro",
  donaanna: "Doña Anna",
  freddyb: "Freddy Bremseth",
  freddypublishing: "Freddy Publishing",
  remasterfreddy: "Re-Master Freddy",
};

const BLOCK_REASON_LABELS: Record<string, string> = {
  MISSING_EMAIL: "Mangler e-post",
  INVALID_EMAIL: "Ugyldig e-post",
  MULTIPLE_EMAILS: "Flere e-postadresser",
  DUPLICATE_EMAIL: "Duplikat i samme merkevare",
  DO_NOT_CONTACT: "STOPP / ikke kontakt",
  EMAIL_SUPPRESSED: "E-post blokkert",
  TERMINAL_PIPELINE: "Vunnet / tapt",
  UNRESOLVED_INBOUND_REPLY: "Kundesvar må behandles",
};

type CommandView = {
  id: string;
  status: string;
  createdAt: string | null;
  mode: string | null;
  outcome: string | null;
  brandId: string | null;
  candidateCount: number;
  blockedCount: number;
  blockedReasons: Record<string, number>;
  byBrand: Record<string, number>;
  batchSize: number;
  attempted: number;
  started: number;
  sent: number;
  failed: number;
  notStarted: number;
  remaining: number;
  reason: string | null;
};

type NurtureSummary = {
  sent: number;
  failed: number;
  dryRun: number;
  byBrand: Record<string, number>;
};

type Data = {
  generatedAt: string;
  runtime: { enabled?: boolean; risk_level?: string; updated_at?: string } | null;
  latestCommand: CommandView | null;
  recentCommands: CommandView[];
  nurture7d: NurtureSummary;
  nurture30d: NurtureSummary;
  policy: { readOnly: boolean; executionHref: string; note: string };
};

function fmtDate(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("nb-NO", { dateStyle: "short", timeStyle: "short" });
}

function modeLabel(value: string | null) {
  if (value === "execute") return "Startet batch";
  if (value === "preview") return "Forhåndsvisning";
  return value || "Kontroll";
}

function outcomeLabel(value: string | null, status: string) {
  if (value === "partial") return "Delvis";
  if (value === "failed" || status === "error") return "Feil / blokkert";
  if (value === "preview") return "Kontrollert";
  if (value === "blocked") return "Blokkert";
  return "OK";
}

function recordText(record: Record<string, number>, labels?: Record<string, string>) {
  const entries = Object.entries(record).filter(([, count]) => count > 0);
  if (!entries.length) return "—";
  return entries.map(([key, count]) => `${labels?.[key] || BRAND_LABELS[key] || key}: ${count}`).join(" · ");
}

export default function NexusNurtureControlPage() {
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load(options?: { quiet?: boolean }) {
    if (!options?.quiet) setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/nexus/communications/nurture", { cache: "no-store" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error || `HTTP ${response.status}`);
      setData(body as Data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      if (!options?.quiet) setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load({ quiet: true }), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const latest = data?.latestCommand || null;
  const live = Boolean(data?.runtime?.enabled);
  const recentExecutes = useMemo(() => (data?.recentCommands || []).filter((row) => row.mode === "execute"), [data]);

  return (
    <div className="mx-auto max-w-[1500px] space-y-6 p-4 sm:p-6">
      <header className="rounded-3xl border border-cyan-800 bg-gradient-to-br from-slate-950 via-slate-900 to-cyan-950 p-6 text-white shadow-xl">
        <div className="text-xs font-black uppercase tracking-[.22em] text-cyan-200">Nexus OS · Communications · Nurture Control</div>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-black">Automatisk kundeoppfølging</h1>
            <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-200">Kontrollsenter for CRM-kommandoen «Klar – ikke sendt». Her ser du hva siste kontroll fant, hva som faktisk ble startet, hva sikkerhetsportene blokkerte og resultatet fra nurture-motoren.</p>
            <p className="mt-2 text-xs text-cyan-100">Nexus er read-only her. Start av nye bulk-batcher skjer fortsatt eksplisitt fra CRM etter forhåndsvisning.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <a href="/customers" className="rounded-xl bg-cyan-300 px-4 py-2 text-sm font-black text-slate-950">Åpne CRM-kommandoer</a>
            <button onClick={() => void load()} disabled={loading} className="rounded-xl border border-cyan-300/50 bg-cyan-300/10 px-4 py-2 text-sm font-black text-cyan-50 disabled:opacity-60">
              <RefreshCw className={`mr-2 inline h-4 w-4 ${loading ? "animate-spin" : ""}`} />Oppdater
            </button>
          </div>
        </div>
      </header>

      {error ? <div className="rounded-xl border border-rose-300 bg-rose-50 p-4 text-sm font-semibold text-rose-950"><AlertTriangle className="mr-2 inline h-4 w-4" />{error}</div> : null}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <div className={`rounded-2xl border p-5 shadow-sm ${live ? "border-emerald-300 bg-emerald-50" : "border-amber-300 bg-amber-50"}`}>
          <ShieldCheck className="h-5 w-5" />
          <div className="mt-3 text-xs font-black uppercase text-slate-600">Nurture LIVE</div>
          <div className="mt-1 text-2xl font-black">{live ? "PÅ" : "AV"}</div>
          <div className="mt-1 text-xs text-slate-600">Risk: {data?.runtime?.risk_level || "—"}</div>
        </div>
        <div className="rounded-2xl border border-slate-300 bg-white p-5 shadow-sm"><MailCheck className="h-5 w-5 text-cyan-800" /><div className="mt-3 text-xs font-black uppercase text-slate-600">Sendt 7 dager</div><div className="mt-1 text-2xl font-black">{data?.nurture7d.sent ?? "—"}</div></div>
        <div className="rounded-2xl border border-slate-300 bg-white p-5 shadow-sm"><MailCheck className="h-5 w-5 text-cyan-800" /><div className="mt-3 text-xs font-black uppercase text-slate-600">Sendt 30 dager</div><div className="mt-1 text-2xl font-black">{data?.nurture30d.sent ?? "—"}</div></div>
        <div className="rounded-2xl border border-slate-300 bg-white p-5 shadow-sm"><AlertTriangle className="h-5 w-5 text-amber-700" /><div className="mt-3 text-xs font-black uppercase text-slate-600">Feil 30 dager</div><div className="mt-1 text-2xl font-black">{data?.nurture30d.failed ?? "—"}</div></div>
        <div className="rounded-2xl border border-slate-300 bg-white p-5 shadow-sm"><Clock3 className="h-5 w-5 text-cyan-800" /><div className="mt-3 text-xs font-black uppercase text-slate-600">Manuelle starter logget</div><div className="mt-1 text-2xl font-black">{recentExecutes.length}</div><div className="mt-1 text-xs text-slate-500">Av siste {data?.recentCommands.length || 0} kontroller</div></div>
      </section>

      <section className="rounded-2xl border border-slate-300 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><div className="text-xs font-black uppercase tracking-wider text-cyan-800">Siste CRM-kontroll</div><h2 className="mt-1 text-xl font-black">{latest ? modeLabel(latest.mode) : "Ingen kommando logget ennå"}</h2></div>
          {latest ? <div className={`rounded-full px-3 py-1 text-xs font-black ${latest.status === "error" ? "bg-rose-100 text-rose-900" : "bg-emerald-100 text-emerald-900"}`}>{outcomeLabel(latest.outcome, latest.status)}</div> : null}
        </div>
        {latest ? <>
          <div className="mt-2 text-sm text-slate-600">{fmtDate(latest.createdAt)}{latest.brandId ? ` · ${BRAND_LABELS[latest.brandId] || latest.brandId}` : " · Alle merkevarer"}</div>
          <div className="mt-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {[
              ["Kandidater", latest.candidateCount],
              ["Forsøkt", latest.attempted],
              ["Startet", latest.started],
              ["Sendt", latest.sent],
              ["Feil", latest.failed],
              ["Gjenstår", latest.remaining],
            ].map(([label, value]) => <div key={String(label)} className="rounded-xl border border-slate-200 bg-slate-50 p-3"><div className="text-[11px] font-black uppercase text-slate-500">{label}</div><div className="mt-1 text-xl font-black">{value}</div></div>)}
          </div>
          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4"><div className="text-xs font-black uppercase text-slate-600">Fordeling per merkevare</div><div className="mt-2 text-sm text-slate-800">{recordText(latest.byBrand)}</div></div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4"><div className="text-xs font-black uppercase text-slate-600">Blokkert av sikkerhetsport</div><div className="mt-2 text-sm text-slate-800">{latest.blockedCount > 0 ? `${latest.blockedCount} · ${recordText(latest.blockedReasons, BLOCK_REASON_LABELS)}` : "Ingen blokkeringer i siste kontroll"}</div></div>
          </div>
          {latest.reason ? <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-amber-950">Årsak: {latest.reason}</div> : null}
        </> : <p className="mt-3 text-sm text-slate-600">Når du åpner CRM og kjører «Forhåndsvis», vil kontrollen dukke opp her uten at det sendes e-post.</p>}
      </section>

      <section className="rounded-2xl border border-slate-300 bg-white p-5 shadow-sm">
        <h2 className="text-xl font-black">Nurture-resultat per merkevare</h2>
        <p className="mt-1 text-sm text-slate-600">Reelle utsendelser registrert i den kanoniske nurture-historikken.</p>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4"><div className="text-xs font-black uppercase text-slate-600">Siste 7 dager</div><div className="mt-2 text-sm">{recordText(data?.nurture7d.byBrand || {})}</div></div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4"><div className="text-xs font-black uppercase text-slate-600">Siste 30 dager</div><div className="mt-2 text-sm">{recordText(data?.nurture30d.byBrand || {})}</div></div>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-300 bg-white p-5 shadow-sm">
        <h2 className="text-xl font-black">Siste kontroller og starter</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-slate-200 text-xs uppercase text-slate-500"><tr><th className="px-3 py-2">Tid</th><th className="px-3 py-2">Handling</th><th className="px-3 py-2">Status</th><th className="px-3 py-2 text-right">Kandidater</th><th className="px-3 py-2 text-right">Startet</th><th className="px-3 py-2 text-right">Sendt</th><th className="px-3 py-2 text-right">Blokkert</th><th className="px-3 py-2 text-right">Feil</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {(data?.recentCommands || []).map((row) => <tr key={row.id}><td className="px-3 py-3 whitespace-nowrap">{fmtDate(row.createdAt)}</td><td className="px-3 py-3 font-semibold">{modeLabel(row.mode)}</td><td className="px-3 py-3">{outcomeLabel(row.outcome, row.status)}</td><td className="px-3 py-3 text-right">{row.candidateCount}</td><td className="px-3 py-3 text-right">{row.started}</td><td className="px-3 py-3 text-right">{row.sent}</td><td className="px-3 py-3 text-right">{row.blockedCount}</td><td className="px-3 py-3 text-right">{row.failed}</td></tr>)}
              {!data?.recentCommands?.length ? <tr><td colSpan={8} className="px-3 py-6 text-center text-slate-500">Ingen CRM nurture-kommandoer er logget ennå.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </section>

      <div className="rounded-xl border border-cyan-200 bg-cyan-50 p-4 text-sm text-cyan-950"><CheckCircle2 className="mr-2 inline h-4 w-4" />{data?.policy?.note || "Nexus viser resultatdata; sending startes fra CRM."}</div>
    </div>
  );
}
