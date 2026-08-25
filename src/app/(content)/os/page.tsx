"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Clock3, RefreshCw, ShieldAlert } from "lucide-react";

type Attention = {
  id: string;
  severity: "high" | "medium" | "low";
  score: number;
  title: string;
  detail: string;
  href: string;
  source: string;
};

type OsStatus = {
  generatedAt: string;
  sourceState: { healthy: boolean; errors: Array<{ source: string; message: string; href: string }> };
  summary: {
    approvalsPending: number;
    approvalsHighRisk: number;
    approvalOpportunityEur: number;
    bookPending: number;
    bookApproved: number;
    bookApplied: number;
    bookMeasuring: number;
    bookMeasured: number;
    bookRunningExperiments: number;
    bookReviewCandidatesPending: number;
    automationRuns24h: number;
    automationFailures24h: number;
    automationPartial24h: number;
    runtimeEnabled: number;
    runtimeHighRiskEnabled: number;
    socialChannels: number;
    instagramConnected: number;
    instagramCommentReadReady: number;
    socialSyncEnabled: boolean;
    socialAutoReplyLive: boolean;
  };
  attention: Attention[];
  approvals: Array<{ id: string; title: string; risk: string; estimated_opportunity_eur: number | null; created_at: string }>;
  social: {
    readiness: Array<{ channelId: string; brandId: string; platform: string; displayName: string; readComments: boolean; directMessages: boolean; commentReply: boolean; tokenExpiresAt: string | null }>;
    lastSync: null | {
      status: string;
      createdAt: string;
      readOnly: boolean;
      commentsFetched: number;
      conversationsUpserted: number;
      messagesUpserted: number;
      eligibleChannels: number;
      skippedMissingToken: number;
      skippedMissingCapability: number;
      channelErrors: number;
    };
  };
  automation: { failures: unknown[]; partial: unknown[] };
  runtime: { highRiskEnabled: Array<{ control_key: string; label: string; category: string; risk_level: string }>; controls: unknown[] };
  bookGrowth: { candidateQueues: Array<{ table: string; pending: number | null; error: string | null }> };
};

const systems = [
  { href: "/nexus", title: "Nexus OS", badge: "CORE OS", text: "Agentisk dealflow, approvals, oppgaver og koordinering." },
  { href: "/social-automation", title: "Social & Instagram", badge: "GROWTH OS", text: "Publisering, Instagram-intelligens, timing og readiness." },
  { href: "/book-growth", title: "Book Growth OS", badge: "PUBLISHING OS", text: "Amazon/ASIN, metadata, økonomi, serier, måling og læring." },
  { href: "/automation", title: "Automation Center", badge: "AUTOMATION", text: "Cron-flyter, scheduler, automation logs og driftskontroll." },
];

const controls = [
  { href: "/approvals", title: "Approval Center" },
  { href: "/nexus-os/communications/social", title: "Social Communications" },
  { href: "/connections", title: "Connections" },
  { href: "/nexus-os/runtime", title: "Runtime Controls" },
  { href: "/agents", title: "AI Agents" },
  { href: "/growth-hub", title: "Growth Hub" },
  { href: "/data-health", title: "Data Health" },
  { href: "/audit-log", title: "Audit Log" },
];

function StatusPill({ state, label }: { state: "ok" | "warn" | "error" | "idle"; label?: string }) {
  const styles = {
    ok: "border-emerald-200 bg-emerald-100 text-emerald-800",
    warn: "border-amber-200 bg-amber-100 text-amber-900",
    error: "border-rose-200 bg-rose-100 text-rose-800",
    idle: "border-slate-200 bg-slate-100 text-slate-600",
  }[state];
  const text = label ?? { ok: "OK", warn: "Følg opp", error: "Krever handling", idle: "Ukjent" }[state];
  return <span className={`rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-wider ${styles}`}>{text}</span>;
}

function formatDate(value?: string | null) {
  if (!value) return "Ingen logg";
  try { return new Date(value).toLocaleString("nb-NO"); } catch { return value; }
}

export default function RealtyFlowOsPage() {
  const [data, setData] = useState<OsStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/os/status", { cache: "no-store", credentials: "same-origin" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error || `OS status feilet (${response.status})`);
      setData(body as OsStatus);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const high = useMemo(() => data?.attention?.filter((item) => item.severity === "high").length ?? 0, [data]);
  const medium = useMemo(() => data?.attention?.filter((item) => item.severity === "medium").length ?? 0, [data]);
  const summary = data?.summary;
  const lastSync = data?.social?.lastSync;

  return <div className="mx-auto max-w-[1500px] space-y-6 p-4 text-slate-950 sm:p-6">
    <header className="rounded-3xl border border-cyan-900 bg-gradient-to-br from-slate-950 via-slate-900 to-cyan-950 p-6 text-white shadow-xl">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-xs font-black uppercase tracking-[0.24em] text-cyan-300">RealtyFlow Operating System</div>
          <h1 className="mt-2 text-3xl font-black tracking-tight text-white">Nexus Attention Center</h1>
          <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-200">Én prioritert arbeidsflate for det som faktisk trenger oppmerksomhet. Status kommer fra canonical produksjonsdata; ukjente eller utilgjengelige kilder vises som ukjent/feil, aldri som grønt null.</p>
        </div>
        <button onClick={() => void load()} disabled={loading} className="inline-flex items-center gap-2 rounded-xl bg-cyan-300 px-4 py-2 text-sm font-black text-slate-950 disabled:opacity-60"><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />{loading ? "Oppdaterer…" : "Oppdater status"}</button>
      </div>
      <div className="mt-5 flex flex-wrap gap-2 text-xs">
        <StatusPill state={error || data?.sourceState?.healthy === false ? "error" : data ? "ok" : "idle"} label={data?.sourceState?.healthy ? "Kilder verifisert" : "Kildesjekk"} />
        <StatusPill state={high ? "error" : "ok"} label={`${high} high priority`} />
        <StatusPill state={medium ? "warn" : "ok"} label={`${medium} medium`} />
        <span className="self-center text-slate-400">Generert: {formatDate(data?.generatedAt)}</span>
      </div>
    </header>

    {error && <div className="rounded-2xl border border-rose-300 bg-rose-50 p-4 text-sm font-semibold text-rose-950"><AlertTriangle className="mr-2 inline h-4 w-4" />{error}</div>}

    <section>
      <div className="mb-3"><h2 className="text-xl font-black">Hva krever oppmerksomhet nå?</h2><p className="text-sm text-slate-600">Rangert server-side etter datakildefeil, automasjonsfeil, write-risk, approvals, sync-helse, scopes og review-køer.</p></div>
      <div className="grid gap-3 lg:grid-cols-2">
        {(data?.attention ?? []).slice(0, 8).map((item) => <Link key={item.id} href={item.href} className={`rounded-2xl border bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${item.severity === "high" ? "border-rose-300" : item.severity === "medium" ? "border-amber-300" : "border-emerald-300"}`}>
          <div className="flex items-start justify-between gap-4">
            <div><div className="text-[10px] font-black uppercase tracking-wider text-slate-500">{item.source} · score {item.score}</div><div className="mt-1 font-black text-slate-950">{item.title}</div><div className="mt-2 text-sm leading-5 text-slate-600">{item.detail}</div></div>
            <StatusPill state={item.severity === "high" ? "error" : item.severity === "medium" ? "warn" : "ok"} />
          </div>
          <div className="mt-4 text-xs font-black text-cyan-800">Åpne arbeidsflate →</div>
        </Link>)}
        {!loading && !data?.attention?.length && <div className="rounded-2xl border border-slate-300 bg-white p-8 text-sm text-slate-600">Ingen attention-data tilgjengelig.</div>}
      </div>
    </section>

    <section>
      <div className="mb-3"><h2 className="text-xl font-black">Live OS-status</h2><p className="text-sm text-slate-600">Kjerneindikatorene som Nexus bruker i prioriteringen.</p></div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <Link href="/approvals" className="rounded-2xl border border-slate-300 bg-white p-5 shadow-sm"><div className="flex justify-between gap-2"><div className="text-xs font-black uppercase text-slate-500">Approvals</div><StatusPill state={Number(summary?.approvalsPending || 0) ? "warn" : "ok"} /></div><div className="mt-3 text-3xl font-black">{summary?.approvalsPending ?? "—"}</div><div className="text-sm text-slate-600">pending · {summary?.approvalsHighRisk ?? 0} high-risk</div>{Number(summary?.approvalOpportunityEur || 0) > 0 && <div className="mt-2 text-xs font-bold text-slate-500">€{Math.round(summary?.approvalOpportunityEur || 0).toLocaleString("nb-NO")} estimert opportunity</div>}</Link>

        <Link href="/nexus-os/communications/social" className="rounded-2xl border border-slate-300 bg-white p-5 shadow-sm"><div className="flex justify-between gap-2"><div className="text-xs font-black uppercase text-slate-500">Social Inbox</div><StatusPill state={!summary?.socialSyncEnabled ? "idle" : lastSync?.status === "success" ? "ok" : "warn"} /></div><div className="mt-3 text-3xl font-black">{summary?.instagramCommentReadReady ?? "—"}/{summary?.instagramConnected ?? "—"}</div><div className="text-sm text-slate-600">Instagram comment-read klare</div><div className="mt-2 text-xs text-slate-500">Siste sync: {formatDate(lastSync?.createdAt)} · {lastSync?.readOnly ? "read-only" : "ukjent modus"}</div></Link>

        <Link href="/book-growth" className="rounded-2xl border border-slate-300 bg-white p-5 shadow-sm"><div className="flex justify-between gap-2"><div className="text-xs font-black uppercase text-slate-500">Book Growth</div><StatusPill state={Number(summary?.bookPending || 0) ? "warn" : "ok"} /></div><div className="mt-3 text-3xl font-black">{summary?.bookPending ?? "—"}</div><div className="text-sm text-slate-600">recommendations pending</div><div className="mt-2 text-xs text-slate-500">{summary?.bookReviewCandidatesPending ?? 0} structural candidates · {summary?.bookApplied ?? 0} applied · {summary?.bookMeasuring ?? 0} measuring</div></Link>

        <Link href="/automation" className="rounded-2xl border border-slate-300 bg-white p-5 shadow-sm"><div className="flex justify-between gap-2"><div className="text-xs font-black uppercase text-slate-500">Automation 24h</div><StatusPill state={Number(summary?.automationFailures24h || 0) ? "error" : Number(summary?.automationPartial24h || 0) ? "warn" : "ok"} /></div><div className="mt-3 text-3xl font-black">{summary?.automationFailures24h ?? "—"}</div><div className="text-sm text-slate-600">feil · {summary?.automationPartial24h ?? 0} partial</div><div className="mt-2 text-xs text-slate-500">{summary?.automationRuns24h ?? 0} loggede kjøringer siste 24 timer</div></Link>

        <Link href="/nexus-os/runtime" className="rounded-2xl border border-slate-300 bg-white p-5 shadow-sm"><div className="flex justify-between gap-2"><div className="text-xs font-black uppercase text-slate-500">Runtime</div><StatusPill state={summary?.socialAutoReplyLive ? "error" : "ok"} /></div><div className="mt-3 text-3xl font-black">{summary?.runtimeHighRiskEnabled ?? "—"}</div><div className="text-sm text-slate-600">high/critical controls aktive</div><div className="mt-2 text-xs text-slate-500">{summary?.runtimeEnabled ?? 0} controls totalt PÅ · Social Auto-Reply LIVE: {summary?.socialAutoReplyLive ? "PÅ" : "AV"}</div></Link>
      </div>
    </section>

    <section className="grid gap-4 xl:grid-cols-2">
      <div className="rounded-2xl border border-slate-300 bg-white shadow-sm">
        <div className="border-b border-slate-200 p-5"><h2 className="font-black">Social sync health</h2><p className="mt-1 text-sm text-slate-600">Canonical read-only sync og capability coverage.</p></div>
        <div className="grid gap-3 p-5 sm:grid-cols-4"><div className="rounded-xl bg-slate-50 p-3 text-center"><div className="text-2xl font-black">{lastSync?.commentsFetched ?? "—"}</div><div className="text-[10px] uppercase text-slate-500">comments read</div></div><div className="rounded-xl bg-slate-50 p-3 text-center"><div className="text-2xl font-black">{lastSync?.eligibleChannels ?? "—"}</div><div className="text-[10px] uppercase text-slate-500">eligible</div></div><div className="rounded-xl bg-slate-50 p-3 text-center"><div className="text-2xl font-black">{lastSync?.skippedMissingCapability ?? "—"}</div><div className="text-[10px] uppercase text-slate-500">scope skipped</div></div><div className="rounded-xl bg-slate-50 p-3 text-center"><div className="text-2xl font-black">{lastSync?.channelErrors ?? "—"}</div><div className="text-[10px] uppercase text-slate-500">channel errors</div></div></div>
        <div className="border-t border-slate-200 p-5 text-sm text-slate-600">0 kommentarer er bare et ekte 0 for kanaler som faktisk var eligible og ble lest. Skipped kanaler forblir ukjent til reconnect/capability er på plass.</div>
      </div>

      <div className="rounded-2xl border border-slate-300 bg-white shadow-sm">
        <div className="border-b border-slate-200 p-5"><h2 className="font-black">High-risk Runtime controls</h2><p className="mt-1 text-sm text-slate-600">Aktiv high/critical betyr ikke automatisk feil; Nexus viser dem fordi de fortjener ekstra synlighet.</p></div>
        <div className="divide-y divide-slate-200">{(data?.runtime?.highRiskEnabled ?? []).map((row) => <div key={row.control_key} className="flex items-center justify-between gap-4 p-4"><div><div className="font-bold">{row.label}</div><div className="text-xs text-slate-500">{row.control_key} · {row.category}</div></div><StatusPill state={row.risk_level === "critical" ? "error" : "warn"} label={row.risk_level} /></div>)}{!loading && !(data?.runtime?.highRiskEnabled ?? []).length && <div className="p-6 text-sm text-slate-600">Ingen high/critical Runtime-controls er aktive.</div>}</div>
      </div>
    </section>

    {data?.sourceState?.errors?.length ? <section className="rounded-2xl border border-rose-300 bg-rose-50 p-5"><div className="flex items-center gap-2 font-black text-rose-950"><ShieldAlert className="h-5 w-5" />Datakilder med feil</div><div className="mt-3 space-y-2">{data.sourceState.errors.map((item) => <Link href={item.href} key={`${item.source}-${item.message}`} className="block rounded-xl border border-rose-200 bg-white p-3 text-sm text-rose-950"><b>{item.source}:</b> {item.message}</Link>)}</div></section> : data && <div className="flex items-center gap-2 rounded-2xl border border-emerald-300 bg-emerald-50 p-4 text-sm font-semibold text-emerald-950"><CheckCircle2 className="h-5 w-5" />Alle statuskildene i Attention Center svarte på siste refresh.</div>}

    <section>
      <div className="mb-3"><h2 className="text-xl font-black">Operativsystemer</h2><p className="text-sm text-slate-600">Direkte innganger til de viktigste arbeidsflatene.</p></div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">{systems.map((item) => <Link key={item.href} href={item.href} className="group rounded-2xl border border-slate-300 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-cyan-500 hover:shadow-lg"><div className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">{item.badge}</div><h3 className="mt-2 text-lg font-black group-hover:text-cyan-800">{item.title}</h3><p className="mt-2 text-sm leading-5 text-slate-600">{item.text}</p><div className="mt-4 text-xs font-black text-cyan-800">Åpne →</div></Link>)}</div>
    </section>

    <section>
      <div className="mb-3"><h2 className="text-lg font-black">Kontrollflater</h2><p className="text-sm text-slate-600">Ingen skjulte URL-er: de operative støtteflatene ligger her.</p></div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{controls.map((item) => <Link key={item.href} href={item.href} className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-black shadow-sm hover:border-cyan-500">{item.title} →</Link>)}</div>
    </section>

    <div className="flex gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950"><Clock3 className="mt-0.5 h-5 w-5 shrink-0" /><div><b>Nexus-regel:</b> status og prioritet er read-only observability. Attention Center utfører ikke approvals, publisering, Book Growth apply eller andre irreversible handlinger på egen hånd.</div></div>
  </div>;
}
