"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Candidate = {
  sourceId: string;
  brandId: string;
  sourceType: string;
  sourceRef: string;
  title: string;
  sourceUrl: string | null;
  score: number;
  channels: string[];
  lastPublishedAt: string | null;
  lastPlannedAt: string | null;
  reasons: string[];
};

type Payload = {
  generatedAt: string;
  policy: { automaticPublishing: boolean; automaticApproval: boolean; maxSelectedPerBrand?: number; normalMaxSelectedPerBrand?: number; selectionLimit: number; note: string };
  summary: { readySources: number; eligibleSources: number; selected: number; brandsSelected: number };
  selected: Candidate[];
};

type CampaignStart = {
  id: string;
  title: string;
  publicationId: string | null;
  status: string;
  risk: string | null;
  decisionMode: string | null;
  confidence: number | null;
  reason: string | null;
  createdAt: string;
  resolvedAt: string | null;
  executedAt: string | null;
  executionDetail: string | null;
  approvalHref: string;
};

type CampaignStartsPayload = {
  summary: { total: number; pending: number; approved: number; executed: number; rejected: number };
  rows: CampaignStart[];
};

type ActionState = {
  loading?: boolean;
  ok?: boolean;
  message?: string;
  campaignId?: string | null;
  approvalId?: string | null;
  approvalHref?: string | null;
  publicationId?: string | null;
  workflowState?: string | null;
};

function statusLabel(status: string) {
  if (status === "pending") return "Venter på godkjenning";
  if (status === "approved") return "Godkjent — venter execution";
  if (status === "executed") return "Publisert / utført";
  if (status === "rejected") return "Avvist";
  return status;
}

function statusClass(status: string) {
  if (status === "pending") return "border-amber-200 bg-amber-50 text-amber-900";
  if (status === "approved") return "border-cyan-200 bg-cyan-50 text-cyan-900";
  if (status === "executed") return "border-emerald-200 bg-emerald-50 text-emerald-900";
  if (status === "rejected") return "border-rose-200 bg-rose-50 text-rose-900";
  return "border-slate-200 bg-slate-50 text-slate-800";
}

export default function NexusDirectorPage() {
  const [data, setData] = useState<Payload | null>(null);
  const [starts, setStarts] = useState<CampaignStartsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actions, setActions] = useState<Record<string, ActionState>>({});

  const load = async () => {
    setLoading(true); setError("");
    try {
      const [directorRes, startsRes] = await Promise.all([
        fetch("/api/nexus/director?limit=10", { cache: "no-store", credentials: "same-origin" }),
        fetch("/api/nexus/campaign-starts?limit=12", { cache: "no-store", credentials: "same-origin" }),
      ]);
      const directorBody = await directorRes.json().catch(() => ({}));
      if (!directorRes.ok) throw new Error(directorBody?.error || `Director feilet (${directorRes.status})`);
      setData(directorBody as Payload);
      const startsBody = await startsRes.json().catch(() => ({}));
      if (startsRes.ok) setStarts(startsBody as CampaignStartsPayload);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally { setLoading(false); }
  };

  const createDraft = async (row: Candidate, channel: string) => {
    const key = `${row.sourceId}:${channel}`;
    setActions((prev) => ({ ...prev, [key]: { loading: true } }));
    try {
      const res = await fetch("/api/nexus/source-queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ sourceQueueId: row.sourceId, channel }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || `Kunne ikke lage kampanjeutkast (${res.status})`);
      const approvalId = body?.workflow?.approvalId ?? body?.campaign?.results?.find?.((x: { approvalId?: string | null }) => x?.approvalId)?.approvalId ?? null;
      const approvalHref = approvalId
        ? `/approvals?approvalId=${encodeURIComponent(approvalId)}#agentic-approval-${encodeURIComponent(approvalId)}`
        : "/approvals";
      setActions((prev) => ({
        ...prev,
        [key]: {
          ok: true,
          message: approvalId
            ? "Kampanjestart opprettet. Venter nå på din godkjenning før publisering."
            : "Kampanjeutkast opprettet. Åpne Kontroll for videre status.",
          campaignId: body?.campaign?.campaignId ?? null,
          approvalId,
          approvalHref,
          publicationId: body?.workflow?.publicationId ?? null,
          workflowState: body?.workflow?.state ?? "draft_created",
        },
      }));
      await load();
    } catch (e) {
      setActions((prev) => ({ ...prev, [key]: { ok: false, message: e instanceof Error ? e.message : String(e) } }));
    }
  };

  useEffect(() => { void load(); }, []);

  const maxPerBrand = data?.policy.normalMaxSelectedPerBrand ?? data?.policy.maxSelectedPerBrand ?? 2;

  return <div className="mx-auto max-w-[1500px] space-y-6 p-6">
    <header className="rounded-3xl border border-violet-900/30 bg-gradient-to-br from-slate-950 via-slate-900 to-violet-950 p-7 text-white shadow-xl">
      <div className="text-xs font-black uppercase tracking-[0.24em] text-violet-300">Nexus OS · Portfolio Automation Director</div>
      <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
        <div><h1 className="text-3xl font-black">Hva bør RealtyFlow markedsføre neste?</h1><p className="mt-2 max-w-4xl text-sm leading-6 text-slate-300">Director prioriterer ekte sources på tvers av books, eiendom, ChatGenius, Doña Anna og creator-brandene. «Lag utkast» oppretter kampanjestart og sender den til Kontroll. Ingenting er publisert før approval og execution er fullført.</p></div>
        <div className="flex gap-2"><Link href="/nexus-os" className="rounded-xl border border-white/20 px-4 py-2 text-sm font-bold">Nexus</Link><Link href="/approvals" className="rounded-xl border border-white/20 px-4 py-2 text-sm font-bold">Kontroll</Link><button onClick={load} disabled={loading} className="rounded-xl bg-violet-300 px-4 py-2 text-sm font-black text-slate-950 disabled:opacity-60">{loading ? "Beregner…" : "Beregn på nytt"}</button></div>
      </div>
    </header>

    {error && <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{error}</div>}

    {starts && starts.rows.length > 0 && <section className="rounded-2xl border border-cyan-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-cyan-100 p-5">
        <div><div className="text-xs font-black uppercase tracking-wider text-cyan-700">Nylige kampanjestarter</div><h2 className="mt-1 text-xl font-black text-slate-900">Her finner du det du nettopp sendte inn</h2><p className="mt-1 text-sm text-slate-600">Status følger faktisk approval/execution-state — ikke bare at et utkast ble laget.</p></div>
        <div className="flex gap-2 text-xs font-bold text-slate-600"><span>{starts.summary.pending} venter</span><span>·</span><span>{starts.summary.executed} utført</span></div>
      </div>
      <div className="grid gap-3 p-5 lg:grid-cols-2">{starts.rows.slice(0, 6).map((start) => <article key={start.id} className={`rounded-xl border p-4 ${statusClass(start.status)}`}>
        <div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="text-[10px] font-black uppercase tracking-wider opacity-70">{statusLabel(start.status)}</div><div className="mt-1 font-black">{start.title}</div></div><span className="shrink-0 rounded-full border border-current/20 bg-white/50 px-2 py-1 text-[10px] font-black uppercase">{start.risk ?? "—"}</span></div>
        {start.reason && <p className="mt-2 line-clamp-3 text-xs leading-5 opacity-80">{start.reason}</p>}
        <div className="mt-3 flex flex-wrap gap-2"><Link href={start.approvalHref} className="rounded-lg bg-slate-950 px-3 py-2 text-xs font-black text-white">{start.status === "pending" ? "Åpne konkret godkjenning" : "Åpne i Kontroll"}</Link>{start.publicationId && <span className="rounded-lg border border-current/20 bg-white/40 px-2 py-2 font-mono text-[10px] opacity-70">{start.publicationId}</span>}</div>
      </article>)}</div>
    </section>}

    {data && <>
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4"><div className="text-xs font-bold text-slate-500">READY SOURCES</div><div className="mt-1 text-3xl font-black">{data.summary.readySources}</div></div>
        <div className="rounded-xl border border-slate-200 bg-white p-4"><div className="text-xs font-bold text-slate-500">ELIGIBLE NOW</div><div className="mt-1 text-3xl font-black">{data.summary.eligibleSources}</div></div>
        <div className="rounded-xl border border-slate-200 bg-white p-4"><div className="text-xs font-bold text-slate-500">SELECTED</div><div className="mt-1 text-3xl font-black">{data.summary.selected}</div></div>
        <div className="rounded-xl border border-slate-200 bg-white p-4"><div className="text-xs font-bold text-slate-500">BRANDS</div><div className="mt-1 text-3xl font-black">{data.summary.brandsSelected}</div></div>
      </section>

      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900"><b>Policy:</b> Director velger normalt maksimalt {maxPerBrand} sources per brand. «Lag utkast» oppretter kampanjestart og approval — aldri direkte publisering.</div>

      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 p-5"><h2 className="text-xl font-black">Neste anbefalte sources</h2><p className="mt-1 text-sm text-slate-500">Prioritert etter business/source-priority, kanaltilkobling, fatigue og siste bruk.</p></div>
        <div className="divide-y divide-slate-100">{data.selected.map((row, index) => <article key={row.sourceId} className="grid gap-4 p-5 lg:grid-cols-[55px_1.4fr_90px_1fr_1.2fr_1.4fr] lg:items-start">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-violet-100 font-black text-violet-800">{index + 1}</div>
          <div><div className="text-[10px] font-black uppercase tracking-wider text-slate-400">{row.brandId} · {row.sourceType}</div><div className="mt-1 font-black text-slate-900">{row.title}</div>{row.sourceUrl && <a href={row.sourceUrl} target="_blank" rel="noreferrer" className="mt-1 block truncate text-xs font-bold text-cyan-700">Åpne source</a>}</div>
          <div><div className="text-[10px] font-bold text-slate-400">SCORE</div><div className="mt-1 text-2xl font-black">{row.score}</div></div>
          <div><div className="text-[10px] font-bold text-slate-400">KANALER</div><div className="mt-2 flex flex-wrap gap-1">{row.channels.map(c => <span key={c} className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold">{c}</span>)}</div></div>
          <div><div className="text-[10px] font-bold text-slate-400">HVORFOR</div><div className="mt-1 text-xs leading-5 text-slate-600">{row.reasons.join(" · ")}</div></div>
          <div><div className="text-[10px] font-bold text-slate-400">HANDLING</div><div className="mt-2 flex flex-wrap gap-2">{row.channels.filter(c => c === "instagram" || c === "facebook").map(channel => {
            const key = `${row.sourceId}:${channel}`;
            const action = actions[key];
            return <button key={channel} onClick={() => createDraft(row, channel)} disabled={action?.loading || action?.ok} className="rounded-lg bg-violet-700 px-3 py-2 text-xs font-black text-white disabled:opacity-50">{action?.loading ? "Lager…" : action?.ok ? "Kampanjestart laget" : `Lag ${channel}-utkast`}</button>;
          })}</div>{row.channels.every(c => c !== "instagram" && c !== "facebook") && <div className="mt-2 text-xs text-amber-700">Ingen Meta-kanal er klar for draft-pathen ennå.</div>}{Object.entries(actions).filter(([key]) => key.startsWith(`${row.sourceId}:`)).map(([key, action]) => action?.message ? <div key={key} className={`mt-2 rounded-lg p-3 text-[11px] ${action.ok ? "bg-emerald-50 text-emerald-900" : "bg-rose-50 text-rose-800"}`}><div className="font-bold">{action.message}</div>{action.ok && action.approvalHref && <Link href={action.approvalHref} className="mt-2 inline-block rounded-md bg-slate-950 px-3 py-2 font-black text-white">Åpne konkret godkjenning →</Link>}{action.campaignId && <div className="mt-2 font-mono text-[10px] opacity-60">Campaign: {action.campaignId}</div>}</div> : null)}</div>
        </article>)}</div>
      </section>
    </>}
  </div>;
}
