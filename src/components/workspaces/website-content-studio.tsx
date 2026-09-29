"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, FileText, Globe2, History, Plus, RefreshCw, RotateCcw, Send, Save, Sparkles, X } from "lucide-react";

type Destination = {
  id: string;
  label: string;
  path: string;
  contentType: string;
  description?: string | null;
};
type Draft = {
  id: string;
  destinationId: string;
  destinationLabel: string;
  destinationPath: string;
  contentType: string;
  title: string;
  slug: string;
  summary: string;
  markdown: string;
  imageUrl?: string | null;
  tags: string[];
  primaryKeyword?: string | null;
  supportingKeywords: string[];
  audience?: string | null;
  sourcePublicationId?: string | null;
  publishedAt?: string | null;
  lastPublishError?: string | null;
  updatedAt?: string | null;
};
type Published = {
  id: string;
  contentType: string;
  title?: string | null;
  markdown?: string | null;
  summary?: string | null;
  tags?: string[] | null;
  imageUrl?: string | null;
  status?: string | null;
  publishedAt?: string | null;
  updatedAt?: string | null;
};
type Opportunity = {
  id: string;
  opportunityType: string;
  score: number;
  title: string;
  summary: string;
  editorialAngle: string;
  propertyRefs: string[];
  imageUrl?: string | null;
  detectedAt?: string | null;
  expiresAt?: string | null;
};
type Version = {
  id: string;
  version: number;
  snapshot: Record<string, unknown>;
  createdAt: string;
};
type StudioData = {
  website: string;
  publishingMode: "direct" | "feed";
  destinations: Destination[];
  defaultDestinationId: string;
  drafts: Draft[];
  published: Published[];
  opportunities: Opportunity[];
};

function splitCsv(value: string) {
  return Array.from(new Set(value.split(",").map(item => item.trim()).filter(Boolean)));
}

export function WorkspaceWebsiteContentStudio({
  brandKey,
  canEdit,
  canPublish,
}: {
  brandKey: string;
  canEdit: boolean;
  canPublish: boolean;
}) {
  const [data, setData] = useState<StudioData | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [selectedDraftId, setSelectedDraftId] = useState<string | null>(null);
  const [versions, setVersions] = useState<Version[]>([]);
  const [showVersions, setShowVersions] = useState(false);

  const [destinationId, setDestinationId] = useState("");
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [summary, setSummary] = useState("");
  const [markdown, setMarkdown] = useState("");
  const [primaryKeyword, setPrimaryKeyword] = useState("");
  const [supportingKeywords, setSupportingKeywords] = useState("");
  const [audience, setAudience] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [tags, setTags] = useState("");
  const [sourcePublicationId, setSourcePublicationId] = useState<string | null>(null);

  async function load() {
    setLoading(true); setError("");
    try {
      const response = await fetch(`/api/workspaces/${encodeURIComponent(brandKey)}/content`, { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(response.status === 403
        ? "Du har ikke tilgang til nettsideinnhold for denne virksomheten."
        : "Nettsideinnhold kunne ikke hentes.");
      const next: StudioData = {
        website: body.website || "",
        publishingMode: body.publishingMode === "direct" ? "direct" : "feed",
        destinations: Array.isArray(body.destinations) ? body.destinations : [],
        defaultDestinationId: body.defaultDestinationId || "",
        drafts: Array.isArray(body.drafts) ? body.drafts : [],
        published: Array.isArray(body.published) ? body.published : [],
        opportunities: Array.isArray(body.opportunities) ? body.opportunities : [],
      };
      setData(next);
      setDestinationId(current => current || next.defaultDestinationId || next.destinations[0]?.id || "");
    } catch (cause) {
      setData(null);
      setError(cause instanceof Error ? cause.message : "Nettsideinnhold kunne ikke hentes.");
    } finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, [brandKey]);

  const selectedDraft = useMemo(
    () => data?.drafts.find(item => item.id === selectedDraftId) || null,
    [data, selectedDraftId],
  );

  function resetEditor() {
    setSelectedDraftId(null);
    setDestinationId(data?.defaultDestinationId || data?.destinations[0]?.id || "");
    setTitle(""); setSlug(""); setSummary(""); setMarkdown("");
    setPrimaryKeyword(""); setSupportingKeywords(""); setAudience("");
    setImageUrl(""); setTags(""); setSourcePublicationId(null);
    setVersions([]); setShowVersions(false); setError(""); setNotice("");
  }

  function openDraft(draft: Draft) {
    setSelectedDraftId(draft.id);
    setDestinationId(draft.destinationId);
    setTitle(draft.title || "");
    setSlug(draft.slug || "");
    setSummary(draft.summary || "");
    setMarkdown(draft.markdown || "");
    setPrimaryKeyword(draft.primaryKeyword || "");
    setSupportingKeywords((draft.supportingKeywords || []).join(", "));
    setAudience(draft.audience || "");
    setImageUrl(draft.imageUrl || "");
    setTags((draft.tags || []).join(", "));
    setSourcePublicationId(draft.sourcePublicationId || null);
    setVersions([]); setShowVersions(false); setError(""); setNotice("");
  }

  async function saveDraft() {
    if (!canEdit || !title.trim() || busy) return null;
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch(`/api/workspaces/${encodeURIComponent(brandKey)}/content`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save",
          draftId: selectedDraftId,
          destinationId,
          title,
          slug,
          summary,
          markdown,
          primaryKeyword,
          supportingKeywords: splitCsv(supportingKeywords),
          audience,
          imageUrl,
          tags: splitCsv(tags),
          sourcePublicationId,
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error?.code === "SLUG_ALREADY_EXISTS"
        ? "Denne URL-en brukes allerede av et annet utkast."
        : "Utkastet kunne ikke lagres.");
      setSelectedDraftId(body.draft.id);
      setSlug(body.draft.slug || slug);
      setSourcePublicationId(body.draft.sourcePublicationId || sourcePublicationId);
      setNotice("Utkastet er lagret. Ingenting er publisert ennå.");
      await load();
      return body.draft.id as string;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Utkastet kunne ikke lagres.");
      return null;
    } finally { setBusy(false); }
  }

  async function publish() {
    if (!canPublish || busy) return;
    let id = selectedDraftId;
    if (!id) id = await saveDraft();
    if (!id) return;

    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch(`/api/workspaces/${encodeURIComponent(brandKey)}/content`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "publish", draftId: id }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error?.message || "Publisering feilet.");
      setNotice(`Publisert til nettsiden ✓ Versjon ${body.version} er lagret for rollback.`);
      await load();
      if (body.externalUrl) window.open(body.externalUrl, "_blank", "noopener,noreferrer");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Publisering feilet.");
    } finally { setBusy(false); }
  }

  async function clonePublished(publicationId: string) {
    if (!canEdit || busy) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch(`/api/workspaces/${encodeURIComponent(brandKey)}/content`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "clone_published", publicationId }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error?.code === "SLUG_ALREADY_EXISTS"
        ? "Det finnes allerede et utkast for denne siden. Åpne utkastet i listen."
        : "Siden kunne ikke åpnes som utkast.");
      await load();
      openDraft(body.draft);
      setNotice("Publisert innhold er åpnet som redigerbart utkast. Nettsiden er ikke endret ennå.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Siden kunne ikke åpnes.");
    } finally { setBusy(false); }
  }

  async function useOpportunity(opportunityId: string) {
    if (!canEdit || busy) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch(`/api/workspaces/${encodeURIComponent(brandKey)}/content`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "opportunity_draft", opportunityId }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error?.code === "SLUG_ALREADY_EXISTS"
        ? "Det finnes allerede et utkast med samme URL. Åpne utkastlisten og vurder det eksisterende utkastet."
        : "Nexus-forslaget kunne ikke gjøres om til utkast.");
      await load();
      openDraft(body.draft);
      setNotice("Nexus-forslaget er gjort om til et vanlig Content Studio-utkast. Kontroller fakta og rediger før eventuell publisering.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Forslaget kunne ikke åpnes som utkast.");
    } finally { setBusy(false); }
  }

  async function dismissOpportunity(opportunityId: string) {
    if (!canEdit || busy) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch(`/api/workspaces/${encodeURIComponent(brandKey)}/content`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "opportunity_dismiss", opportunityId }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error("Forslaget kunne ikke skjules.");
      await load();
      setNotice("Forslaget er skjult. Nexus vil ikke presentere det samme signalet på nytt.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Forslaget kunne ikke skjules.");
    } finally { setBusy(false); }
  }

  async function loadVersions() {
    if (!selectedDraftId) return;
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/workspaces/${encodeURIComponent(brandKey)}/content`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "versions", draftId: selectedDraftId }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error("Versjonshistorikken kunne ikke hentes.");
      setVersions(Array.isArray(body.versions) ? body.versions : []);
      setShowVersions(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Versjonshistorikken kunne ikke hentes.");
    } finally { setBusy(false); }
  }

  async function restoreVersion(version: number) {
    if (!canEdit || !selectedDraftId || busy) return;
    if (!window.confirm(`Gjenopprette versjon ${version} som nytt utkast? Nettsiden endres ikke før du publiserer.`)) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch(`/api/workspaces/${encodeURIComponent(brandKey)}/content`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "restore", draftId: selectedDraftId, version }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error("Versjonen kunne ikke gjenopprettes.");
      openDraft(body.draft);
      setNotice(`Versjon ${version} er gjenopprettet som utkast. Kontroller og publiser når du er klar.`);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Versjonen kunne ikke gjenopprettes.");
    } finally { setBusy(false); }
  }

  if (loading) return <p className="text-sm text-slate-400">Laster nettsideinnhold…</p>;
  if (!data) return <p className="text-sm text-amber-300">{error || "Nettsideinnhold er ikke tilgjengelig."}</p>;

  const currentDestination = data.destinations.find(item => item.id === destinationId);

  return <section className="space-y-5">
    {error && <p role="alert" className="rounded-xl border border-amber-800 bg-amber-950/30 p-4 text-sm text-amber-200">{error}</p>}
    {notice && <p role="status" className="rounded-xl border border-emerald-800 bg-emerald-950/25 p-4 text-sm text-emerald-200">{notice}</p>}

    <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-cyan-300">Nettside & innhold</p>
          <h2 className="mt-2 flex items-center gap-2 text-xl font-bold"><Globe2 size={20}/> Lag noe som kan bli funnet</h2>
          <p className="mt-2 max-w-2xl text-sm text-slate-400">Skriv for kunden først. Bruk søkeord for å gjøre temaet tydelig for Google og AI – ikke for å fylle teksten med nøkkelord.</p>
        </div>
        <button type="button" onClick={() => void load()} className="inline-flex items-center gap-2 text-sm text-cyan-300"><RefreshCw size={15}/> Oppdater</button>
      </div>
      {canEdit && <button type="button" onClick={resetEditor}
        className="mt-4 inline-flex items-center gap-2 rounded-lg bg-cyan-600 px-4 py-2 text-sm font-semibold text-white">
        <Plus size={16}/> Ny artikkel eller guide
      </button>}
    </div>

    {data.opportunities.length > 0 && (
      <div className="rounded-2xl border border-cyan-800/60 bg-cyan-950/15 p-5">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-cyan-500/10 p-2 text-cyan-300"><Sparkles size={20}/></div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-cyan-300">Nexus · redaksjonelle signaler</p>
            <h3 className="mt-1 text-lg font-semibold text-white">Boligdata som kan bli en nyttig kjøperartikkel</h3>
            <p className="mt-1 max-w-3xl text-sm text-slate-400">
              Nexus ser etter dokumenterbare forskjeller i pris, areal, boligtype og område. Dette er forslag – ingenting publiseres automatisk.
            </p>
          </div>
        </div>
        <div className="mt-4 grid gap-3 xl:grid-cols-2">
          {data.opportunities.map(item => (
            <article key={item.id} className="rounded-xl border border-slate-800 bg-slate-950/70 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <span className="inline-flex rounded-full border border-cyan-700/50 bg-cyan-950/40 px-2 py-0.5 text-[11px] font-semibold text-cyan-200">
                    Signal {Math.round(item.score)}/100
                  </span>
                  <h4 className="mt-2 font-semibold text-white">{item.title}</h4>
                </div>
                {canEdit && <button type="button" title="Skjul forslag" disabled={busy}
                  onClick={() => void dismissOpportunity(item.id)}
                  className="rounded-md p-1 text-slate-500 hover:bg-slate-800 hover:text-slate-200">
                  <X size={15}/>
                </button>}
              </div>
              <p className="mt-2 text-sm leading-6 text-slate-400">{item.summary}</p>
              {item.editorialAngle && <p className="mt-2 text-xs leading-5 text-slate-500"><strong className="text-slate-300">Hvorfor Nexus viser den:</strong> {item.editorialAngle}</p>}
              {item.propertyRefs.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {item.propertyRefs.map(ref => <span key={ref} className="rounded-md bg-slate-900 px-2 py-1 text-[11px] text-slate-300">{ref}</span>)}
                </div>
              )}
              {canEdit && <button type="button" disabled={busy} onClick={() => void useOpportunity(item.id)}
                className="mt-4 inline-flex items-center gap-2 rounded-lg bg-cyan-600 px-3 py-2 text-xs font-semibold text-white hover:bg-cyan-500 disabled:opacity-50">
                <FileText size={14}/> Bruk som utkast
              </button>}
            </article>
          ))}
        </div>
      </div>
    )}

    <div className="grid gap-5 lg:grid-cols-[0.8fr_1.2fr]">
      <div className="space-y-5">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
          <h3 className="font-semibold">Utkast</h3>
          <div className="mt-3 space-y-2">
            {data.drafts.map(draft => <button type="button" key={draft.id} onClick={() => openDraft(draft)}
              className={`w-full rounded-xl border p-3 text-left ${selectedDraftId === draft.id ? "border-cyan-500 bg-cyan-950/25" : "border-slate-800 bg-slate-950/50 hover:border-slate-600"}`}>
              <strong className="block text-sm">{draft.title}</strong>
              <span className="mt-1 block text-xs text-slate-500">{draft.destinationLabel} · /{draft.slug}</span>
              {draft.publishedAt && <span className="mt-1 block text-[11px] text-emerald-400">Har publisert versjon</span>}
            </button>)}
            {!data.drafts.length && <p className="text-sm text-slate-500">Ingen utkast ennå.</p>}
          </div>
        </div>

        <details className="rounded-2xl border border-slate-800 bg-slate-900/70">
          <summary className="cursor-pointer list-none p-5">
            <strong>Publisert innhold</strong>
            <p className="mt-1 text-xs text-slate-500">Åpne når du vil forbedre en eksisterende side.</p>
          </summary>
          <div className="space-y-2 border-t border-slate-800 p-5">
            {data.published.map(item => <div key={item.id} className="rounded-xl border border-slate-800 bg-slate-950/50 p-3">
              <strong className="block text-sm">{item.title || "Uten tittel"}</strong>
              <span className="mt-1 block text-xs text-slate-500">{item.status || "published"}</span>
              {canEdit && <button type="button" disabled={busy} onClick={() => void clonePublished(item.id)}
                className="mt-2 text-xs text-cyan-300 underline">Forbedre denne siden</button>}
            </div>)}
            {!data.published.length && <p className="text-sm text-slate-500">Ingen website-publiseringer registrert i Content Hub ennå.</p>}
          </div>
        </details>
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
        {!canEdit && !selectedDraft ? <p className="text-sm text-slate-400">Velg et utkast for å lese innholdet.</p> : <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold">{selectedDraftId ? "Arbeid med innholdet" : "Nytt innhold"}</h3>
              <p className="mt-1 text-xs text-slate-500">RealtyFlow håndterer brand, publiseringsmål og versjonshistorikk.</p>
            </div>
            {selectedDraftId && <button type="button" onClick={() => void loadVersions()}
              className="inline-flex items-center gap-2 text-xs text-cyan-300"><History size={14}/> Versjoner</button>}
          </div>

          <div className="mt-5 space-y-4">
            <label className="block text-xs text-slate-300">Hvor skal innholdet ligge?
              <select disabled={!canEdit} value={destinationId} onChange={e => setDestinationId(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm">
                {data.destinations.map(destination => <option key={destination.id} value={destination.id}>{destination.label}</option>)}
              </select>
            </label>

            <label className="block text-xs text-slate-300">Hva skal siden handle om? *
              <input disabled={!canEdit} value={title} onChange={e => setTitle(e.target.value)} maxLength={200}
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm"
                placeholder="Eksempel: Bedriftshytte i Spania – et moderne ansattgode"/>
            </label>

            <div className="grid gap-3 md:grid-cols-2">
              <label className="block text-xs text-slate-300">Hovedsøkeord
                <input disabled={!canEdit} value={primaryKeyword} onChange={e => setPrimaryKeyword(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm"
                  placeholder="bedriftshytte i Spania"/>
              </label>
              <label className="block text-xs text-slate-300">Andre relevante søk
                <input disabled={!canEdit} value={supportingKeywords} onChange={e => setSupportingKeywords(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm"
                  placeholder="ansattgode, workation, firmabolig"/>
              </label>
            </div>

            <label className="block text-xs text-slate-300">Hvem skriver vi for?
              <input disabled={!canEdit} value={audience} onChange={e => setAudience(e.target.value)} maxLength={500}
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm"
                placeholder="HR-ledere og bedriftseiere som vil tilby ansatte noe attraktivt"/>
            </label>

            <label className="block text-xs text-slate-300">Kort svar / sammendrag
              <textarea disabled={!canEdit} value={summary} onChange={e => setSummary(e.target.value)} rows={3} maxLength={700}
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm"
                placeholder="Svar kort på hovedspørsmålet. Dette hjelper både mennesker, Google og AI-svar."/>
            </label>

            <label className="block text-xs text-slate-300">Innhold
              <textarea disabled={!canEdit} value={markdown} onChange={e => setMarkdown(e.target.value)} rows={16}
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm leading-6"
                placeholder={"Skriv naturlig og nyttig. Bruk mellomtitler, konkrete svar og en tydelig vei videre for kunden."}/>
            </label>

            <details className="rounded-xl border border-slate-800 bg-slate-950/40 p-3">
              <summary className="cursor-pointer text-xs font-semibold text-slate-300">Flere valg</summary>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <label className="block text-xs text-slate-400">URL-navn
                  <input disabled={!canEdit} value={slug} onChange={e => setSlug(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                    placeholder="lages automatisk fra tittelen"/>
                </label>
                <label className="block text-xs text-slate-400">Bilde-URL
                  <input disabled={!canEdit} value={imageUrl} onChange={e => setImageUrl(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm"/>
                </label>
                <label className="block text-xs text-slate-400 md:col-span-2">Tags
                  <input disabled={!canEdit} value={tags} onChange={e => setTags(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                    placeholder="costa blanca, bolig i spania"/>
                </label>
              </div>
            </details>
          </div>

          {currentDestination && <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950/50 p-3 text-xs text-slate-400">
            <strong className="text-slate-200">Forventet plassering:</strong> {currentDestination.path}/{slug || "url-lages-automatisk"}
          </div>}

          {showVersions && <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950/50 p-4">
            <h4 className="font-semibold">Publiserte versjoner</h4>
            <div className="mt-2 space-y-2">
              {versions.map(version => <div key={version.id} className="flex items-center justify-between gap-3 rounded-lg border border-slate-800 p-3 text-xs">
                <span>Versjon {version.version} · {new Date(version.createdAt).toLocaleString("no-NO")}</span>
                {canEdit && <button type="button" onClick={() => void restoreVersion(version.version)}
                  className="inline-flex items-center gap-1 text-cyan-300"><RotateCcw size={13}/> Gjenopprett</button>}
              </div>)}
              {!versions.length && <p className="text-xs text-slate-500">Ingen publiserte versjoner ennå.</p>}
            </div>
          </div>}

          {canEdit && <div className="mt-5 flex flex-wrap gap-2">
            <button type="button" disabled={busy || !title.trim()} onClick={() => void saveDraft()}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-4 py-2 text-sm font-semibold hover:bg-slate-800 disabled:opacity-40">
              <Save size={16}/>{busy ? "Arbeider…" : "Lagre utkast"}
            </button>
            {canPublish && <button type="button" disabled={busy || !title.trim()} onClick={() => void publish()}
              className="inline-flex items-center gap-2 rounded-lg bg-cyan-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">
              <Send size={16}/> Publiser til nettsiden
            </button>}
          </div>}

          {selectedDraft?.publishedAt && <p className="mt-4 flex items-center gap-2 text-xs text-emerald-300">
            <CheckCircle2 size={14}/> Sist publisert {new Date(selectedDraft.publishedAt).toLocaleString("no-NO")}
          </p>}
        </>}
      </div>
    </div>
  </section>;
}
