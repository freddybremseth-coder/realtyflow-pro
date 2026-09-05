"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

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

type Payload = {
  summary: { songs: number; publishedToYoutube: number; pendingYoutube: number; promotionReady: number; promotionDrafted: number; connectedChannels: number; publications: number };
  channels: Array<{ id: string; platform: string; display_name: string }>;
  recent: Array<{ id: string; title: string; artist: string; genre: string | null; mood: string | null; status: string; youtubeUrl: string | null; imageUrl: string | null; legacyBrand: string }>;
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
  safety: { canonicalBrand: string; legacyBrandReads: string[]; legacyPipelinePreserved: boolean; automaticPublishingChanged: boolean; note: string };
};

function statusTone(status: Payload["growth"]["status"]) {
  switch (status) {
    case "ACTIVE": return "border-emerald-400/40 bg-emerald-400/10 text-emerald-100";
    case "LEARNING_GUARDED": return "border-amber-400/40 bg-amber-400/10 text-amber-100";
    case "READY_NOT_ENABLED": return "border-sky-400/40 bg-sky-400/10 text-sky-100";
    default: return "border-rose-400/40 bg-rose-400/10 text-rose-100";
  }
}

function learningTone(mode: Learning["mode"]) {
  switch (mode) {
    case "FAVOR": return "bg-emerald-100 text-emerald-900 ring-emerald-300";
    case "SUPPRESS": return "bg-rose-100 text-rose-900 ring-rose-300";
    case "NEUTRAL": return "bg-slate-200 text-slate-900 ring-slate-300";
    default: return "bg-sky-100 text-sky-900 ring-sky-300";
  }
}

export default function RemasterFreddyPage() {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true); setError("");
    try {
      const res = await fetch("/api/remaster/overview", { cache: "no-store", credentials: "same-origin" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || `Re-Master overview feilet (${res.status})`);
      setData(body as Payload);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, []);

  return <div className="mx-auto max-w-[1500px] space-y-6 p-6 text-slate-950">
    <header className="rounded-3xl border border-pink-700/40 bg-gradient-to-br from-slate-950 via-slate-900 to-pink-950 p-7 text-white shadow-xl">
      <div className="text-xs font-black uppercase tracking-[0.24em] text-pink-300">Nexus OS · Creator Growth</div>
      <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
        <div><h1 className="text-3xl font-black text-white">Re-Master Freddy</h1><p className="mt-2 max-w-4xl text-sm leading-6 text-slate-200">Én brukerflate for musikkatalog, YouTube-status og sosial promotering. Neural Beat behandles som legacy/pipeline-navn under Re-Master Freddy, ikke som et separat brand.</p></div>
        <div className="flex gap-2"><Link href="/nexus-os" className="rounded-xl border border-white/30 bg-white/5 px-4 py-2 text-sm font-bold text-white hover:bg-white/10">Nexus</Link><Link href="/connections" className="rounded-xl border border-white/30 bg-white/5 px-4 py-2 text-sm font-bold text-white hover:bg-white/10">Connections</Link><button onClick={load} disabled={loading} className="rounded-xl bg-pink-300 px-4 py-2 text-sm font-black text-slate-950 hover:bg-pink-200 disabled:opacity-60">{loading ? "Oppdaterer…" : "Oppdater"}</button></div>
      </div>
    </header>

    {error && <div className="rounded-xl border border-rose-300 bg-rose-100 p-4 text-sm font-semibold text-rose-950">{error}</div>}

    {data && <>
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
        {[
          ["SONGS", data.summary.songs],
          ["YOUTUBE LIVE", data.summary.publishedToYoutube],
          ["PENDING YT", data.summary.pendingYoutube],
          ["PROMO READY", data.summary.promotionReady],
          ["PROMO DRAFTED", data.summary.promotionDrafted],
          ["CHANNELS", data.summary.connectedChannels],
          ["PUBLICATIONS", data.summary.publications],
        ].map(([label, value]) => <div key={String(label)} className="rounded-xl border border-slate-300 bg-white p-4 shadow-sm"><div className="text-[10px] font-black tracking-wide text-slate-600">{label}</div><div className="mt-1 text-2xl font-black text-slate-950">{value}</div></div>)}
      </section>

      <section className="rounded-2xl border border-slate-700 bg-slate-950 p-5 text-white shadow-lg">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-xs font-black uppercase tracking-[0.18em] text-pink-300">Growth Health</div>
            <h2 className="mt-1 text-2xl font-black text-white">Autonom lyttervekst</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-200">Systemet måler, forbedrer og lærer fra Re-Master-videoer. Negative mønstre kan automatisk undertrykkes før de gjentas.</p>
          </div>
          <div className={`rounded-full border px-4 py-2 text-xs font-black tracking-wide ${statusTone(data.growth.status)}`}>{data.growth.status.replaceAll("_", " ")}</div>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-xl border border-slate-700 bg-slate-900 p-4"><div className="text-[10px] font-black uppercase tracking-wider text-slate-400">Autopilot</div><div className="mt-1 text-lg font-black text-white">{data.growth.autopilotEnabled ? "Aktiv" : "Av"}</div><div className="mt-1 text-xs text-slate-300">{data.growth.autopilotEnabled ? "Daglig growth-loop er tillatt." : "Miljøvariabelen er ikke aktiv i runtime."}</div></div>
          <div className="rounded-xl border border-slate-700 bg-slate-900 p-4"><div className="text-[10px] font-black uppercase tracking-wider text-slate-400">YouTube</div><div className="mt-1 text-lg font-black text-white">{data.growth.youtube.connected ? "Connected" : "Ikke tilkoblet"}</div><div className="mt-1 text-xs text-slate-300">{data.growth.youtube.channel?.title || data.growth.youtube.message || "Ingen kanalinfo"}</div></div>
          <div className="rounded-xl border border-slate-700 bg-slate-900 p-4"><div className="text-[10px] font-black uppercase tracking-wider text-slate-400">Metadata learning</div><span className={`mt-2 inline-flex rounded-full px-2.5 py-1 text-xs font-black ring-1 ${learningTone(data.growth.learning.metadata.mode)}`}>{data.growth.learning.metadata.mode}</span><div className="mt-2 text-xs text-slate-300">{data.growth.learning.metadata.measured} målt · {data.growth.learning.metadata.averageLiftPct ?? "–"}% snitt-lift</div></div>
          <div className="rounded-xl border border-slate-700 bg-slate-900 p-4"><div className="text-[10px] font-black uppercase tracking-wider text-slate-400">Playlist learning</div><span className={`mt-2 inline-flex rounded-full px-2.5 py-1 text-xs font-black ring-1 ${learningTone(data.growth.learning.playlist.mode)}`}>{data.growth.learning.playlist.mode}</span><div className="mt-2 text-xs text-slate-300">{data.growth.learning.playlist.measured} målt · {data.growth.learning.playlist.averageLiftPct ?? "–"}% snitt-lift</div></div>
        </div>

        <div className="mt-4 grid gap-3 lg:grid-cols-[1.3fr_1fr]">
          <div className="rounded-xl border border-slate-700 bg-slate-900 p-4">
            <div className="text-xs font-black uppercase tracking-wider text-slate-300">Læringsstatus</div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {[data.growth.learning.metadata, data.growth.learning.playlist].map(item => <div key={item.actionType} className="rounded-lg border border-slate-700 bg-slate-950/70 p-3"><div className="font-black text-white">{item.actionType === "update_metadata" ? "Metadata" : "Playlists"}</div><div className="mt-1 text-xs leading-5 text-slate-300">{item.rationale}</div><div className="mt-2 text-[11px] font-semibold text-slate-400">+ {item.positive} positive · {item.neutral} neutral · {item.negative} negative</div></div>)}
            </div>
          </div>
          <div className="rounded-xl border border-slate-700 bg-slate-900 p-4">
            <div className="text-xs font-black uppercase tracking-wider text-slate-300">Guardrails</div>
            <div className="mt-3 space-y-2 text-sm text-slate-100"><div className="flex justify-between gap-3"><span>Auto title changes</span><b className="text-emerald-300">OFF</b></div><div className="flex justify-between gap-3"><span>Auto thumbnail changes</span><b className="text-emerald-300">OFF</b></div><div className="flex justify-between gap-3"><span>Evidence before bias</span><b>{data.growth.guardrails.evidenceRequiredBeforeBias}</b></div><div className="flex justify-between gap-3"><span>Feedback window</span><b>{data.growth.guardrails.feedbackObservationDays} dager</b></div></div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.1fr_1.9fr]">
        <div className="rounded-2xl border border-slate-300 bg-white p-5 shadow-sm">
          <div className="text-xs font-black uppercase tracking-wider text-slate-600">Connections</div><h2 className="mt-1 text-xl font-black text-slate-950">Kanalstatus</h2>
          <div className="mt-4 space-y-2">{data.channels.length ? data.channels.map(c => <div key={c.id} className="rounded-xl border border-slate-300 bg-slate-50 p-3"><div className="font-black text-slate-950">{c.platform}</div><div className="text-xs font-medium text-slate-700">{c.display_name}</div></div>) : <div className="text-sm font-medium text-slate-700">Ingen aktive kanaler funnet.</div>}</div>
          <Link href="/connections" className="mt-4 inline-block rounded-lg bg-slate-950 px-3 py-2 text-xs font-black text-white hover:bg-slate-800">Administrer kanaler</Link>
        </div>

        <div className="rounded-2xl border border-slate-300 bg-white p-5 shadow-sm">
          <div className="text-xs font-black uppercase tracking-wider text-slate-600">Promotion pipeline</div><h2 className="mt-1 text-xl font-black text-slate-950">Hvordan Re-Master brukes nå</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[["1","Publish","Eksisterende Re-Master/Neural Beat-pipeline publiserer sangen til YouTube."],["2","Source","YouTube-publisert sang blir promotion-ready source i Nexus."],["3","Promote","Instagram/Facebook-utkast kan lages fra sang, artwork og YouTube-link."],["4","Learn","Views, clicks, follows og creative-varianter kan mates tilbake til Growth OS."]].map(([n,t,x]) => <div key={n} className="rounded-xl border border-slate-300 bg-slate-50 p-4"><div className="text-xs font-black text-pink-800">{n}</div><div className="mt-1 font-black text-slate-950">{t}</div><div className="mt-2 text-xs font-medium leading-5 text-slate-700">{x}</div></div>)}
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-300 bg-white shadow-sm">
        <div className="border-b border-slate-300 p-5"><h2 className="text-xl font-black text-slate-950">Siste sanger</h2><p className="mt-1 text-sm font-medium text-slate-700">Kanonisk lesning fra RealtyFlow `songs`, inkludert legacy Neural Beat-records.</p></div>
        <div className="divide-y divide-slate-200">{data.recent.map(song => <article key={song.id} className="grid gap-3 p-4 sm:grid-cols-[72px_1fr_auto] sm:items-center">{song.imageUrl ? <img src={song.imageUrl} alt="" className="h-14 w-14 rounded-lg border border-slate-200 object-cover" /> : <div className="flex h-14 w-14 items-center justify-center rounded-lg bg-slate-200 text-xs font-black text-slate-600">MUSIC</div>}<div><div className="font-black text-slate-950">{song.title}</div><div className="text-xs font-medium text-slate-700">{song.artist} · {song.genre || "genre ukjent"} · {song.status}</div></div><div>{song.youtubeUrl ? <a href={song.youtubeUrl} target="_blank" rel="noreferrer" className="rounded-lg bg-red-600 px-3 py-2 text-xs font-black text-white hover:bg-red-700">YouTube</a> : <span className="rounded-full bg-amber-200 px-2 py-1 text-[10px] font-black text-amber-950">Venter YouTube</span>}</div></article>)}</div>
      </section>

      <div className="rounded-xl border border-emerald-300 bg-emerald-100 p-4 text-sm font-medium text-emerald-950"><b>Migration safety:</b> eksisterende YouTube-autopublisering er ikke endret. Legacy `neuralbeat`/`neural-beat` leses fortsatt for kompatibilitet, men nye Growth OS-kilder bruker canonical brand `remasterfreddy`.</div>

      <div className="rounded-xl border border-slate-300 bg-white p-4 text-sm font-medium text-slate-800"><b>Legacy pipeline:</b> den gamle Neural Beat-flaten beholdes foreløpig kun som teknisk kompatibilitetsflate. <Link href="/neural-beat" className="font-black text-slate-950 underline underline-offset-2">Åpne legacy pipeline</Link></div>
    </>}
  </div>;
}
