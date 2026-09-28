"use client";

import { useEffect, useMemo, useState } from "react";
import { FilePlus2, Megaphone, RefreshCw } from "lucide-react";

type Channel = { platform: string; name: string };
type Publication = {
  id: string;
  contentType: string;
  title: string | null;
  description: string | null;
  tags: string[];
  thumbnailUrl: string | null;
  scheduledPlatforms: string[];
  status: string;
  scheduledAt: string | null;
  publishedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  views: number;
  likes: number;
  comments: number;
  shares: number;
};
type MarketingPayload = {
  channels: Channel[];
  publications: Publication[];
  recentSummary: { draft: number; scheduled: number; published: number; failed: number };
};

const platformLabel: Record<string, string> = {
  facebook: "Facebook",
  instagram: "Instagram",
  linkedin: "LinkedIn",
  youtube: "YouTube",
  tiktok: "TikTok",
  pinterest: "Pinterest",
};

export function WorkspaceMarketingPanel({
  brandKey,
  canDraft,
}: {
  brandKey: string;
  canDraft: boolean;
}) {
  const [data, setData] = useState<MarketingPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [platforms, setPlatforms] = useState<string[]>([]);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/workspaces/${encodeURIComponent(brandKey)}/marketing`, {
        cache: "no-store",
      });
      const body = await response.json();
      if (!response.ok) throw new Error(
        response.status === 403
          ? "Du har ikke markedsføringstilgang i dette arbeidsområdet."
          : "Markedsføringsdata kunne ikke hentes.",
      );
      setData({
        channels: Array.isArray(body.channels) ? body.channels : [],
        publications: Array.isArray(body.publications) ? body.publications : [],
        recentSummary: body.recentSummary || { draft: 0, scheduled: 0, published: 0, failed: 0 },
      });
      setPlatforms(current => current.filter(platform =>
        (body.channels || []).some((channel: Channel) => channel.platform === platform)));
    } catch (cause) {
      setData(null);
      setError(cause instanceof Error ? cause.message : "Markedsføringsdata kunne ikke hentes.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [brandKey]);

  const activePlatforms = useMemo(() => new Set(data?.channels.map(channel => channel.platform) || []), [data]);

  async function createDraft() {
    if (!canDraft || !description.trim() || busy) return;
    if (platforms.includes("instagram") && !imageUrl.trim()) {
      setError("Instagram krever et brand-godkjent bilde. Legg inn en bildeadresse fra en synlig eiendom/RealtyFlow-media eller fjern Instagram som målkanal.");
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/workspaces/${encodeURIComponent(brandKey)}/marketing`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim(),
          tags: tags.split(",").map(tag => tag.trim()).filter(Boolean),
          platforms: platforms.filter(platform => activePlatforms.has(platform)),
          imageUrl: imageUrl.trim(),
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(
        body?.error?.code === "CHANNEL_NOT_ACTIVE_FOR_BRAND"
          ? "En valgt kanal er ikke aktiv for denne merkevaren."
          : body?.error?.code === "INSTAGRAM_IMAGE_REQUIRED"
            ? "Instagram krever et brand-godkjent bilde."
            : body?.error?.code === "IMAGE_NOT_APPROVED_FOR_BRAND"
              ? "Bildeadressen er ikke godkjent for denne merkevaren. Bruk bilde fra en synlig eiendom eller RealtyFlow-media."
              : body?.error?.code === "INVALID_DRAFT"
                ? "Kontroller tekst, bildeadresse, tags og valgte kanaler."
              : "Utkastet kunne ikke lagres.",
      );
      setNotice("Utkastet er lagret i Content Hub for denne merkevaren. Ingenting er publisert.");
      setTitle("");
      setDescription("");
      setTags("");
      setImageUrl("");
      setPlatforms([]);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Utkastet kunne ikke lagres.");
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <p className="text-sm text-slate-400">Laster markedsføring…</p>;

  return <section className="space-y-5">
    {error && <p role="alert" className="rounded-xl border border-amber-800 bg-amber-950/30 p-4 text-sm text-amber-200">{error}</p>}
    {notice && <p role="status" className="rounded-xl border border-emerald-800 bg-emerald-950/25 p-4 text-sm text-emerald-200">{notice}</p>}

    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {[
        ["Utkast", data?.recentSummary.draft || 0],
        ["Planlagt", data?.recentSummary.scheduled || 0],
        ["Publisert", data?.recentSummary.published || 0],
        ["Feilet", data?.recentSummary.failed || 0],
      ].map(([label, value]) => <div key={String(label)} className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
        <div className="text-xs text-slate-500">{label}</div>
        <div className="mt-1 text-2xl font-bold">{value}</div>
      </div>)}
    </div>

    <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-semibold"><Megaphone size={19}/> Aktive kanaler</h2>
          <p className="mt-1 text-xs text-slate-400">Kun kanaler som er koblet til denne merkevaren vises.</p>
        </div>
        <button type="button" onClick={() => void load()} className="inline-flex items-center gap-2 text-sm text-cyan-300">
          <RefreshCw size={15}/> Oppdater
        </button>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {(data?.channels || []).map(channel => <span key={channel.platform}
          className="rounded-full border border-emerald-800 bg-emerald-950/25 px-3 py-1.5 text-xs text-emerald-200">
          {platformLabel[channel.platform] || channel.platform} · {channel.name}
        </span>)}
        {!data?.channels.length && <span className="text-sm text-slate-500">Ingen aktive publiseringskanaler er koblet til merkevaren.</span>}
      </div>
    </div>

    {canDraft && <form onSubmit={event => { event.preventDefault(); void createDraft(); }}
      className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
      <h2 className="flex items-center gap-2 text-xl font-semibold"><FilePlus2 size={19}/> Nytt innholdsutkast</h2>
      <p className="mt-1 text-xs text-slate-400">Denne delen lagrer bare utkast. Har du egen publiseringsrettighet, bruker du «Publiser til sosiale medier» etter at utkastet er klart.</p>
      <div className="mt-4 grid gap-3">
        <label className="text-xs text-slate-300">Tittel
          <input value={title} onChange={event => setTitle(event.target.value)} maxLength={200}
            className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
            placeholder="Kort arbeidstittel"/>
        </label>
        <label className="text-xs text-slate-300">Tekst *
          <textarea value={description} onChange={event => setDescription(event.target.value)}
            maxLength={5000} rows={6} required
            className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
            placeholder="Skriv innholdet som skal videre til Content Hub…"/>
        </label>
        <label className="text-xs text-slate-300">Tags
          <input value={tags} onChange={event => setTags(event.target.value)} maxLength={800}
            className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
            placeholder="pinoso, villa, costa blanca"/>
        </label>
        <label className="text-xs text-slate-300">Bildeadresse
          <input type="url" value={imageUrl} onChange={event => setImageUrl(event.target.value)} maxLength={2000}
            className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
            placeholder="https://…"/>
          <span className="mt-1 block text-[11px] text-slate-500">Valgfritt for Facebook. Påkrevd for Instagram. Adressen må finnes på en synlig eiendom eller en godkjent mediefil for denne merkevaren.</span>
        </label>
        <div>
          <div className="text-xs text-slate-300">Målkanaler</div>
          <div className="mt-2 flex flex-wrap gap-3">
            {(data?.channels || []).map(channel => <label key={channel.platform} className="flex items-center gap-2 text-xs text-slate-300">
              <input type="checkbox" checked={platforms.includes(channel.platform)}
                onChange={event => setPlatforms(current => event.target.checked
                  ? Array.from(new Set([...current, channel.platform]))
                  : current.filter(item => item !== channel.platform))}/>
              {platformLabel[channel.platform] || channel.platform}
            </label>)}
            {!data?.channels.length && <span className="text-xs text-slate-500">Utkast kan lagres uten målkanal.</span>}
          </div>
        </div>
      </div>
      <button type="submit" disabled={busy || !description.trim()}
        className="mt-4 rounded-lg bg-cyan-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">
        {busy ? "Lagrer…" : "Lagre utkast"}
      </button>
    </form>}

    <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
      <h2 className="text-xl font-semibold">Nylig innhold</h2>
      <p className="mt-1 text-xs text-slate-400">Maks 60 siste poster/utkast for denne merkevaren. Ingen andre brands vises.</p>
      <div className="mt-4 space-y-3">
        {(data?.publications || []).map(item => <article key={item.id} className="rounded-xl border border-slate-800 bg-slate-950/55 p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h3 className="font-medium">{item.title || "Uten tittel"}</h3>
              <p className="mt-1 line-clamp-3 text-sm text-slate-400">{item.description || "Ingen tekst"}</p>
            </div>
            <span className="rounded-full border border-slate-700 px-2 py-1 text-[11px] uppercase tracking-wide text-slate-300">{item.status}</span>
          </div>
          <div className="mt-3 flex flex-wrap gap-3 text-xs text-slate-500">
            {item.scheduledPlatforms.map(platform => <span key={platform}>{platformLabel[platform] || platform}</span>)}
            {item.status === "published" && <span>{item.views} visninger · {item.likes} liker · {item.comments} kommentarer</span>}
          </div>
        </article>)}
        {!data?.publications.length && <p className="text-sm text-slate-500">Ingen markedsføringsinnhold funnet for merkevaren.</p>}
      </div>
    </div>
  </section>;
}
