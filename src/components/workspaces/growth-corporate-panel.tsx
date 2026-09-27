"use client";

import { useEffect, useMemo, useState } from "react";
import { Building2, Megaphone, RefreshCw, Search, Video } from "lucide-react";
import type { WorkspacePermission } from "@/lib/workspaces/brand-policy";

type CorporateRow = {
  id: string; companyName: string; status: string; fitScore: number; fitTier: string;
  city?: string | null; industry?: string | null; nextAction?: string | null;
  websiteUrl?: string | null; partnerType?: string | null; referralAngle?: string | null;
};
type Visibility = {
  searchDiscovery?: Array<{ source: string; arrivals: number }>;
  topPaths?: Array<{ path: string; arrivals: number }>;
  seoWork?: Array<{ id: string; title: string; status: string; priority: string; nextAction?: string | null }>;
};
type AdRow = {
  id: string; name: string; productName: string; status: string; growthGoal?: string | null;
  targetMarkets?: string[] | null; totalCreatives?: number | null; estimatedCostUsd?: number | null;
};
type Planned = {
  id: string; kind: string; title: string; status: string; priority: string;
  dueDate?: string | null; nextAction?: string | null; sourceId?: string | null;
};
type GrowthData = {
  corporate: { prospects?: CorporateRow[]; partners?: CorporateRow[] } | null;
  visibility: Visibility | null;
  ads: AdRow[] | null;
  plannedWork: Planned[];
};

const kindLabels: Record<string, string> = {
  corporate: "Corporate research / neste steg",
  seo: "SEO",
  geo: "GEO · generativ søk",
  aeo: "AEO · svarmotorer",
  keywords: "Søkeord",
  content: "Tekst / landingsside",
  ads: "Annonsebrief / annonseutkast",
  video: "Video",
  info_meeting: "Informasjonsmøte / webinar",
};

export function GrowthCorporatePanel({
  brandKey,
  permissions,
}: {
  brandKey: string;
  permissions: WorkspacePermission[];
}) {
  const [data, setData] = useState<GrowthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [kind, setKind] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [nextAction, setNextAction] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [priority, setPriority] = useState("MEDIUM");
  const [sourceId, setSourceId] = useState("");

  const allowedKinds = useMemo(() => {
    const values: string[] = [];
    if (brandKey === "zeneco" && permissions.includes("corporate.plan")) values.push("corporate");
    if (permissions.includes("visibility.plan")) values.push("seo", "geo", "aeo", "keywords", "content");
    if (permissions.includes("ads.draft")) values.push("ads");
    if (permissions.includes("events.plan")) values.push("video", "info_meeting");
    return values;
  }, [brandKey, permissions]);

  useEffect(() => {
    if (!allowedKinds.includes(kind)) setKind(allowedKinds[0] || "");
  }, [allowedKinds, kind]);

  async function load() {
    setLoading(true); setError("");
    try {
      const response = await fetch(`/api/workspaces/${encodeURIComponent(brandKey)}/growth`, { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(response.status === 403
        ? "Du har ikke Growth/Corporate-tilgang i dette arbeidsområdet."
        : "Growth/Corporate-data kunne ikke hentes.");
      setData({
        corporate: body.corporate || null,
        visibility: body.visibility || null,
        ads: Array.isArray(body.ads) ? body.ads : null,
        plannedWork: Array.isArray(body.plannedWork) ? body.plannedWork : [],
      });
    } catch (cause) {
      setData(null);
      setError(cause instanceof Error ? cause.message : "Growth/Corporate-data kunne ikke hentes.");
    } finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, [brandKey]);

  async function createWork() {
    if (!kind || !title.trim() || busy) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch(`/api/workspaces/${encodeURIComponent(brandKey)}/growth`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind, title: title.trim(), description: description.trim(),
          nextAction: nextAction.trim(), dueDate: dueDate || null,
          priority, sourceId: sourceId.trim(),
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(
        response.status === 403 ? "Du har ikke rettighet til denne typen arbeid."
          : response.status === 400 ? "Kontroller oppgavetypen og feltene."
          : "Arbeidsoppgaven kunne ikke opprettes.",
      );
      setNotice("Arbeidsoppgaven er opprettet. Ingen publisering, utsending, invitasjon eller annonsebruk er startet.");
      setTitle(""); setDescription(""); setNextAction(""); setDueDate(""); setSourceId("");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Arbeidsoppgaven kunne ikke opprettes.");
    } finally { setBusy(false); }
  }

  if (loading) return <p className="text-sm text-slate-400">Laster Growth & Corporate…</p>;

  return <section className="space-y-5">
    {error && <p role="alert" className="rounded-xl border border-amber-800 bg-amber-950/30 p-4 text-sm text-amber-200">{error}</p>}
    {notice && <p role="status" className="rounded-xl border border-emerald-800 bg-emerald-950/25 p-4 text-sm text-emerald-200">{notice}</p>}

    {data?.corporate && <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-semibold"><Building2 size={19}/> Corporate Homes</h2>
          <p className="mt-1 text-xs text-slate-400">Bedrifter og partnerkanaler for Zen Eco Homes. Ingen automatisk kontakt eller statusendring.</p>
        </div>
        <button type="button" onClick={() => void load()} className="inline-flex items-center gap-2 text-sm text-cyan-300"><RefreshCw size={15}/> Oppdater</button>
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div>
          <h3 className="text-sm font-semibold text-cyan-200">Bedriftsprospekter · {data.corporate.prospects?.length || 0}</h3>
          <div className="mt-2 max-h-[420px] space-y-2 overflow-y-auto">
            {(data.corporate.prospects || []).map(row => <article key={row.id} className="rounded-xl border border-slate-800 bg-slate-950/55 p-3">
              <div className="flex justify-between gap-3"><strong className="text-sm">{row.companyName}</strong><span className="text-xs text-cyan-300">{row.fitTier} · {row.fitScore}</span></div>
              <p className="mt-1 text-xs text-slate-400">{[row.city,row.industry,row.status].filter(Boolean).join(" · ")}</p>
              {row.nextAction && <p className="mt-2 text-xs text-slate-300">Neste: {row.nextAction}</p>}
              {permissions.includes("corporate.plan") && <button type="button" className="mt-2 text-xs text-cyan-300 underline"
                onClick={() => { setKind("corporate"); setSourceId(row.id); setTitle(`Corporate · ${row.companyName}`); setNextAction(row.nextAction || ""); }}>
                Lag arbeidsoppgave
              </button>}
            </article>)}
          </div>
        </div>
        <div>
          <h3 className="text-sm font-semibold text-cyan-200">Partnerprospekter · {data.corporate.partners?.length || 0}</h3>
          <div className="mt-2 max-h-[420px] space-y-2 overflow-y-auto">
            {(data.corporate.partners || []).map(row => <article key={row.id} className="rounded-xl border border-slate-800 bg-slate-950/55 p-3">
              <div className="flex justify-between gap-3"><strong className="text-sm">{row.companyName}</strong><span className="text-xs text-cyan-300">{row.fitTier} · {row.fitScore}</span></div>
              <p className="mt-1 text-xs text-slate-400">{[row.partnerType,row.city,row.status].filter(Boolean).join(" · ")}</p>
              {row.referralAngle && <p className="mt-2 text-xs text-slate-300">{row.referralAngle}</p>}
              {permissions.includes("corporate.plan") && <button type="button" className="mt-2 text-xs text-cyan-300 underline"
                onClick={() => { setKind("corporate"); setSourceId(row.id); setTitle(`Corporate partner · ${row.companyName}`); setNextAction(row.nextAction || ""); }}>
                Lag arbeidsoppgave
              </button>}
            </article>)}
          </div>
        </div>
      </div>
    </div>}

    {data?.visibility && <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
      <h2 className="flex items-center gap-2 text-xl font-semibold"><Search size={19}/> SEO · GEO · AEO · søkeord</h2>
      <p className="mt-1 text-xs text-slate-400">Førsteparts søke-/AI-henvisninger og aktive SEO-oppgaver for denne merkevaren.</p>
      <div className="mt-4 grid gap-4 md:grid-cols-3">
        <div className="rounded-xl border border-slate-800 bg-slate-950/55 p-4">
          <h3 className="text-sm font-semibold">Søk/AI siste 30 dager</h3>
          <div className="mt-2 space-y-1 text-xs text-slate-300">{(data.visibility.searchDiscovery || []).map(row =>
            <div key={row.source} className="flex justify-between gap-2"><span>{row.source}</span><strong>{row.arrivals}</strong></div>)}
            {!data.visibility.searchDiscovery?.length && <span className="text-slate-500">Ingen målte henvisninger.</span>}
          </div>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-950/55 p-4">
          <h3 className="text-sm font-semibold">Topp landingssider</h3>
          <div className="mt-2 space-y-1 text-xs text-slate-300">{(data.visibility.topPaths || []).slice(0,10).map(row =>
            <div key={row.path} className="flex justify-between gap-2"><span className="truncate">{row.path}</span><strong>{row.arrivals}</strong></div>)}
            {!data.visibility.topPaths?.length && <span className="text-slate-500">Ingen målte sider ennå.</span>}
          </div>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-950/55 p-4">
          <h3 className="text-sm font-semibold">SEO-oppgaver</h3>
          <div className="mt-2 space-y-2 text-xs">{(data.visibility.seoWork || []).slice(0,10).map(row =>
            <div key={row.id}><strong>{row.title}</strong><div className="text-slate-500">{row.priority} · {row.status}</div></div>)}
            {!data.visibility.seoWork?.length && <span className="text-slate-500">Ingen aktive SEO-oppgaver.</span>}
          </div>
        </div>
      </div>
    </div>}

    {data?.ads && <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
      <h2 className="flex items-center gap-2 text-xl font-semibold"><Megaphone size={19}/> Annonser</h2>
      <p className="mt-1 text-xs text-slate-400">Kampanjeoversikt. Denne medarbeiderflaten kan ikke starte spend eller publisering.</p>
      <div className="mt-4 grid gap-3 md:grid-cols-2">{data.ads.map(row =>
        <article key={row.id} className="rounded-xl border border-slate-800 bg-slate-950/55 p-4">
          <div className="flex justify-between gap-3"><strong>{row.name}</strong><span className="text-xs text-cyan-300">{row.status}</span></div>
          <p className="mt-1 text-xs text-slate-400">{row.productName}{row.growthGoal ? ` · ${row.growthGoal}` : ""}</p>
          {permissions.includes("ads.draft") && <button type="button" className="mt-2 text-xs text-cyan-300 underline"
            onClick={() => { setKind("ads"); setSourceId(row.id); setTitle(`Annonse · ${row.name}`); }}>
            Lag ny annonseoppgave
          </button>}
        </article>)}
        {data.ads.length === 0 && <p className="text-sm text-slate-500">Ingen kampanjer for denne merkevaren.</p>}
      </div>
    </div>}

    {allowedKinds.length > 0 && <form onSubmit={event => { event.preventDefault(); void createWork(); }}
      className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
      <h2 className="flex items-center gap-2 text-xl font-semibold"><Video size={19}/> Ny Growth-oppgave</h2>
      <p className="mt-1 text-xs text-slate-400">Brukes til Corporate, SEO/GEO/AEO, søkeord/tekst, annonsebrief, video og informasjonsmøter.</p>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <label className="text-xs text-slate-300">Type
          <select value={kind} onChange={e => setKind(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm">
            {allowedKinds.map(value => <option key={value} value={value}>{kindLabels[value] || value}</option>)}
          </select>
        </label>
        <label className="text-xs text-slate-300">Prioritet
          <select value={priority} onChange={e => setPriority(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm">
            <option value="LOW">Lav</option><option value="MEDIUM">Medium</option><option value="HIGH">Høy</option><option value="CRITICAL">Kritisk</option>
          </select>
        </label>
        <label className="text-xs text-slate-300 md:col-span-2">Tittel *
          <input required maxLength={180} value={title} onChange={e => setTitle(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm"/>
        </label>
        <label className="text-xs text-slate-300 md:col-span-2">Beskrivelse
          <textarea rows={4} maxLength={4000} value={description} onChange={e => setDescription(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm"/>
        </label>
        <label className="text-xs text-slate-300">Neste handling
          <input maxLength={1000} value={nextAction} onChange={e => setNextAction(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm"/>
        </label>
        <label className="text-xs text-slate-300">Frist
          <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm"/>
        </label>
      </div>
      <button type="submit" disabled={busy || !kind || !title.trim()}
        className="mt-4 rounded-lg bg-cyan-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">
        {busy ? "Oppretter…" : "Opprett arbeidsoppgave"}
      </button>
    </form>}

    <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
      <h2 className="text-xl font-semibold">Mine planlagte Growth-oppgaver</h2>
      <div className="mt-3 space-y-2">{(data?.plannedWork || []).map(row =>
        <article key={row.id} className="rounded-xl border border-slate-800 bg-slate-950/55 p-3">
          <div className="flex justify-between gap-3"><strong className="text-sm">{row.title}</strong><span className="text-xs text-cyan-300">{kindLabels[row.kind] || row.kind}</span></div>
          <p className="mt-1 text-xs text-slate-500">{row.priority} · {row.status}{row.dueDate ? ` · frist ${row.dueDate}` : ""}</p>
          {row.nextAction && <p className="mt-2 text-xs text-slate-300">{row.nextAction}</p>}
        </article>)}
        {!data?.plannedWork.length && <p className="text-sm text-slate-500">Ingen egne Growth-oppgaver ennå.</p>}
      </div>
    </div>
  </section>;
}
