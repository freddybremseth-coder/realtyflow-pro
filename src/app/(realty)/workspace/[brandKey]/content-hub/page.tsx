"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

type Draft = {
  id: string;
  title: string | null;
  description: string | null;
  thumbnailUrl: string | null;
  status: string;
  scheduledPlatforms: string[];
  updatedAt: string | null;
};

export default function ScopedContentHubPage() {
  const params = useParams<{ brandKey: string }>();
  const brandKey = params?.brandKey || "";
  const [items, setItems] = useState<Draft[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!/^[a-z0-9][a-z0-9-]{1,62}$/.test(brandKey)) {
      setError("Merkevaren er ikke tilgjengelig."); setLoading(false); return;
    }
    const controller = new AbortController();
    setLoading(true);
    fetch("/api/workspaces/" + encodeURIComponent(brandKey) + "/marketing", {
      cache: "no-store", signal: controller.signal,
    }).then(async response => {
      if (!response.ok) throw new Error(response.status === 403
        ? "Du har ikke tilgang til utkastene for denne merkevaren."
        : "Utkastene kunne ikke hentes.");
      return response.json();
    }).then(body => {
      setItems(Array.isArray(body.publications) ? body.publications : []);
      setError("");
    }).catch(cause => {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Kunne ikke hente utkast.");
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [brandKey]);

  return <main className="mx-auto max-w-5xl space-y-6 px-4 py-8 text-slate-100">
    <header className="space-y-3">
      <Link className="text-sm text-cyan-300 underline" href={`/workspace/${encodeURIComponent(brandKey)}?tab=growth&focus=social`}>← Tilbake til SoMe Studio</Link>
      <h1 className="text-3xl font-bold">Content Hub · {brandKey === "zeneco" ? "Zen Eco Homes" : brandKey === "pinosoecolife" ? "Pinoso EcoLife" : brandKey === "altovena" ? "Altovena" : brandKey}</h1>
      <p className="text-sm text-slate-300">Merkevarens SoMe-utkast og publikasjoner. Denne avgrensede oversikten gir ikke tilgang til andre virksomheters innhold.</p>
    </header>
    {loading && <p role="status">Laster innhold…</p>}
    {error && <p role="alert" className="rounded-xl border border-amber-800 p-4 text-amber-200">{error}</p>}
    {!loading && !error && items.length === 0 && <p className="rounded-xl border border-slate-700 p-5">Ingen utkast eller publikasjoner funnet ennå.</p>}
    {!loading && !error && <div className="grid gap-4 md:grid-cols-2">{items.map(item =>
      <article key={item.id} className="rounded-xl border border-slate-700 bg-slate-900 p-4">
        <div className="flex items-start justify-between gap-3"><h2 className="font-semibold">{item.title || "Uten tittel"}</h2><span className="rounded bg-slate-800 px-2 py-1 text-xs">{item.status}</span></div>
        {item.thumbnailUrl && <img src={item.thumbnailUrl} alt="" loading="lazy" className="mt-3 h-44 w-full rounded object-cover"/>}
        <p className="mt-3 whitespace-pre-wrap text-sm text-slate-300">{item.description || "Ingen tekst registrert."}</p>
        <p className="mt-3 text-xs text-slate-400">{item.scheduledPlatforms?.join(" · ") || "Kanal ikke valgt"}{item.updatedAt ? " · " + new Date(item.updatedAt).toLocaleDateString("nb-NO") : ""}</p>
      </article>)}</div>}
    <p className="text-xs text-slate-400">Dette er foreløpig en sikker oversikt for medarbeidere. Redigering og publisering gjennom den globale Content Hub-en er ikke åpnet for medarbeiderrollen.</p>
  </main>;
}
