"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

type Story = {
  sourceQueueId: string;
  kind: string;
  sourceBrand: string;
  title: string;
  url: string | null;
  status: string;
  suggestedCopy: string;
  previewUrl: string | null;
  createdAt: string;
  plannedAt: string | null;
};

type Editorial = {
  facebookPage: { name: string; id: string } | null;
  facebookRoutingValid: boolean;
  approvalRequired: boolean;
  bioDraft: string;
  pinnedPostDraft: string;
  profileCopyIsLiveOnFacebook: boolean;
  stories: Story[];
};

type Action = { loading?: boolean; error?: string; approvalId?: string; result?: string };

export default function FreddyEditorialPage() {
  const [data, setData] = useState<Editorial | null>(null);
  const [error, setError] = useState("");
  const [actions, setActions] = useState<Record<string, Action>>({});
  const [copied, setCopied] = useState("");

  const reload = useCallback(async () => {
    try {
      const res = await fetch("/api/nexus/freddy-editorial", { credentials: "same-origin", cache: "no-store" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Kunne ikke hente redaksjonelle forslag.");
      setData(body as Editorial);
      setError("");
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  }, []);

  useEffect(() => { void reload(); }, [reload]);

  const copy = async (value: string, label: string) => {
    try { await navigator.clipboard.writeText(value); setCopied(label); }
    catch { setCopied("Kopiering feilet – merk teksten og kopier manuelt."); }
  };

  const createDraft = async (row: Story) => {
    const id = row.sourceQueueId;
    setActions((old) => ({ ...old, [id]: { loading: true } }));
    try {
      const res = await fetch("/api/nexus/source-queue", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceQueueId: id, channel: "facebook" }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Kunne ikke opprette godkjenningsutkast.");
      const approvalId = body?.workflow?.approvalId as string | undefined;
      if (!approvalId) throw new Error("Utkastet fikk ingen godkjennings-ID. Kontroller status før nytt forsøk.");
      setActions((old) => ({ ...old, [id]: { approvalId, result: "Utkast laget. Kontroller ordlyden før publisering." } }));
      await reload();
    } catch (e) {
      setActions((old) => ({ ...old, [id]: { error: e instanceof Error ? e.message : String(e) } }));
    }
  };

  return <main className="mx-auto max-w-5xl space-y-6 px-4 py-7 text-slate-900 sm:px-7">
    <header className="rounded-2xl border border-slate-300 bg-white p-5 shadow-sm">
      <p className="text-xs font-bold uppercase tracking-widest text-cyan-700">RealtyFlow · Freddy Bremseth</p>
      <h1 className="mt-1 text-2xl font-black">Facebook – min offentlige samleside</h1>
      <p className="mt-2 text-sm leading-6 text-slate-700">
        Kunst, musikk og bøker har egne kontoer. Her forteller Freddy historien bak noen utvalgte prosjekter.
        Instagram publiseres <strong>ikke</strong> automatisk her; hvert Facebook-innlegg får en egen vinkling og kontroll før publisering.
      </p>
      <div className="mt-4 flex flex-wrap gap-3 text-sm">
        <Link href="/connections" className="rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 font-bold">Kontroller Facebook-konto</Link>
        <Link href="/approvals" className="rounded-lg bg-cyan-900 px-3 py-2 font-bold text-white">Åpne Kontroll / godkjenninger</Link>
        <button type="button" onClick={() => void reload()} className="rounded-lg border border-slate-300 bg-white px-3 py-2 font-bold">Oppdater forslag</button>
      </div>
      <p className="mt-3 text-xs text-slate-600">
        {data?.facebookRoutingValid ? `Mål: ${data.facebookPage?.name} (offentlig Facebook-side)` : "Facebook-ruting er ikke entydig; publisering må vente."}
        {" · "}{data?.approvalRequired ? "Personlige historier krever godkjenning." : "Godkjenningsmodus er ikke bekreftet."}
      </p>
    </header>

    {error && <div role="alert" className="rounded-lg border border-rose-300 bg-rose-50 p-4 text-rose-900">{error}</div>}
    {!data && !error && <p>Laster redaksjonell oversikt …</p>}

    {data && <section className="grid gap-4 md:grid-cols-2">
      <article className="min-w-0 rounded-2xl border border-slate-300 bg-white p-5 shadow-sm">
        <h2 className="font-black">Ny Facebook-bio</h2>
        <p className="mt-1 text-xs text-slate-600">Ligger som forslag i RealtyFlow. Du må selv lagre den under Facebook-sidens profilinformasjon.</p>
        <p className="mt-3 whitespace-pre-wrap break-words rounded-lg bg-slate-50 p-3 text-sm">{data.bioDraft}</p>
        <button type="button" onClick={() => void copy(data.bioDraft, "bio")} className="mt-3 rounded-lg bg-slate-900 px-3 py-2 text-sm font-bold text-white">Kopier bio</button>
      </article>
      <article className="min-w-0 rounded-2xl border border-slate-300 bg-white p-5 shadow-sm">
        <h2 className="font-black">Nytt festet velkomstinnlegg</h2>
        <p className="mt-1 text-xs text-slate-600">Publiser teksten på Facebook-siden din og velg «Fest innlegg» i innleggets meny. Det eksisterende innlegget endres ikke automatisk.</p>
        <div className="mt-3 max-h-64 overflow-y-auto whitespace-pre-wrap break-words rounded-lg bg-slate-50 p-3 text-sm leading-6">{data.pinnedPostDraft}</div>
        <button type="button" onClick={() => void copy(data.pinnedPostDraft, "velkomstinnlegg")} className="mt-3 rounded-lg bg-slate-900 px-3 py-2 text-sm font-bold text-white">Kopier velkomstinnlegg</button>
      </article>
    </section>}

    {copied && <p role="status" className="text-sm font-medium text-cyan-900">{copied === "bio" || copied === "velkomstinnlegg" ? `Kopierte ${copied}.` : copied}</p>}

    {data && <section className="rounded-2xl border border-slate-300 bg-white p-5 shadow-sm">
      <h2 className="text-xl font-black">Utvalgte historier til Facebook</h2>
      <p className="mt-1 text-sm leading-6 text-slate-700">
        Nexus velger maksimalt to kandidater i uken fra verifiserte kunstverk, musikk og publiserte bøker.
        Velg «Lag Facebook-utkast» for å få personlig norsk tekst med lenke til det opprinnelige prosjektet.
        Utkastet må godkjennes i Kontroll. Det er ikke samme innlegg som ble lagt ut på Instagram.
      </p>
      <div className="mt-5 grid gap-4 md:grid-cols-2">
        {data.stories.length === 0 && <p className="text-sm text-slate-600">Ingen nye kandidater ennå. Den ukentlige utvelgelsen lager forslag fra godkjent innhold.</p>}
        {data.stories.map((story) => {
          const action = actions[story.sourceQueueId];
          return <article key={story.sourceQueueId} className="min-w-0 rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex flex-wrap items-center gap-2 text-xs font-bold uppercase tracking-wide text-cyan-900">
              <span>{story.kind === "artwork" ? "Kunst" : story.kind === "song" ? "Musikk" : "Bøker"}</span>
              <span className="text-slate-500">· {story.status === "ready" ? "Klar til utkast" : "Utkast opprettet"}</span>
            </div>
            <h3 className="mt-2 font-black">{story.title.replace(/^Freddy story:\s*/, "")}</h3>
            {story.previewUrl && <div className="mt-3 overflow-hidden rounded-lg bg-slate-200"><img src={story.previewUrl} alt={story.title} loading="lazy" className="h-44 w-full object-contain" /></div>}
            <p className="mt-2 text-sm text-slate-700">{story.suggestedCopy}</p>
            {story.url && <a href={story.url} target="_blank" rel="noopener noreferrer" className="mt-2 block break-all text-xs font-bold text-cyan-900 underline">Åpne originalkilden</a>}
            {story.status === "ready" && <button type="button"
              onClick={() => void createDraft(story)}
              disabled={!data.facebookRoutingValid || !data.approvalRequired || action?.loading}
              className="mt-4 rounded-lg bg-cyan-900 px-3 py-2 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50">
              {action?.loading ? "Lager utkast …" : "Lag Facebook-utkast"}
            </button>}
            {action?.error && <p role="alert" className="mt-2 text-sm text-rose-800">{action.error}</p>}
            {action?.approvalId && <Link href={`/approvals?approvalId=${encodeURIComponent(action.approvalId)}#agentic-approval-${encodeURIComponent(action.approvalId)}`}
              className="mt-3 block text-sm font-bold text-cyan-900 underline">Åpne utkast i Kontroll →</Link>}
            {action?.result && <p role="status" className="mt-2 text-sm text-emerald-800">{action.result}</p>}
          </article>;
        })}
      </div>
    </section>}
  </main>;
}
