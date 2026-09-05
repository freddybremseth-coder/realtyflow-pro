"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type Learning = {
  actionType: string;
  mode: "EXPLORE" | "FAVOR" | "NEUTRAL" | "SUPPRESS";
  measured: number;
  positive: number;
  neutral: number;
  negative: number;
  averageLiftPct: number | null;
  rationale: string;
};

type Song = {
  id: string;
  title: string;
  artist: string;
  genre: string | null;
  mood: string | null;
  status: string;
  youtubeUrl: string | null;
  youtubeVideoId?: string | null;
  imageUrl: string | null;
  legacyBrand: string;
  createdAt?: string | null;
  updatedAt?: string | null;
  growthAction?: { actionType: string; executedAt: string | null; outcome: string | null; liftPct: number | null } | null;
};

type Payload = {
  summary: { songs: number; publishedToYoutube: number; pendingYoutube: number; promotionReady: number; promotionDrafted: number; connectedChannels: number; publications: number };
  channels: Array<{ id: string; platform: string; display_name: string }>;
  catalog: Song[];
  recent: Song[];
  growth: {
    status: "BLOCKED" | "READY_NOT_ENABLED" | "LEARNING_GUARDED" | "ACTIVE";
    autopilotEnabled: boolean;
    youtube: {
      connected: boolean;
      configured: boolean;
      reason: string | null;
      message: string | null;
      channel: { id: string; title: string; subscriberCount: number; videoCount: number; viewCount: number } | null;
    };
    learning: {
      metadata: Learning;
      playlist: Learning;
      suppressedActions: string[];
      positiveMetadataTags: Array<{ tag: string; count: number }>;
    };
    recentActions: Array<{ id: string; actionType: string; status: string; executedAt: string | null; feedback: { outcome: string | null; liftPct: number | null; measuredAt: string | null } | null }>;
    guardrails: { automaticTitleChanges: boolean; automaticThumbnailChanges: boolean; evidenceRequiredBeforeBias: number; feedbackObservationDays: number };
  };
  safety: { canonicalBrand: string; legacyBrandReads: string[]; legacyPipelinePreserved: boolean; automaticPublishingChanged: boolean; sourceOfTruth?: string; note: string };
};

type CatalogFilter = "all" | "youtube" | "pending" | "growth";

function statusTone(status: Payload["growth"]["status"]) {
  switch (status) {
    case "ACTIVE": return "border-emerald-400/50 bg-emerald-400/15 text-emerald-100";
    case "LEARNING_GUARDED": return "border-amber-400/50 bg-amber-400/15 text-amber-100";
    case "READY_NOT_ENABLED": return "border-sky-400/50 bg-sky-400/15 text-sky-100";
    default: return "border-rose-400/50 bg-rose-400/15 text-rose-100";
  }
}

function learningTone(mode: Learning["mode"]) {
  switch (mode) {
    case "FAVOR": return "bg-emerald-100 text-emerald-950 ring-emerald-400";
    case "SUPPRESS": return "bg-rose-100 text-rose-950 ring-rose-400";
    case "NEUTRAL": return "bg-slate-200 text-slate-950 ring-slate-400";
    default: return "bg-sky-100 text-sky-950 ring-sky-400";
  }
}

function dateLabel(value?: string | null) {
  if (!value) return "–";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "–" : date.toLocaleDateString("nb-NO");
}

export default function RemasterFreddyPage() {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<CatalogFilter>("all");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/remaster/overview", { cache: "no-store", credentials: "same-origin" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || `Re-Master overview feilet (${res.status})`);
      setData(body as Payload);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const filteredCatalog = useMemo(() => {
    if (!data) return [];
    const needle = query.trim().toLowerCase();
    return (data.catalog || []).filter((song) => {
      if (filter === "youtube" && !song.youtubeUrl) return false;
      if (filter === "pending" && song.youtubeUrl) return false;
      if (filter === "growth" && !song.growthAction) return false;
      if (!needle) return true;
      return [song.title, song.artist, song.genre, song.mood, song.status]
        .some((value) => String(value || "").toLowerCase().includes(needle));
    });
  }, [data, filter, query]);

  return <div className="mx-auto max-w-[1500px] space-y-6 p-6 text-slate-950">
    <header className="rounded-3xl border border-pink-700/50 bg-gradient-to-br from-slate-950 via-slate-900 to-pink-950 p-7 text-white shadow-xl">
      <div className="text-xs font-black uppercase tracking-[0.24em] text-pink-300">Nexus OS · Creator Growth</div>
      <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-white">Re-Master Freddy</h1>
          <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-100">Produksjon og publisering skjer i Re-Master Admin. RealtyFlow overvåker katalog, YouTube, promotering og autonom lyttervekst fra samme Supabase-kilde.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href="https://remaster.freddybremseth.com/admin" target="_blank" rel="noreferrer" className="rounded-xl bg-pink-300 px-4 py-2 text-sm font-black text-slate-950 shadow hover:bg-pink-200">+ Legg til / publiser sang</a>
          <Link href="/nexus-os" className="rounded-xl border border-white/40 bg-white/10 px-4 py-2 text-sm font-bold text-white hover:bg-white/15">Nexus</Link>
          <Link href="/connections" className="rounded-xl border border-white/40 bg-white/10 px-4 py-2 text-sm font-bold text-white hover:bg-white/15">Connections</Link>
          <button onClick={load} disabled={loading} className="rounded-xl border border-white/40 bg-white/10 px-4 py-2 text-sm font-bold text-white hover:bg-white/15 disabled:opacity-60">{loading ? "Oppdaterer…" : "Oppdater"}</button>
        </div>
      </div>
    </header>

    <section className="rounded-2xl border-2 border-sky-300 bg-sky-50 p-5 shadow-sm">
      <div className="text-xs font-black uppercase tracking-wider text-sky-900">Låst arbeidsflyt</div>
      <div className="mt-1 text-lg font-black text-slate-950">Én kilde inn → ett autonomt growth-lag</div>
      <p className="mt-2 text-sm font-medium leading-6 text-slate-800">Ny sang opprettes og publiseres i <b>remaster.freddybremseth.com/admin</b>. Data går til delt Supabase. RealtyFlow/Nexus oppdager sangen derfra og følger YouTube, promotion, metadata, playlists og læring videre. Du skal ikke registrere samme sang på nytt her.</p>
    </section>

    {error && <div className="rounded-xl border-2 border-rose-300 bg-rose-100 p-4 text-sm font-semibold text-rose-950">{error}</div>}

    {data && <>
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
        {[["SONGS", data.summary.songs],["YOUTUBE LIVE", data.summary.publishedToYoutube],["PENDING YT", data.summary.pendingYoutube],["PROMO READY", data.summary.promotionReady],["PROMO DRAFTED", data.summary.promotionDrafted],["CHANNELS", data.summary.connectedChannels],["PUBLICATIONS", data.summary.publications]].map(([label, value]) =>
          <div key={String(label)} className="rounded-xl border-2 border-slate-300 bg-white p-4 shadow-sm"><div className="text-[10px] font-black tracking-wide text-slate-700">{label}</div><div className="mt-1 text-2xl font-black text-slate-950">{value}</div></div>)}
      </section>

      <section className="rounded-2xl border-2 border-slate-700 bg-slate-950 p-5 text-white shadow-lg">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div><div className="text-xs font-black uppercase tracking-[0.18em] text-pink-300">Growth Health</div><h2 className="mt-1 text-2xl font-black text-white">Autonom lyttervekst</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-100">Systemet måler, forbedrer og lærer fra publiserte Re-Master-videoer. Negative mønstre kan automatisk undertrykkes før de gjentas.</p></div>
          <div className={`rounded-full border px-4 py-2 text-xs font-black tracking-wide ${statusTone(data.growth.status)}`}>{data.growth.status.replaceAll("_", " ")}</div>
        </div>
        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-xl border border-slate-600 bg-slate-900 p-4"><div className="text-[10px] font-black uppercase tracking-wider text-slate-300">Autopilot</div><div className="mt-1 text-lg font-black text-white">{data.growth.autopilotEnabled ? "Aktiv" : "Av"}</div><div className="mt-1 text-xs text-slate-200">{data.growth.autopilotEnabled ? "Daglig growth-loop er tillatt." : "Miljøvariabelen er ikke aktiv i runtime."}</div></div>
          <div className="rounded-xl border border-slate-600 bg-slate-900 p-4"><div className="text-[10px] font-black uppercase tracking-wider text-slate-300">YouTube</div><div className="mt-1 text-lg font-black text-white">{data.growth.youtube.connected ? "Connected" : "Ikke tilkoblet"}</div><div className="mt-1 text-xs text-slate-200">{data.growth.youtube.channel?.title || data.growth.youtube.message || "Ingen kanalinfo"}</div></div>
          {[data.growth.learning.metadata, data.growth.learning.playlist].map((item) => <div key={item.actionType} className="rounded-xl border border-slate-600 bg-slate-900 p-4"><div className="text-[10px] font-black uppercase tracking-wider text-slate-300">{item.actionType === "update_metadata" ? "Metadata learning" : "Playlist learning"}</div><span className={`mt-2 inline-flex rounded-full px-2.5 py-1 text-xs font-black ring-1 ${learningTone(item.mode)}`}>{item.mode}</span><div className="mt-2 text-xs text-slate-200">{item.measured} målt · {item.averageLiftPct ?? "–"}% snitt-lift</div></div>)}
        </div>
      </section>

      <section className="rounded-2xl border-2 border-slate-300 bg-white shadow-sm">
        <div className="border-b-2 border-slate-300 p-5">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div><div className="text-xs font-black uppercase tracking-wider text-slate-700">Canonical catalog</div><h2 className="mt-1 text-2xl font-black text-slate-950">Alle sanger</h2><p className="mt-1 text-sm font-medium text-slate-700">{filteredCatalog.length} av {data.catalog.length} vises. Katalogen leses fra samme Supabase som Re-Master Admin.</p></div>
            <a href="https://remaster.freddybremseth.com/admin" target="_blank" rel="noreferrer" className="rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-black text-white hover:bg-slate-800">Åpne Re-Master Admin ↗</a>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-[1fr_220px]">
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Søk tittel, artist, genre, mood eller status…" className="rounded-xl border-2 border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-950 outline-none placeholder:text-slate-500 focus:border-pink-500" />
            <select value={filter} onChange={(e) => setFilter(e.target.value as CatalogFilter)} className="rounded-xl border-2 border-slate-300 bg-white px-4 py-3 text-sm font-bold text-slate-950 outline-none focus:border-pink-500">
              <option value="all">Alle</option><option value="youtube">YouTube live</option><option value="pending">Venter YouTube</option><option value="growth">Growth action utført</option>
            </select>
          </div>
        </div>
        <div className="divide-y divide-slate-200">
          {filteredCatalog.map((song) => <article key={song.id} className="grid gap-3 p-4 sm:grid-cols-[72px_1fr_auto] sm:items-center hover:bg-slate-50">
            {song.imageUrl ? <img src={song.imageUrl} alt="" className="h-14 w-14 rounded-lg border border-slate-300 object-cover" /> : <div className="flex h-14 w-14 items-center justify-center rounded-lg bg-slate-200 text-xs font-black text-slate-700">MUSIC</div>}
            <div className="min-w-0">
              <div className="truncate font-black text-slate-950">{song.title}</div>
              <div className="mt-0.5 text-xs font-semibold text-slate-700">{song.artist || "Artist ukjent"} · {song.genre || "genre ukjent"} · {song.status || "status ukjent"}</div>
              <div className="mt-2 flex flex-wrap gap-2">
                {song.youtubeUrl ? <span className="rounded-full bg-red-100 px-2 py-1 text-[10px] font-black text-red-900">YOUTUBE LIVE</span> : <span className="rounded-full bg-amber-200 px-2 py-1 text-[10px] font-black text-amber-950">VENTER YOUTUBE</span>}
                {song.growthAction && <span className="rounded-full bg-violet-100 px-2 py-1 text-[10px] font-black text-violet-950">GROWTH: {song.growthAction.actionType.replaceAll("_", " ")}</span>}
                {song.growthAction?.outcome && <span className="rounded-full bg-sky-100 px-2 py-1 text-[10px] font-black text-sky-950">{song.growthAction.outcome}{song.growthAction.liftPct != null ? ` · ${song.growthAction.liftPct}%` : ""}</span>}
                <span className="text-[10px] font-bold text-slate-500">Oppdatert {dateLabel(song.updatedAt || song.createdAt)}</span>
              </div>
            </div>
            <div className="flex gap-2">{song.youtubeUrl && <a href={song.youtubeUrl} target="_blank" rel="noreferrer" className="rounded-lg bg-red-600 px-3 py-2 text-xs font-black text-white hover:bg-red-700">YouTube</a>}</div>
          </article>)}
          {filteredCatalog.length === 0 && <div className="p-8 text-center text-sm font-semibold text-slate-600">Ingen sanger matcher søket/filteret.</div>}
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.1fr_1.9fr]">
        <div className="rounded-2xl border-2 border-slate-300 bg-white p-5 shadow-sm"><div className="text-xs font-black uppercase tracking-wider text-slate-700">Connections</div><h2 className="mt-1 text-xl font-black text-slate-950">Kanalstatus</h2><div className="mt-4 space-y-2">{data.channels.length ? data.channels.map((c) => <div key={c.id} className="rounded-xl border-2 border-slate-300 bg-slate-50 p-3"><div className="font-black text-slate-950">{c.platform}</div><div className="text-xs font-semibold text-slate-700">{c.display_name}</div></div>) : <div className="text-sm font-semibold text-slate-700">Ingen aktive kanaler funnet.</div>}</div><Link href="/connections" className="mt-4 inline-block rounded-lg bg-slate-950 px-3 py-2 text-xs font-black text-white">Administrer kanaler</Link></div>
        <div className="rounded-2xl border-2 border-slate-300 bg-white p-5 shadow-sm"><div className="text-xs font-black uppercase tracking-wider text-slate-700">Ansvarsdeling</div><h2 className="mt-1 text-xl font-black text-slate-950">Hvordan systemet jobber</h2><div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{[["1","Create","Legg inn sang, MP3, artwork og publisering i Re-Master Admin."],["2","Detect","RealtyFlow leser samme Supabase og oppdager nye/publiserte sanger."],["3","Grow","Nexus følger promotion, metadata og relevante playlists."],["4","Learn","Effekten måles og brukes til bedre neste tiltak." ]].map(([n,t,x]) => <div key={n} className="rounded-xl border-2 border-slate-300 bg-slate-50 p-4"><div className="text-xs font-black text-pink-800">{n}</div><div className="mt-1 font-black text-slate-950">{t}</div><div className="mt-2 text-xs font-semibold leading-5 text-slate-700">{x}</div></div>)}</div></div>
      </section>

      <div className="rounded-xl border-2 border-emerald-300 bg-emerald-100 p-4 text-sm font-semibold text-emerald-950"><b>Source of truth:</b> {data.safety.sourceOfTruth || "Re-Master Admin → Supabase → RealtyFlow/Nexus"}. RealtyFlow dupliserer ikke publiseringskontrollene.</div>
    </>}
  </div>;
}
