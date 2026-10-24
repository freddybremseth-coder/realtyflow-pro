"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

type SeoTask = {
  id: string; title: string; description: string | null; status: string;
  priority: string | null; dueDate: string | null; nextAction: string | null;
  updatedAt: string | null;
};
type SeoData = {
  tasks: SeoTask[];
  metadata: Array<{ page_path: string; seo_title: string; seo_description: string; updated_at: string }>;
};

export default function WorkspaceSeoSamPage() {
  const { brandKey } = useParams<{ brandKey: string }>();
  const [data, setData] = useState<SeoData | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setData(null); setError(""); setLoading(true);
    fetch("/api/workspaces/" + encodeURIComponent(String(brandKey)) + "/seo-sam", {
      cache: "no-store", signal: controller.signal,
    }).then(async response => {
      if (!response.ok) throw new Error(response.status === 403
        ? "Du har ikke tilgang til SEO SAM for denne merkevaren."
        : "SEO-oversikten kunne ikke lastes.");
      return response.json();
    }).then(result => {
      if (!controller.signal.aborted) setData({ tasks: result.tasks || [], metadata: result.metadata || [] });
    }).catch(cause => {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Ukjent feil");
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [brandKey, revision]);

  return <main className="mx-auto max-w-6xl space-y-6 p-4 text-slate-100 sm:p-6">
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <Link href={"/workspace/" + brandKey + "/content-hub"} className="text-sm text-cyan-300 underline">Tilbake til Content Hub</Link>
        <h1 className="mt-2 text-3xl font-bold">SEO SAM · {brandKey === "zeneco" ? "Zen Eco Homes" : "Pinoso EcoLife"}</h1>
        <p className="mt-2 text-slate-300">SEO-oppgaver og innholdsforbedringer for denne merkevaren. Del oversikten med Erlend for vurdering.</p>
        <p className="mt-1 text-xs text-slate-400">Kun lesetilgang. Andre merkevarer, private opplysninger, økonomi og systeminnstillinger er ikke tilgjengelige.</p>
      </div>
      <button type="button" onClick={() => setRevision(value => value + 1)} className="rounded-lg border border-cyan-600 px-4 py-2 font-semibold">Oppdater</button>
    </header>
    {loading && <p role="status">Henter SEO-data …</p>}
    {error && <p role="alert" className="rounded-lg border border-rose-700 p-4 text-rose-200">{error}</p>}
    {data && <>
      <section className="rounded-xl border border-slate-700 bg-slate-900 p-5">
        <h2 className="text-xl font-semibold">SAMs SEO-oppgaver ({data.tasks.length})</h2>
        {data.tasks.length === 0 && <p className="mt-3 text-slate-300">Ingen registrerte SEO-oppgaver for denne merkevaren.</p>}
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {data.tasks.map(task => <article key={task.id} className="rounded-lg border border-slate-700 bg-slate-950 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-semibold">{task.title}</h3>
              <span className="rounded bg-slate-800 px-2 py-1 text-xs">{task.status} · {task.priority || "Prioritet ikke satt"}</span>
            </div>
            {task.description && <p className="mt-3 whitespace-pre-wrap text-sm text-slate-300">{task.description}</p>}
            {task.nextAction && <p className="mt-3 text-sm text-cyan-200"><strong>Neste steg:</strong> {task.nextAction}</p>}
            {task.dueDate && <p className="mt-2 text-xs text-slate-400">Frist: {task.dueDate}</p>}
          </article>)}
        </div>
      </section>
      {brandKey === "zeneco" && <section className="rounded-xl border border-slate-700 bg-slate-900 p-5">
        <h2 className="text-xl font-semibold">Aktive SEO-titler og beskrivelser ({data.metadata.length})</h2>
        {data.metadata.length === 0 && <p className="mt-3 text-slate-300">Ingen overstyrte SEO-tekster registrert.</p>}
        <div className="mt-4 space-y-3">
          {data.metadata.map(item => <article key={item.page_path} className="rounded-lg border border-slate-700 p-3">
            <p className="break-all text-xs text-cyan-300">{item.page_path}</p>
            <h3 className="mt-2 font-semibold">{item.seo_title}</h3>
            <p className="mt-1 text-sm text-slate-300">{item.seo_description}</p>
          </article>)}
        </div>
      </section>}
    </>}
  </main>;
}
