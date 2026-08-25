"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Payload = {
  summary: { songs: number; publishedToYoutube: number; pendingYoutube: number; promotionReady: number; promotionDrafted: number; connectedChannels: number; publications: number };
  channels: Array<{ id: string; platform: string; display_name: string }>;
  recent: Array<{ id: string; title: string; artist: string; genre: string | null; mood: string | null; status: string; youtubeUrl: string | null; imageUrl: string | null; legacyBrand: string }>;
  safety: { canonicalBrand: string; legacyBrandReads: string[]; legacyPipelinePreserved: boolean; automaticPublishingChanged: boolean; note: string };
};

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

  return <div className="mx-auto max-w-[1500px] space-y-6 p-6">
    <header className="rounded-3xl border border-pink-900/30 bg-gradient-to-br from-slate-950 via-slate-900 to-pink-950 p-7 text-white shadow-xl">
      <div className="text-xs font-black uppercase tracking-[0.24em] text-pink-300">Nexus OS · Creator Growth</div>
      <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
        <div><h1 className="text-3xl font-black">Re-Master Freddy</h1><p className="mt-2 max-w-4xl text-sm leading-6 text-slate-300">Én brukerflate for musikkatalog, YouTube-status og sosial promotering. Neural Beat behandles som legacy/pipeline-navn under Re-Master Freddy, ikke som et separat brand.</p></div>
        <div className="flex gap-2"><Link href="/nexus-os" className="rounded-xl border border-white/20 px-4 py-2 text-sm font-bold">Nexus</Link><Link href="/connections" className="rounded-xl border border-white/20 px-4 py-2 text-sm font-bold">Connections</Link><button onClick={load} disabled={loading} className="rounded-xl bg-pink-300 px-4 py-2 text-sm font-black text-slate-950 disabled:opacity-60">{loading ? "Oppdaterer…" : "Oppdater"}</button></div>
      </div>
    </header>

    {error && <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{error}</div>}

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
        ].map(([label, value]) => <div key={String(label)} className="rounded-xl border border-slate-200 bg-white p-4"><div className="text-[10px] font-black text-slate-500">{label}</div><div className="mt-1 text-2xl font-black">{value}</div></div>)}
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.1fr_1.9fr]">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="text-xs font-black uppercase tracking-wider text-slate-400">Connections</div><h2 className="mt-1 text-xl font-black">Kanalstatus</h2>
          <div className="mt-4 space-y-2">{data.channels.length ? data.channels.map(c => <div key={c.id} className="rounded-xl border border-slate-200 p-3"><div className="font-black">{c.platform}</div><div className="text-xs text-slate-500">{c.display_name}</div></div>) : <div className="text-sm text-slate-500">Ingen aktive kanaler funnet.</div>}</div>
          <Link href="/connections" className="mt-4 inline-block rounded-lg bg-slate-900 px-3 py-2 text-xs font-black text-white">Administrer kanaler</Link>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="text-xs font-black uppercase tracking-wider text-slate-400">Promotion pipeline</div><h2 className="mt-1 text-xl font-black">Hvordan Re-Master brukes nå</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[["1","Publish","Eksisterende Re-Master/Neural Beat-pipeline publiserer sangen til YouTube."],["2","Source","YouTube-publisert sang blir promotion-ready source i Nexus."],["3","Promote","Instagram/Facebook-utkast kan lages fra sang, artwork og YouTube-link."],["4","Learn","Views, clicks, follows og creative-varianter kan mates tilbake til Growth OS."]].map(([n,t,x]) => <div key={n} className="rounded-xl border border-slate-200 p-4"><div className="text-xs font-black text-pink-700">{n}</div><div className="mt-1 font-black">{t}</div><div className="mt-2 text-xs leading-5 text-slate-500">{x}</div></div>)}
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 p-5"><h2 className="text-xl font-black">Siste sanger</h2><p className="mt-1 text-sm text-slate-500">Kanonisk lesning fra RealtyFlow `songs`, inkludert legacy Neural Beat-records.</p></div>
        <div className="divide-y divide-slate-100">{data.recent.map(song => <article key={song.id} className="grid gap-3 p-4 sm:grid-cols-[72px_1fr_auto] sm:items-center">{song.imageUrl ? <img src={song.imageUrl} alt="" className="h-14 w-14 rounded-lg object-cover" /> : <div className="flex h-14 w-14 items-center justify-center rounded-lg bg-slate-100 text-xs font-black text-slate-400">MUSIC</div>}<div><div className="font-black text-slate-900">{song.title}</div><div className="text-xs text-slate-500">{song.artist} · {song.genre || "genre ukjent"} · {song.status}</div></div><div>{song.youtubeUrl ? <a href={song.youtubeUrl} target="_blank" rel="noreferrer" className="rounded-lg bg-red-600 px-3 py-2 text-xs font-black text-white">YouTube</a> : <span className="rounded-full bg-amber-100 px-2 py-1 text-[10px] font-black text-amber-800">Venter YouTube</span>}</div></article>)}</div>
      </section>

      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900"><b>Migration safety:</b> eksisterende YouTube-autopublisering er ikke endret. Legacy `neuralbeat`/`neural-beat` leses fortsatt for kompatibilitet, men nye Growth OS-kilder bruker canonical brand `remasterfreddy`.</div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600"><b>Legacy pipeline:</b> den gamle Neural Beat-flaten beholdes foreløpig kun som teknisk kompatibilitetsflate. <Link href="/neural-beat" className="font-black text-slate-900">Åpne legacy pipeline</Link></div>
    </>}
  </div>;
}
