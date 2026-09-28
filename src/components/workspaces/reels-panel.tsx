"use client";

import { useEffect, useMemo, useState } from "react";
import { Clapperboard, RefreshCw, Send, Sparkles } from "lucide-react";

type Song = { id: string; title: string; genre: string | null; mood: string | null };
type ChannelState = { platform: "instagram" | "facebook"; connected: boolean; account: string | null; reason: string };
type Delivery = { channel: string; state: string; externalUrl: string | null; error: string | null; updatedAt: string | null };
type Reel = {
  id: string; title: string; durationSeconds: number; songTitle: string | null; channels: string[];
  state: string; caption: string | null; error: string | null; createdBy: string | null;
  createdAt: string; updatedAt: string; videoUrl: string | null; deliveries: Delivery[];
};
type Payload = {
  reels: Reel[];
  songs: Song[];
  channels: { instagram: ChannelState; facebook: ChannelState };
};

const visualOptions = [
  ["mixed", "Blandet"],
  ["villas", "Villaer"],
  ["apartments", "Leiligheter"],
  ["pools", "Basseng"],
  ["sea-views", "Havutsikt"],
  ["interiors", "Interiør"],
] as const;

export function WorkspaceReelsPanel({
  brandKey,
  canCreate,
  canPublish,
}: {
  brandKey: string;
  canCreate: boolean;
  canPublish: boolean;
}) {
  const [payload, setPayload] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [rendering, setRendering] = useState(false);
  const [publishing, setPublishing] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [title, setTitle] = useState("");
  const [songId, setSongId] = useState("");
  const [durationSeconds, setDurationSeconds] = useState(30);
  const [areaQuery, setAreaQuery] = useState("");
  const [visualTypes, setVisualTypes] = useState<string[]>(["mixed"]);
  const [channels, setChannels] = useState<Array<"instagram" | "facebook">>(["instagram", "facebook"]);

  async function load() {
    setLoading(true); setError("");
    try {
      const response = await fetch(`/api/workspaces/${encodeURIComponent(brandKey)}/reels`, { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error?.message || body?.error?.code || "Kunne ikke hente Reels.");
      setPayload(body);
      setSongId(current => current || body.songs?.[0]?.id || "");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Kunne ikke hente Reels.");
    } finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, [brandKey]);

  const connectedChannels = useMemo(() => {
    if (!payload) return [];
    return (["instagram", "facebook"] as const).filter(channel => payload.channels[channel]?.connected);
  }, [payload]);

  useEffect(() => {
    if (!payload) return;
    setChannels(current => {
      const usable = current.filter(channel => payload.channels[channel]?.connected);
      return usable.length ? usable : connectedChannels;
    });
  }, [payload, connectedChannels.join("|")]);

  function toggleVisual(value: string) {
    setVisualTypes(current => {
      if (value === "mixed") return ["mixed"];
      const withoutMixed = current.filter(item => item !== "mixed");
      if (withoutMixed.includes(value)) {
        const next = withoutMixed.filter(item => item !== value);
        return next.length ? next : ["mixed"];
      }
      return [...withoutMixed, value].slice(0, 6);
    });
  }

  function toggleChannel(channel: "instagram" | "facebook") {
    if (!payload?.channels[channel]?.connected) return;
    setChannels(current => current.includes(channel)
      ? (current.length > 1 ? current.filter(item => item !== channel) : current)
      : [...current, channel]);
  }

  async function createReel() {
    if (!canCreate || !title.trim() || !songId || channels.length === 0) return;
    setRendering(true); setError(""); setNotice("");
    try {
      const response = await fetch(`/api/workspaces/${encodeURIComponent(brandKey)}/reels`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          durationSeconds,
          songId,
          channels,
          region: brandKey === "pinosoecolife" ? "inland" : "any",
          areaQuery: areaQuery.trim(),
          visualTypes,
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error?.message || body?.error?.code || "Reelen kunne ikke lages.");
      setNotice("Reelen er ferdig. Se gjennom videoen før du publiserer.");
      setTitle("");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Reelen kunne ikke lages.");
    } finally { setRendering(false); }
  }

  async function publish(reel: Reel, channel: "instagram" | "facebook") {
    if (!canPublish || publishing) return;
    if (!window.confirm(`Publisere «${reel.title}» til ${channel === "instagram" ? "Instagram" : "Facebook"} nå?`)) return;
    setPublishing(reel.id + ":" + channel); setError(""); setNotice("");
    try {
      const response = await fetch(`/api/workspaces/${encodeURIComponent(brandKey)}/reels/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId: reel.id, channel }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error?.message || body?.error?.code || "Publisering kunne ikke bekreftes.");
      setNotice(`Publisert til ${channel === "instagram" ? "Instagram" : "Facebook"} via ${body.account || "verifisert brand-konto"}.`);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Publisering kunne ikke bekreftes.");
      await load();
    } finally { setPublishing(""); }
  }

  if (loading && !payload) return <p className="text-sm text-slate-400">Laster Reels Studio…</p>;

  return <div className="space-y-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h3 className="flex items-center gap-2 text-lg font-semibold"><Clapperboard size={19}/> Reels Studio</h3>
        <p className="mt-1 text-sm text-slate-400">
          Lag en ferdig Reel her. Re-Master renderer videoen i bakgrunnen, mens RealtyFlow låser bilder og publisering til denne merkevaren.
        </p>
      </div>
      <button type="button" onClick={() => void load()} disabled={loading}
        className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-xs">
        <RefreshCw size={14}/> Oppdater
      </button>
    </div>

    {error && <p role="alert" className="rounded-lg border border-amber-800 bg-amber-950/25 p-3 text-sm text-amber-200">{error}</p>}
    {notice && <p role="status" className="rounded-lg border border-emerald-800 bg-emerald-950/25 p-3 text-sm text-emerald-200">{notice}</p>}

    {canCreate && <section className="rounded-xl border border-cyan-900/60 bg-cyan-950/10 p-4">
      <div className="flex items-center gap-2">
        <Sparkles size={17} className="text-cyan-300"/>
        <h4 className="font-semibold">Lag ny Reel</h4>
      </div>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <label className="text-xs text-slate-300">Tittel
          <input value={title} onChange={event => setTitle(event.target.value)} maxLength={100}
            placeholder={brandKey === "zeneco" ? "Mediterranean living in Altea" : "Build your home in inland Alicante"}
            className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm"/>
        </label>
        <label className="text-xs text-slate-300">Musikk
          <select value={songId} onChange={event => setSongId(event.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm">
            <option value="">Velg Re-Master-låt</option>
            {(payload?.songs || []).map(song => <option key={song.id} value={song.id}>
              {song.title}{song.mood ? ` · ${song.mood}` : ""}
            </option>)}
          </select>
        </label>
        <label className="text-xs text-slate-300">Lengde
          <select value={durationSeconds} onChange={event => setDurationSeconds(Number(event.target.value))}
            className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm">
            {[15,20,30,45,60].map(seconds => <option key={seconds} value={seconds}>{seconds} sekunder</option>)}
          </select>
        </label>
        <label className="text-xs text-slate-300">Område <span className="text-slate-500">(valgfritt)</span>
          <input value={areaQuery} onChange={event => setAreaQuery(event.target.value)} maxLength={80}
            placeholder={brandKey === "zeneco" ? "Altea, Finestrat, Villajoyosa…" : "Pinoso, Aspe, Biar…"}
            className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm"/>
        </label>
      </div>

      <div className="mt-4">
        <p className="text-xs font-medium text-slate-300">Hva skal vises?</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {visualOptions.map(([value, label]) => <button type="button" key={value} onClick={() => toggleVisual(value)}
            className={`rounded-full border px-3 py-1.5 text-xs ${visualTypes.includes(value) ? "border-cyan-500 bg-cyan-950/40 text-cyan-200" : "border-slate-700 text-slate-400"}`}>
            {label}
          </button>)}
        </div>
      </div>

      <div className="mt-4">
        <p className="text-xs font-medium text-slate-300">Klargjør for</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {(["instagram", "facebook"] as const).map(channel => {
            const state = payload?.channels[channel];
            const checked = channels.includes(channel);
            return <button type="button" key={channel} disabled={!state?.connected} onClick={() => toggleChannel(channel)}
              className={`rounded-lg border px-3 py-2 text-xs disabled:opacity-40 ${checked ? "border-cyan-500 bg-cyan-950/40 text-cyan-200" : "border-slate-700 text-slate-400"}`}>
              {channel === "instagram" ? "Instagram" : "Facebook"} · {state?.connected ? state.account || "tilkoblet" : "ikke klar"}
            </button>;
          })}
        </div>
      </div>

      <button type="button" onClick={() => void createReel()}
        disabled={rendering || !title.trim() || !songId || channels.length === 0}
        className="mt-5 rounded-lg bg-cyan-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40">
        {rendering ? "Re-Master lager video…" : "Lag Reel"}
      </button>
      <p className="mt-2 text-[11px] text-slate-500">Ingen Reel publiseres automatisk her. Videoen må først bli ferdig og kan forhåndsvises nedenfor.</p>
    </section>}

    <section>
      <h4 className="font-semibold">Siste Reels</h4>
      <div className="mt-3 grid gap-4 lg:grid-cols-2">
        {(payload?.reels || []).map(reel => {
          const delivery = new Map(reel.deliveries.map(item => [item.channel, item]));
          return <article key={reel.id} className="overflow-hidden rounded-xl border border-slate-800 bg-slate-950/50">
            {reel.videoUrl
              ? <video src={reel.videoUrl} controls preload="metadata" className="aspect-[9/16] max-h-[520px] w-full bg-black object-contain"/>
              : <div className="flex aspect-video items-center justify-center bg-slate-950 text-sm text-slate-500">
                  {reel.state === "failed" ? "Rendering feilet" : "Videoen behandles"}
                </div>}
            <div className="space-y-2 p-4">
              <div className="flex items-start justify-between gap-3">
                <div><h5 className="font-medium">{reel.title}</h5>
                  <p className="text-xs text-slate-500">{reel.durationSeconds}s · {reel.songTitle || "Re-Master"}</p></div>
                <span className={`rounded-full border px-2 py-0.5 text-[10px] ${reel.state === "ready" ? "border-emerald-700 text-emerald-300" : reel.state === "failed" ? "border-rose-700 text-rose-300" : "border-slate-700 text-slate-400"}`}>
                  {reel.state === "ready" ? "Klar" : reel.state === "failed" ? "Feilet" : "Lager"}
                </span>
              </div>
              {reel.caption && <p className="line-clamp-3 text-xs text-slate-400">{reel.caption}</p>}
              {reel.error && <p className="text-xs text-amber-300">{reel.error}</p>}
              {reel.state === "ready" && canPublish && <div className="flex flex-wrap gap-2 pt-1">
                {(["instagram", "facebook"] as const).filter(channel => reel.channels.includes(channel)).map(channel => {
                  const existing = delivery.get(channel);
                  const published = existing?.state === "published";
                  return <button type="button" key={channel} disabled={Boolean(publishing) || published || !payload?.channels[channel]?.connected}
                    onClick={() => void publish(reel, channel)}
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-700 px-3 py-2 text-xs text-cyan-200 disabled:opacity-40">
                    <Send size={13}/>{published ? "Publisert" : publishing === reel.id + ":" + channel ? "Publiserer…" : `Publiser til ${channel === "instagram" ? "Instagram" : "Facebook"}`}
                  </button>;
                })}
              </div>}
              {reel.deliveries.some(item => item.state === "needs_review") &&
                <p className="text-xs text-amber-300">Et publiseringsforsøk må kontrolleres før nytt forsøk.</p>}
            </div>
          </article>;
        })}
        {!loading && (payload?.reels || []).length === 0 &&
          <p className="rounded-xl border border-dashed border-slate-800 p-5 text-sm text-slate-500">Ingen Reels laget for denne merkevaren ennå.</p>}
      </div>
    </section>
  </div>;
}
