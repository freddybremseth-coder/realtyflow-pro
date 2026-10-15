"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { BookOpen, CheckCircle2, ChevronRight, Eye, FilePenLine, RotateCcw, Save, Search, ShieldCheck } from "lucide-react";
import { trainingArticlesFor, type TrainingArticle } from "@/lib/workspaces/training-content";
import {
  applyTrainingOverrides, editableTrainingContent,
  type TrainingEditableContent, type TrainingOverride,
} from "@/lib/workspaces/training-overrides";

type StaffMember = { email: string; name: string; permissions: string[] };
type TrainingRow = TrainingArticle & { editable: TrainingEditableContent };
type SavedRow = TrainingOverride & { updated_at?: string; updated_by?: string };
type TrainingData = {
  articles: TrainingRow[];
  overrides: SavedRow[];
  members: StaffMember[];
};
const empty = { articles: [], overrides: [], members: [] } as TrainingData;
const brands = [
  { value: "zeneco", label: "Zen Eco Homes" },
  { value: "pinosoecolife", label: "PinosoEcolife" },
];

function joinLines(lines: string[] = []) { return lines.join("\n"); }
function splitLines(text: string) {
  return text.split(/\r?\n/).map(item => item.trim()).filter(Boolean);
}

export default function HelpOwnerPage() {
  const [brandKey, setBrandKey] = useState("zeneco");
  const [data, setData] = useState<TrainingData>(empty);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [memberEmail, setMemberEmail] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [mode, setMode] = useState<"preview" | "edit">("preview");
  const [draft, setDraft] = useState<TrainingEditableContent | null>(null);

  const load = useCallback(async (key: string, signal?: AbortSignal) => {
    const response = await fetch("/api/owner/workspace-training?brandKey=" + encodeURIComponent(key),
      { cache: "no-store", signal });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error === "OWNER_ONLY"
      ? "Denne siden krever eiertilgang." : "Kunne ikke hente opplæringsinnhold.");
    return body as TrainingData;
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    setNotice("");
    setData(empty);
    setSelectedId("");
    setDraft(null);
    setMode("preview");
    setMemberEmail("");
    load(brandKey, controller.signal).then(value => {
      if (!controller.signal.aborted) setData(value);
    }).catch(cause => {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Lastefeil");
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [brandKey, load]);

  const members = data.members || [];
  const selectedMember = members.find(member => member.email === memberEmail) || null;
  const base = data.articles || [];
  const overridden = useMemo(() => applyTrainingOverrides(
    base, brandKey, data.overrides || [],
  ), [base, brandKey, data.overrides]);
  const visibleForMember = useMemo(() => selectedMember
    ? new Set(trainingArticlesFor({
        brandKey, permissions: selectedMember.permissions as any,
      }).map(article => article.id))
    : null, [brandKey, selectedMember]);
  const display = overridden.filter(article => {
    const matches = [article.title, article.summary, article.shortTitle, article.id].join(" ").toLowerCase()
      .includes(search.trim().toLowerCase());
    return matches && (!visibleForMember || visibleForMember.has(article.id));
  });
  const selectedArticle = overridden.find(article => article.id === selectedId) || display[0] || null;
  const modified = Boolean(data.overrides.some(item => item.article_id === selectedArticle?.id));
  const selectedDefault = base.find(item => item.id === selectedArticle?.id);

  function beginEdit() {
    if (!selectedArticle) return;
    setDraft(editableTrainingContent(selectedArticle));
    setMode("edit");
    setError("");
    setNotice("");
  }
  function selectArticle(id: string) {
    if (busy) return;
    setSelectedId(id);
    setDraft(null);
    setMode("preview");
    setError("");
    setNotice("");
  }
  function updateDraft(update: Partial<TrainingEditableContent>) {
    setDraft(current => current ? { ...current, ...update } : current);
  }
  function updateSection(index: number, patch: Record<string, unknown>) {
    setDraft(current => {
      if (!current) return current;
      const sections = current.sections.map((section, i) =>
        i === index ? { ...section, ...patch } : section);
      return { ...current, sections };
    });
  }

  async function save(action: "save" | "reset") {
    if (!selectedArticle || busy || (action === "save" && !draft)) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/owner/workspace-training", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action, brandKey, articleId: selectedArticle.id,
          ...(action === "save" ? { content: draft } : {}),
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error === "INVALID_CONTENT"
        ? "Innholdet må ha en tittel, et sammendrag og minst én seksjon med tekst."
        : "Kunne ikke lagre. Prøv igjen.");
      const refreshed = await load(brandKey);
      setData(refreshed);
      setDraft(null);
      setMode("preview");
      setSelectedId(selectedArticle.id);
      setNotice(action === "reset"
        ? "Originalguiden er gjenopprettet for denne merkevaren."
        : "Opplæringen er lagret og tilgjengelig for medarbeidere i dette arbeidsområdet.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Kunne ikke lagre.");
    } finally { setBusy(false); }
  }

  return <main className="mx-auto max-w-7xl space-y-6 px-2 py-5 text-slate-100">
    <header className="space-y-3 rounded-2xl border border-slate-800 bg-slate-950/80 p-5 sm:p-7">
      <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-cyan-300">
        <BookOpen size={16}/> Hjelp og opplæring
      </p>
      <h1 className="text-3xl font-bold tracking-tight">Slik jobber vi</h1>
      <p className="max-w-3xl text-sm leading-6 text-slate-300">
        Se nøyaktig hvilke guider medarbeiderne finner, og forbedre innholdet uten å endre andre deler av RealtyFlow.
        Originaltekstene beholdes og kan gjenopprettes når som helst.
      </p>
      <div className="flex flex-wrap gap-3">
        <Link href="/workspace-users" className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-cyan-200 hover:bg-slate-800">Brukere og tilgang</Link>
        <Link href="/workspaces" className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-cyan-200 hover:bg-slate-800">Arbeidsområder</Link>
      </div>
    </header>

    <div className="grid gap-4 rounded-xl border border-slate-800 bg-slate-900/60 p-4 sm:grid-cols-2">
      <label className="space-y-2 text-sm font-medium">
        <span>Merkevare</span>
        <select value={brandKey} onChange={e => setBrandKey(e.target.value)}
          className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5">
          {brands.map(brand => <option key={brand.value} value={brand.value}>{brand.label}</option>)}
        </select>
      </label>
      <label className="space-y-2 text-sm font-medium">
        <span>Vis opplæringen som</span>
        <select value={memberEmail} onChange={e => { setMemberEmail(e.target.value); setSelectedId(""); setMode("preview"); }}
          className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5">
          <option value="">Alle tilgjengelige guider (eier)</option>
          {members.map(member => <option key={member.email} value={member.email}>{member.name} · medarbeider</option>)}
        </select>
      </label>
    </div>

    <p className="flex items-center gap-2 text-xs text-slate-400">
      <ShieldCheck size={16} className="text-cyan-300"/>
      Medarbeiderforhåndsvisningen bruker personens aktuelle merkevarerettigheter. Redigering endrer aldri tilganger.
    </p>
    {loading && <p role="status" className="rounded-lg border border-slate-800 p-4">Henter opplæringen…</p>}
    {error && <p role="alert" className="rounded-lg border border-rose-800 bg-rose-950/20 p-4 text-sm text-rose-200">{error}</p>}
    {notice && <p role="status" className="flex items-center gap-2 rounded-lg border border-emerald-900 bg-emerald-950/20 p-4 text-sm text-emerald-200">
      <CheckCircle2 size={16}/>{notice}
    </p>}

    {!loading && !error && <div className="grid items-start gap-5 lg:grid-cols-[minmax(240px,0.8fr)_minmax(0,2fr)]">
      <aside className="space-y-3 rounded-xl border border-slate-800 bg-slate-900/60 p-3">
        <div className="flex items-center justify-between gap-2 px-2 pt-1">
          <h2 className="font-semibold">Guider</h2><span className="text-xs text-slate-400">{display.length} stk.</span>
        </div>
        <label className="relative block">
          <Search size={16} className="absolute left-3 top-3 text-slate-500"/>
          <input value={search} onChange={e => { setSearch(e.target.value); setSelectedId(""); setMode("preview"); }}
            placeholder="Søk i opplæringen" className="w-full rounded-lg border border-slate-700 bg-slate-950 py-2.5 pl-9 pr-3 text-sm"/>
        </label>
        <div className="max-h-[65vh] space-y-1 overflow-y-auto">
          {display.map(article => <button key={article.id} type="button" onClick={() => selectArticle(article.id)}
            className={"flex w-full items-start justify-between gap-2 rounded-lg px-3 py-3 text-left text-sm transition " +
              (selectedArticle?.id === article.id ? "bg-cyan-950/70 text-cyan-100 ring-1 ring-cyan-800" :
                "text-slate-300 hover:bg-slate-800")}>
            <span><span className="block font-semibold">{article.shortTitle}</span>
              <span className="mt-1 block text-xs text-slate-500">{article.readMinutes} min</span>
              {data.overrides.some(item => item.article_id === article.id) &&
                <span className="mt-1 block text-xs text-emerald-300">Tilpasset tekst</span>}
            </span><ChevronRight size={16} className="shrink-0"/>
          </button>)}
          {!display.length && <p className="px-3 py-4 text-sm text-slate-400">Ingen guider passer dette utvalget.</p>}
        </div>
      </aside>

      <section className="min-w-0 space-y-4 rounded-xl border border-slate-800 bg-slate-900/60 p-4 sm:p-6">
        {!selectedArticle ? <p className="py-8 text-center text-slate-400">Velg en guide for å se eller redigere den.</p> : <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs text-slate-400"><BookOpen size={16}/>
              {brands.find(b => b.value === brandKey)?.label}
              {modified ? " · Tilpasset versjon" : " · Originalversjon"}
            </div>
            <div className="flex flex-wrap gap-2">
              {mode === "preview" ?
                <button type="button" onClick={beginEdit}
                  className="inline-flex items-center gap-2 rounded-lg bg-cyan-700 px-3 py-2 text-sm font-semibold text-white">
                  <FilePenLine size={16}/> Rediger guide
                </button> :
                <button type="button" onClick={() => { setMode("preview"); setDraft(null); }}
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-sm">
                  <Eye size={16}/> Avbryt redigering
                </button>}
              {modified && mode === "preview" &&
                <button type="button" disabled={busy} onClick={() => {
                  if (window.confirm("Gjenopprette originalteksten for denne merkevaren?")) void save("reset");
                }} className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-300">
                  <RotateCcw size={16}/> Gjenopprett
                </button>}
            </div>
          </div>
          {mode === "preview" && <>
            <div className="border-b border-slate-800 pb-5">
              <h2 className="text-2xl font-bold">{selectedArticle.title}</h2>
              <p className="mt-3 text-sm leading-6 text-slate-300">{selectedArticle.summary}</p>
              <p className="mt-2 text-xs text-slate-500">{selectedArticle.readMinutes} min lesetid</p>
            </div>
            {selectedArticle.sections.map((section, i) => <article key={i} className="rounded-xl border border-slate-800 p-4">
              <h3 className="mb-3 text-lg font-semibold">{section.heading}</h3>
              {(section.paragraphs || []).map((paragraph, k) =>
                <p className="mb-3 text-sm leading-6 text-slate-300" key={k}>{paragraph}</p>)}
              {!!section.bullets?.length && <ul className="mb-3 list-disc space-y-2 pl-5 text-sm leading-6 text-slate-300">
                {section.bullets.map((bullet, k) => <li key={k}>{bullet}</li>)}
              </ul>}
              {section.emphasis && <p className="rounded-lg border border-cyan-900/70 bg-cyan-950/20 p-3 text-sm text-cyan-100">{section.emphasis}</p>}
            </article>)}
          </>}
          {mode === "edit" && draft && <>
            <p className="rounded-lg border border-cyan-900 bg-cyan-950/20 p-3 text-sm text-cyan-100">
              Du redigerer bare innholdet i denne guiden for {brands.find(b => b.value === brandKey)?.label}.
              Lagre for å gjøre endringen synlig i medarbeidernes Hjelp.
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="space-y-1 text-sm sm:col-span-2"><span>Overskrift</span>
                <input value={draft.title} maxLength={200} onChange={e => updateDraft({ title: e.target.value })}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 p-3"/></label>
              <label className="space-y-1 text-sm"><span>Kort tittel</span>
                <input value={draft.shortTitle} maxLength={100} onChange={e => updateDraft({ shortTitle: e.target.value })}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 p-3"/></label>
              <label className="space-y-1 text-sm"><span>Lesetid (min)</span>
                <input type="number" min={1} max={90} value={draft.readMinutes}
                  onChange={e => updateDraft({ readMinutes: Number(e.target.value) })}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 p-3"/></label>
              <label className="space-y-1 text-sm sm:col-span-2"><span>Beskrivelse</span>
                <textarea value={draft.summary} rows={3} maxLength={700} onChange={e => updateDraft({ summary: e.target.value })}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 p-3"/></label>
            </div>
            <div className="space-y-4">
              {draft.sections.map((section, index) => <div key={index} className="space-y-3 rounded-xl border border-slate-700 p-4">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-semibold">Avsnitt {index + 1}</h3>
                  {draft.sections.length > 1 &&
                    <button type="button" onClick={() => updateDraft({
                      sections: draft.sections.filter((_, i) => i !== index),
                    })} className="text-xs text-rose-300">Fjern avsnitt</button>}
                </div>
                <label className="block space-y-1 text-sm"><span>Mellomoverskrift</span>
                  <input value={section.heading} maxLength={220} onChange={e => updateSection(index, { heading: e.target.value })}
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 p-3"/></label>
                <label className="block space-y-1 text-sm"><span>Tekstavsnitt (ett per linje)</span>
                  <textarea rows={5} value={joinLines(section.paragraphs)}
                    onChange={e => updateSection(index, { paragraphs: splitLines(e.target.value) })}
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 p-3"/></label>
                <label className="block space-y-1 text-sm"><span>Punkter (ett per linje)</span>
                  <textarea rows={3} value={joinLines(section.bullets)}
                    onChange={e => updateSection(index, { bullets: splitLines(e.target.value) })}
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 p-3"/></label>
                <label className="block space-y-1 text-sm"><span>Viktig å huske (valgfritt)</span>
                  <textarea rows={2} value={section.emphasis || ""} maxLength={900}
                    onChange={e => updateSection(index, { emphasis: e.target.value })}
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 p-3"/></label>
              </div>)}
              <button type="button" disabled={draft.sections.length >= 30} onClick={() => updateDraft({
                sections: [...draft.sections, { heading: "Nytt avsnitt", paragraphs: ["Skriv forklaringen her."] }],
              })} className="rounded-lg border border-slate-700 px-3 py-2 text-sm hover:bg-slate-800">
                + Legg til avsnitt
              </button>
            </div>
            <div className="flex justify-end">
              <button type="button" disabled={busy} onClick={() => void save("save")}
                className="inline-flex items-center gap-2 rounded-lg bg-cyan-600 px-5 py-3 text-sm font-semibold text-white disabled:opacity-50">
                <Save size={17}/>{busy ? "Lagrer…" : "Lagre opplæring"}
              </button>
            </div>
          </>}
        </>}
        {selectedDefault && <p className="border-t border-slate-800 pt-4 text-xs text-slate-500">
          Originalguide: {selectedDefault.id}. Merkevare- og tillatelsesfiltrering er uendret av tekstredigeringen.
        </p>}
      </section>
    </div>}
  </main>;
}
