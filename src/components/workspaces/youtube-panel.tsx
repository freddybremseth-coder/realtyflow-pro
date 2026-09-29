"use client";

import { useEffect, useState } from "react";
import { ExternalLink, RefreshCw, Send, Youtube } from "lucide-react";

type YoutubeDelivery = {
  state: string;
  externalId: string | null;
  externalUrl: string | null;
  error: string | null;
  updatedAt: string | null;
};
type Reel = {
  id: string;
  title: string;
  durationSeconds: number;
  caption: string;
  createdAt: string;
  updatedAt: string;
  videoUrl: string | null;
  youtubeDelivery: YoutubeDelivery | null;
};
type Channel = {
  connected: boolean;
  account: string | null;
  channelId: string | null;
  subscriberCount: number | string;
  viewCount: number | string;
  videoCount: number | string;
  reason: string;
};
type Video = {
  id?: string;
  title?: string;
  viewCount?: number | string;
  likeCount?: number | string;
  publishedAt?: string;
  thumbnailUrl?: string;
};
type Payload = {
  channel: Channel;
  videos: Video[];
  reels: Reel[];
};

function numberLabel(value: number | string) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed.toLocaleString("nb-NO") : "0";
}

export function WorkspaceYoutubePanel({
  brandKey,
  canPublish,
}: {
  brandKey: string;
  canPublish: boolean;
}) {
  const [payload, setPayload] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [publishing, setPublishing] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/workspaces/${encodeURIComponent(brandKey)}/youtube`, { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error?.message || body?.error?.code || "Kunne ikke hente YouTube Studio.");
      setPayload(body);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Kunne ikke hente YouTube Studio.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [brandKey]);

  async function publish(reel: Reel) {
    if (!canPublish || publishing || reel.youtubeDelivery) return;
    if (!window.confirm(`Publisere «${reel.title}» offentlig som YouTube Short på Zen Eco Homes nå?`)) return;
    setPublishing(reel.id);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/workspaces/${encodeURIComponent(brandKey)}/youtube`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId: reel.id }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error?.message || body?.error?.code || "YouTube-publisering kunne ikke bekreftes.");
      setNotice(`Publisert på ${body.account || "Zen Eco Homes"}.`);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "YouTube-publisering kunne ikke bekreftes.");
      await load();
    } finally {
      setPublishing("");
    }
  }

  if (loading && !payload) return <p className="text-sm text-slate-400">Laster YouTube Studio…</p>;

  return <div className="space-y-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h3 className="flex items-center gap-2 text-lg font-semibold"><Youtube size={20}/> YouTube Studio</h3>
        <p className="mt-1 text-sm text-slate-400">
          Se Zen-kanalen og publiser en ferdig, forhåndsvist Reel som YouTube Short. Kanaloppsett og OAuth forblir owner-styrt.
        </p>
      </div>
      <button type="button" onClick={() => void load()} disabled={loading}
        className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-xs">
        <RefreshCw size={14}/> Oppdater
      </button>
    </div>

    {error && <p role="alert" className="rounded-lg border border-amber-800 bg-amber-950/25 p-3 text-sm text-amber-200">{error}</p>}
    {notice && <p role="status" className="rounded-lg border border-emerald-800 bg-emerald-950/25 p-3 text-sm text-emerald-200">{notice}</p>}

    {payload?.channel.connected ? <section className="rounded-xl border border-red-900/50 bg-red-950/10 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wider text-red-300">Verifisert kanal</p>
          <h4 className="mt-1 font-semibold">{payload.channel.account || "Zen Eco Homes"}</h4>
        </div>
        <div className="flex gap-5 text-right text-xs text-slate-400">
          <div><strong className="block text-base text-slate-100">{numberLabel(payload.channel.subscriberCount)}</strong>abonnenter</div>
          <div><strong className="block text-base text-slate-100">{numberLabel(payload.channel.videoCount)}</strong>videoer</div>
          <div><strong className="block text-base text-slate-100">{numberLabel(payload.channel.viewCount)}</strong>visninger</div>
        </div>
      </div>
    </section> : <section className="rounded-xl border border-amber-800 bg-amber-950/20 p-4">
      <h4 className="font-semibold text-amber-100">YouTube er ikke klar</h4>
      <p className="mt-1 text-sm text-amber-200/80">{payload?.channel.reason || "Zen-kanalen må kobles til av owner før publisering."}</p>
    </section>}

    <section>
      <h4 className="font-semibold">Ferdige Zen Reels · klare for Shorts</h4>
      <p className="mt-1 text-xs text-slate-500">Bare ferdigrendrede videoer fra Zen-workspacet vises her. Publisering skjer aldri automatisk.</p>
      <div className="mt-3 grid gap-4 lg:grid-cols-2">
        {(payload?.reels || []).map(reel => {
          const delivery = reel.youtubeDelivery;
          const published = delivery?.state === "published";
          const needsReview = delivery?.state === "needs_review" || delivery?.state === "publishing";
          return <article key={reel.id} className="overflow-hidden rounded-xl border border-slate-800 bg-slate-950/50">
            {reel.videoUrl
              ? <video src={reel.videoUrl} controls preload="metadata" className="aspect-[9/16] max-h-[480px] w-full bg-black object-contain"/>
              : <div className="flex aspect-video items-center justify-center bg-black text-sm text-slate-500">Forhåndsvisning mangler</div>}
            <div className="space-y-3 p-4">
              <div>
                <h5 className="font-medium">{reel.title}</h5>
                <p className="mt-1 line-clamp-2 text-xs text-slate-500">{reel.caption}</p>
              </div>
              {published && <div className="flex items-center justify-between gap-3 rounded-lg border border-emerald-900 bg-emerald-950/20 p-3 text-xs text-emerald-200">
                <span>Publisert på YouTube</span>
                {delivery?.externalUrl && <a href={delivery.externalUrl} target="_blank" rel="noreferrer"
                  className="inline-flex items-center gap-1 underline">Åpne <ExternalLink size={12}/></a>}
              </div>}
              {needsReview && <p className="rounded-lg border border-amber-800 bg-amber-950/20 p-3 text-xs text-amber-200">
                Et tidligere publiseringsforsøk må kontrolleres før nytt forsøk. RealtyFlow forsøker ikke automatisk igjen.
              </p>}
              {delivery?.error && !published && <p className="text-xs text-amber-300">{delivery.error}</p>}
              {!delivery && canPublish && <button type="button"
                disabled={!payload?.channel.connected || Boolean(publishing) || !reel.videoUrl}
                onClick={() => void publish(reel)}
                className="inline-flex items-center gap-2 rounded-lg border border-red-800 px-3 py-2 text-xs text-red-200 disabled:opacity-40">
                <Send size={13}/>{publishing === reel.id ? "Publiserer…" : "Publiser som YouTube Short"}
              </button>}
            </div>
          </article>;
        })}
        {!loading && (payload?.reels || []).length === 0 &&
          <p className="rounded-xl border border-dashed border-slate-800 p-5 text-sm text-slate-500">Ingen ferdige Zen Reels er klare ennå.</p>}
      </div>
    </section>

    {(payload?.videos || []).length > 0 && <section>
      <h4 className="font-semibold">Siste videoer på kanalen</h4>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        {(payload?.videos || []).slice(0, 8).map((video, index) => <article key={video.id || index}
          className="flex gap-3 rounded-xl border border-slate-800 bg-slate-950/40 p-3">
          {video.thumbnailUrl
            ? <img src={video.thumbnailUrl} alt="" className="h-16 w-28 rounded-md object-cover"/>
            : <div className="h-16 w-28 rounded-md bg-slate-900"/>}
          <div className="min-w-0">
            <p className="line-clamp-2 text-sm font-medium">{video.title || "YouTube-video"}</p>
            <p className="mt-1 text-xs text-slate-500">{numberLabel(video.viewCount || 0)} visninger</p>
          </div>
        </article>)}
      </div>
    </section>}
  </div>;
}
