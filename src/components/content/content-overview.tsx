"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clapperboard,
  FileText,
  Image,
  Loader2,
  RefreshCw,
  Sparkles,
  Youtube,
} from "lucide-react";

type MediaOverview = {
  generatedLast30Days: number;
  imagesGenerated: number;
  videosGenerated: number;
  activeJobs: number;
  failedJobs: number;
  sentToContentHub: number;
  mostUsedBrands: Array<{ brandId: string; count: number }>;
  recentProjects: Array<{ id: string; name: string; project_type: string; brand_id: string; status: string; updated_at: string }>;
  recentAssets: Array<{ id: string; title: string; media_type: string; brand_id: string; provider: string; thumbnail_url?: string | null; public_url?: string | null; created_at: string }>;
};

type ApiResponse = { overview?: MediaOverview; error?: string };

const workflow = [
  {
    title: "Lag",
    detail: "Content Studio for tekst og plan. Media Studio for bilde, video og lyd.",
    href: "/content-studio",
    icon: Sparkles,
  },
  {
    title: "Produser media",
    detail: "Media Studio er den kanoniske asset- og jobbmotoren. Re-Master brukes som spesialisert render-/Reels-motor.",
    href: "/media-studio",
    icon: Clapperboard,
  },
  {
    title: "Samle & godkjenn",
    detail: "Content Hub samler ferdige assets og utkast før publisering.",
    href: "/content-hub",
    icon: FileText,
  },
  {
    title: "Distribuer",
    detail: "Posts, Reels, YouTube og andre kanaler bruker samme innhold videre.",
    href: "/posts",
    icon: Youtube,
  },
];

export function ContentOverview() {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    fetch("/api/media/overview", { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body?.error || "Kunne ikke hente Media Studio-status");
        return body as ApiResponse;
      })
      .then(setData)
      .catch((error) => setData({ error: error instanceof Error ? error.message : String(error) }))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  if (loading) {
    return (
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 text-slate-400">
        <Loader2 className="mr-2 inline animate-spin" size={17} />Laster Content…
      </div>
    );
  }

  const overview = data?.overview;

  return (
    <section className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-slate-100">Content · produksjonsflyt</h2>
          <p className="mt-1 max-w-3xl text-sm text-slate-500">
            Én flyt fra idé til publisert innhold. Existing Media Studio og Content Hub er kjernen; Re-Master leverer spesialisert video/Reels-produksjon.
          </p>
        </div>
        <button onClick={load} className="rounded-xl border border-slate-700 p-2 text-slate-400 hover:bg-slate-800 hover:text-white" aria-label="Oppdater Content">
          <RefreshCw size={16}/>
        </button>
      </div>

      {data?.error && (
        <div className="rounded-xl border border-amber-900/40 bg-amber-950/20 p-4 text-sm text-amber-300">
          Media-status kunne ikke lastes: {data.error}. Inngangene under fungerer fortsatt.
        </div>
      )}

      {overview && (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
          {[
            ["Produksjoner 30d", overview.generatedLast30Days, Sparkles],
            ["Bilder", overview.imagesGenerated, Image],
            ["Video", overview.videosGenerated, Clapperboard],
            ["Aktive jobber", overview.activeJobs, Loader2],
            ["Feilet", overview.failedJobs, AlertTriangle],
            ["Til Content Hub", overview.sentToContentHub, CheckCircle2],
          ].map(([label, value, Icon]) => {
            const CardIcon = Icon as typeof Sparkles;
            return (
              <div key={String(label)} className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
                <CardIcon className="text-cyan-400" size={18}/>
                <p className="mt-3 text-[10px] font-semibold uppercase tracking-wider text-slate-500">{String(label)}</p>
                <p className="mt-1 text-2xl font-bold text-white">{Number(value).toLocaleString("nb-NO")}</p>
              </div>
            );
          })}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {workflow.map(({ title, detail, href, icon: Icon }) => (
          <Link key={title} href={href} className="group rounded-2xl border border-slate-800 bg-slate-950/50 p-5 hover:border-cyan-500/40 hover:bg-slate-900">
            <Icon className="text-cyan-400" size={20}/>
            <h3 className="mt-3 font-semibold text-white">{title}</h3>
            <p className="mt-2 text-sm leading-6 text-slate-400">{detail}</p>
          </Link>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
          <h3 className="font-semibold text-white">Reels & video</h3>
          <p className="mt-2 text-sm leading-6 text-slate-400">
            Re-Master beholdes som produksjonsmotor. RealtyFlow viser enklere brand-avgrensede arbeidsflater for vanlige brukere, mens avansert studio fortsatt finnes for eier.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link href="/remaster-freddy" className="rounded-xl border border-slate-700 px-3 py-2 text-xs font-semibold text-cyan-300 hover:bg-slate-800">Re-Master Studio</Link>
            <Link href="/youtube-studio" className="rounded-xl border border-slate-700 px-3 py-2 text-xs font-semibold text-cyan-300 hover:bg-slate-800">YouTube Studio</Link>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
          <h3 className="font-semibold text-white">Gjenbruk før ny generering</h3>
          <p className="mt-2 text-sm leading-6 text-slate-400">
            Marketing Content Resolver søker allerede Content Hub, Media Studio og annonse-assets før nytt innhold genereres. Denne regelen beholdes som standard for Content.
          </p>
          {overview?.mostUsedBrands?.length ? (
            <div className="mt-4 flex flex-wrap gap-2">
              {overview.mostUsedBrands.map((brand) => (
                <span key={brand.brandId} className="rounded-full border border-slate-700 bg-slate-950 px-3 py-1 text-xs text-slate-300">
                  {brand.brandId} · {brand.count}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
