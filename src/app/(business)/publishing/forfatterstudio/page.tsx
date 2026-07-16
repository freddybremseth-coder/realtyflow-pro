"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  BookOpen,
  Feather,
  Image as ImageIcon,
  Languages,
  Loader2,
  RefreshCw,
  Save,
  Sparkles,
  Undo2,
  Upload,
  Wand2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

type LibraryBook = {
  id: string;
  title: string;
  subtitle?: string | null;
  series_name?: string | null;
  niche?: string | null;
  status?: string | null;
  role?: string | null;
  format?: string | null;
  amazon_url?: string | null;
  pdf_path?: string | null;
  marketplace?: string | null;
};

type LibraryProject = {
  id: string;
  title: string;
  subtitle?: string | null;
  language?: string | null;
  genre?: string | null;
  series_name?: string | null;
  status?: string | null;
  source_book_id?: string | null;
  parent_project_id?: string | null;
  updated_at?: string | null;
  chapters: number;
  words: number;
  images: number;
};

type Chapter = {
  chapter_title: string;
  draft: string;
  previous_draft?: string;
  image_url?: string | null;
  formatted?: boolean;
  last_edit?: { action?: string; instruction?: string; summary?: string; at?: string };
};

type FullProject = {
  id: string;
  title: string;
  subtitle?: string | null;
  language?: string | null;
  genre?: string | null;
  status?: string | null;
  parent_project_id?: string | null;
  source_book_id?: string | null;
  chapter_drafts?: Chapter[];
  metadata_plan?: Record<string, any>;
};

const LANGUAGES: Array<{ code: string; label: string }> = [
  { code: "en", label: "Engelsk" },
  { code: "no", label: "Norsk" },
  { code: "es", label: "Spansk" },
  { code: "de", label: "Tysk" },
  { code: "fr", label: "Fransk" },
  { code: "it", label: "Italiensk" },
  { code: "sv", label: "Svensk" },
  { code: "da", label: "Dansk" },
  { code: "nl", label: "Nederlandsk" },
  { code: "pt", label: "Portugisisk" },
];

const STATUS_LABELS: Record<string, string> = {
  draft: "Kladd",
  generating: "Genererer…",
  drafting: "Under arbeid",
  generated: "Generert",
  ready_for_export: "Klar",
  translating: "Oversettes",
  generation_failed: "Feilet",
};

function wordsOf(text: string) {
  return String(text || "").split(/\s+/).filter(Boolean).length;
}

function langLabel(code?: string | null) {
  return LANGUAGES.find((l) => l.code === (code || ""))?.label || (code || "").toUpperCase();
}

export default function ForfatterstudioPage() {
  const [books, setBooks] = useState<LibraryBook[]>([]);
  const [projects, setProjects] = useState<LibraryProject[]>([]);
  const [libraryLoading, setLibraryLoading] = useState(true);
  const [status, setStatus] = useState<string | null>(null);

  const [project, setProject] = useState<FullProject | null>(null);
  const [projectLoading, setProjectLoading] = useState(false);
  const [chapterIndex, setChapterIndex] = useState(0);
  const [draftText, setDraftText] = useState("");
  const [dirty, setDirty] = useState(false);

  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [customInstruction, setCustomInstruction] = useState("");
  const [targetLanguage, setTargetLanguage] = useState("en");
  const [imagePrompt, setImagePrompt] = useState("");
  const [imageStyle, setImageStyle] = useState("illustration");
  const [useOpenArt, setUseOpenArt] = useState(false);
  const [showAnalysis, setShowAnalysis] = useState(false);

  const [importBookId, setImportBookId] = useState<string | null>(null);
  const [importText, setImportText] = useState("");
  const [importFileName, setImportFileName] = useState("");
  const [importLanguage, setImportLanguage] = useState("en");
  const [importBusy, setImportBusy] = useState(false);

  const chapters = useMemo(() => project?.chapter_drafts || [], [project]);
  const chapter = chapters[chapterIndex] || null;
  const review = project?.metadata_plan?.author_review as Record<string, any> | undefined;

  const loadLibrary = useCallback(async () => {
    setLibraryLoading(true);
    try {
      const res = await fetch("/api/publishing/author-studio", { cache: "no-store" });
      const data = await res.json();
      setBooks(Array.isArray(data.books) ? data.books : []);
      setProjects(Array.isArray(data.projects) ? data.projects : []);
      if (data.booksError || data.projectsError) {
        setStatus(String(data.booksError || data.projectsError));
      }
    } catch {
      setStatus("Kunne ikke hente biblioteket. Prøv igjen.");
    } finally {
      setLibraryLoading(false);
    }
  }, []);

  useEffect(() => {
    loadLibrary();
  }, [loadLibrary]);

  const applyProject = useCallback((next: FullProject, keepChapterTitle?: string) => {
    setProject(next);
    const list = next.chapter_drafts || [];
    let idx = 0;
    if (keepChapterTitle) {
      const found = list.findIndex((c) => c.chapter_title === keepChapterTitle);
      if (found >= 0) idx = found;
    }
    setChapterIndex(idx);
    setDraftText(list[idx]?.draft || "");
    setDirty(false);
  }, []);

  const openProject = useCallback(
    async (id: string) => {
      setProjectLoading(true);
      setStatus(null);
      setShowAnalysis(false);
      try {
        const res = await fetch(`/api/publishing/author-studio?project_id=${encodeURIComponent(id)}`, { cache: "no-store" });
        const data = await res.json();
        if (!res.ok || !data.project) throw new Error(data.error || "Fant ikke prosjektet.");
        applyProject(data.project as FullProject);
      } catch (error) {
        setStatus(error instanceof Error ? error.message : "Kunne ikke åpne prosjektet.");
      } finally {
        setProjectLoading(false);
      }
    },
    [applyProject],
  );

  const selectChapter = useCallback(
    (index: number) => {
      if (dirty && !window.confirm("Du har ulagrede endringer i kapittelet. Forkaste dem?")) return;
      setChapterIndex(index);
      setDraftText(chapters[index]?.draft || "");
      setDirty(false);
      setImagePrompt("");
    },
    [chapters, dirty],
  );

  const studioPost = useCallback(
    async (payload: Record<string, unknown>, busyKey: string, keepChapterTitle?: string) => {
      setBusyAction(busyKey);
      setStatus(null);
      try {
        const res = await fetch("/api/publishing/author-studio", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Noe gikk galt.");
        if (data.project) applyProject(data.project as FullProject, keepChapterTitle);
        return data;
      } catch (error) {
        setStatus(error instanceof Error ? error.message : "Noe gikk galt.");
        return null;
      } finally {
        setBusyAction(null);
      }
    },
    [applyProject],
  );

  const saveChapter = useCallback(async () => {
    if (!project || !chapter) return;
    const data = await studioPost(
      { mode: "save_chapter", project_id: project.id, chapter_title: chapter.chapter_title, draft: draftText },
      "save",
      chapter.chapter_title,
    );
    if (data) setStatus("Kapittelet er lagret.");
  }, [project, chapter, draftText, studioPost]);

  const runEdit = useCallback(
    async (action: string) => {
      if (!project || !chapter) return;
      if (dirty) {
        setStatus("Lagre kapittelet før du kjører AI-endringer, så ingenting går tapt.");
        return;
      }
      const data = await studioPost(
        {
          mode: "edit_chapter",
          project_id: project.id,
          chapter_title: chapter.chapter_title,
          action,
          instruction: action === "custom" ? customInstruction : "",
        },
        `edit:${action}`,
        chapter.chapter_title,
      );
      if (data) {
        setStatus(data.change_summary ? `AI: ${data.change_summary}` : "Kapittelet er oppdatert av AI.");
        if (action === "custom") setCustomInstruction("");
      }
    },
    [project, chapter, dirty, customInstruction, studioPost],
  );

  const revertChapter = useCallback(async () => {
    if (!project || !chapter) return;
    const data = await studioPost(
      { mode: "revert_chapter", project_id: project.id, chapter_title: chapter.chapter_title },
      "revert",
      chapter.chapter_title,
    );
    if (data) setStatus("Gikk tilbake til forrige versjon.");
  }, [project, chapter, studioPost]);

  const runAnalyze = useCallback(async () => {
    if (!project) return;
    const data = await studioPost({ mode: "analyze", project_id: project.id }, "analyze", chapter?.chapter_title);
    if (data) {
      setShowAnalysis(true);
      setStatus("Analysen er klar.");
    }
  }, [project, chapter, studioPost]);

  const runFormatAll = useCallback(async () => {
    if (!project) return;
    setBusyAction("format");
    setStatus("Formaterer kapitler…");
    try {
      let remaining = 1;
      let total = 0;
      while (remaining > 0) {
        const res = await fetch("/api/publishing/author-studio", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mode: "format", project_id: project.id }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Formateringen feilet.");
        total += Number(data.formatted || 0);
        remaining = Number(data.remaining || 0);
        if (data.project) applyProject(data.project as FullProject, chapter?.chapter_title);
        setStatus(`Formatert ${total} kapitler… ${remaining} igjen.`);
      }
      setStatus(`Ferdig: ${total} kapitler formatert.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Formateringen feilet.");
    } finally {
      setBusyAction(null);
    }
  }, [project, chapter, applyProject]);

  const continueTranslation = useCallback(
    async (editionId: string) => {
      setBusyAction("translate");
      try {
        let remaining = 1;
        while (remaining > 0) {
          const res = await fetch("/api/publishing/author-studio", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ mode: "translate_continue", project_id: editionId }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || "Oversettelsen feilet.");
          remaining = Number(data.remaining || 0);
          if (data.project) applyProject(data.project as FullProject);
          setStatus(remaining > 0 ? `Oversetter… ${remaining} kapitler igjen.` : "Oversettelsen er ferdig!");
        }
        loadLibrary();
      } catch (error) {
        setStatus(error instanceof Error ? error.message : "Oversettelsen feilet.");
      } finally {
        setBusyAction(null);
      }
    },
    [applyProject, loadLibrary],
  );

  const runTranslate = useCallback(async () => {
    if (!project) return;
    const data = await studioPost(
      { mode: "translate", project_id: project.id, target_language: targetLanguage },
      "translate",
    );
    if (data?.edition?.id) {
      setStatus(`Språkutgave (${langLabel(targetLanguage)}) opprettet — oversetter kapitlene…`);
      await openProject(String(data.edition.id));
      await continueTranslation(String(data.edition.id));
    }
  }, [project, targetLanguage, studioPost, openProject, continueTranslation]);

  const generateImage = useCallback(async () => {
    if (!project || !chapter) return;
    setBusyAction("image");
    setStatus("Lager illustrasjon…");
    try {
      const prompt =
        imagePrompt.trim() ||
        `Illustrasjon til kapittelet "${chapter.chapter_title}" i boken "${project.title}". Stemningsfull, uten tekst.`;
      const res = await fetch("/api/image-generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          style: imageStyle,
          aspectRatio: "4:5",
          brand: "freddypublishing",
          persist: true,
          provider: useOpenArt ? "openart" : "gemini",
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.imageUrl) throw new Error(data.error || "Bildegenereringen feilet.");
      const saved = await fetch("/api/publishing/author-studio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "set_chapter_image",
          project_id: project.id,
          chapter_title: chapter.chapter_title,
          image_url: data.imageUrl,
        }),
      });
      const savedData = await saved.json();
      if (!saved.ok) throw new Error(savedData.error || "Kunne ikke koble bildet til kapittelet.");
      if (savedData.project) applyProject(savedData.project as FullProject, chapter.chapter_title);
      setStatus("Illustrasjonen er lagt til kapittelet.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Bildegenereringen feilet.");
    } finally {
      setBusyAction(null);
    }
  }, [project, chapter, imagePrompt, imageStyle, useOpenArt, applyProject]);

  const handleImportFile = useCallback(async (file: File) => {
    setImportBusy(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/publishing/book-engine/upload-source", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok || !data.content) throw new Error(data.error || "Kunne ikke lese filen.");
      setImportText(String(data.content));
      setImportFileName(`${data.file_name} (${Math.round(Number(data.char_count || 0) / 1000)}k tegn)`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Kunne ikke lese filen.");
    } finally {
      setImportBusy(false);
    }
  }, []);

  const runImport = useCallback(async () => {
    if (!importBookId) return;
    setImportBusy(true);
    setStatus(null);
    try {
      const res = await fetch("/api/publishing/author-studio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "import_book",
          book_id: importBookId,
          manuscript: importText,
          language: importLanguage,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.project) throw new Error(data.error || "Importen feilet.");
      setImportBookId(null);
      setImportText("");
      setImportFileName("");
      setStatus(`Boken er hentet inn med ${data.chapters} kapitler.`);
      await loadLibrary();
      applyProject(data.project as FullProject);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Importen feilet.");
    } finally {
      setImportBusy(false);
    }
  }, [importBookId, importText, importLanguage, loadLibrary, applyProject]);

  const busy = Boolean(busyAction) || importBusy;
  const projectByBook = useMemo(() => {
    const map = new Map<string, LibraryProject>();
    for (const p of projects) {
      if (p.source_book_id && !map.has(p.source_book_id)) map.set(p.source_book_id, p);
    }
    return map;
  }, [projects]);

  // ─── Studio-visning for et valgt prosjekt ─────────────────────────────────
  if (project) {
    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Button variant="outline" size="sm" onClick={() => { setProject(null); loadLibrary(); }}>
              <ArrowLeft className="mr-2 h-4 w-4" /> Biblioteket
            </Button>
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2">
                <Feather className="h-6 w-6" /> {project.title}
              </h1>
              <p className="text-sm text-muted-foreground">
                {langLabel(project.language)} · {chapters.length} kapitler ·{" "}
                {chapters.reduce((sum, c) => sum + wordsOf(c.draft), 0).toLocaleString("nb-NO")} ord ·{" "}
                {STATUS_LABELS[String(project.status)] || project.status}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={runAnalyze} disabled={busy}>
              {busyAction === "analyze" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
              Analyser boken
            </Button>
            <Button variant="outline" size="sm" onClick={runFormatAll} disabled={busy}>
              {busyAction === "format" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Wand2 className="mr-2 h-4 w-4" />}
              Formater hele boken
            </Button>
            {project.parent_project_id && project.status === "translating" ? (
              <Button variant="outline" size="sm" onClick={() => continueTranslation(project.id)} disabled={busy}>
                {busyAction === "translate" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Languages className="mr-2 h-4 w-4" />}
                Fortsett oversettelse
              </Button>
            ) : (
              <div className="flex items-center gap-1">
                <select
                  className="h-9 rounded-md border bg-background px-2 text-sm"
                  value={targetLanguage}
                  onChange={(e) => setTargetLanguage(e.target.value)}
                  disabled={busy}
                >
                  {LANGUAGES.filter((l) => l.code !== project.language).map((l) => (
                    <option key={l.code} value={l.code}>{l.label}</option>
                  ))}
                </select>
                <Button variant="outline" size="sm" onClick={runTranslate} disabled={busy}>
                  {busyAction === "translate" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Languages className="mr-2 h-4 w-4" />}
                  Oversett
                </Button>
              </div>
            )}
          </div>
        </div>

        {status ? <p className="text-sm rounded-md border bg-muted/40 px-3 py-2">{status}</p> : null}

        {review && showAnalysis ? (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base">
                AI-redaktørens vurdering {review.overall_score ? `· ${review.overall_score}/10` : ""}
              </CardTitle>
              <Button variant="ghost" size="sm" onClick={() => setShowAnalysis(false)}>Skjul</Button>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <p>{review.verdict}</p>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <p className="font-semibold mb-1">Styrker</p>
                  <ul className="list-disc pl-5 space-y-1">
                    {(review.strengths || []).map((s: string, i: number) => <li key={i}>{s}</li>)}
                  </ul>
                </div>
                <div>
                  <p className="font-semibold mb-1">Svakheter</p>
                  <ul className="list-disc pl-5 space-y-1">
                    {(review.weaknesses || []).map((s: string, i: number) => <li key={i}>{s}</li>)}
                  </ul>
                </div>
              </div>
              {review.market_fit ? (
                <p><span className="font-semibold">Marked:</span> {review.market_fit}</p>
              ) : null}
              {(review.recommended_actions || []).length > 0 ? (
                <div>
                  <p className="font-semibold mb-1">Anbefalte grep (prioritert)</p>
                  <ol className="list-decimal pl-5 space-y-1">
                    {(review.recommended_actions || []).map((s: string, i: number) => <li key={i}>{s}</li>)}
                  </ol>
                </div>
              ) : null}
            </CardContent>
          </Card>
        ) : review ? (
          <Button variant="ghost" size="sm" onClick={() => setShowAnalysis(true)}>
            Vis siste analyse ({review.analyzed_at ? new Date(String(review.analyzed_at)).toLocaleDateString("nb-NO") : "lagret"})
          </Button>
        ) : null}

        <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
          <Card className="h-fit">
            <CardHeader><CardTitle className="text-base">Kapitler</CardTitle></CardHeader>
            <CardContent className="space-y-1">
              {chapters.map((c, i) => (
                <button
                  key={`${c.chapter_title}-${i}`}
                  onClick={() => selectChapter(i)}
                  className={`w-full rounded-md px-3 py-2 text-left text-sm transition-colors ${
                    i === chapterIndex ? "bg-primary text-primary-foreground" : "hover:bg-muted"
                  }`}
                >
                  <span className="block truncate font-medium">{i + 1}. {c.chapter_title}</span>
                  <span className={`text-xs ${i === chapterIndex ? "text-primary-foreground/80" : "text-muted-foreground"}`}>
                    {wordsOf(c.draft).toLocaleString("nb-NO")} ord
                    {c.image_url ? " · 🖼" : ""}
                    {c.formatted ? " · ✓ formatert" : ""}
                  </span>
                </button>
              ))}
              {chapters.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Ingen kapitler ennå. {project.parent_project_id ? "Kjør «Fortsett oversettelse»." : "Bruk Bokmotoren i Publishing Hub for å generere, eller hent inn manus."}
                </p>
              ) : null}
            </CardContent>
          </Card>

          {chapter ? (
            <div className="space-y-4">
              <Card>
                <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0">
                  <CardTitle className="text-base">{chapter.chapter_title}</CardTitle>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button size="sm" variant="outline" onClick={() => runEdit("improve")} disabled={busy}>
                      {busyAction === "edit:improve" ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Sparkles className="mr-1 h-4 w-4" />}
                      Forbedre
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => runEdit("expand")} disabled={busy}>
                      {busyAction === "edit:expand" ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Wand2 className="mr-1 h-4 w-4" />}
                      Utvid
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => runEdit("simplify")} disabled={busy}>
                      Forenkle
                    </Button>
                    {chapter.previous_draft ? (
                      <Button size="sm" variant="ghost" onClick={revertChapter} disabled={busy}>
                        <Undo2 className="mr-1 h-4 w-4" /> Angre AI
                      </Button>
                    ) : null}
                    <Button size="sm" onClick={saveChapter} disabled={busy || !dirty}>
                      {busyAction === "save" ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Save className="mr-1 h-4 w-4" />}
                      Lagre
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {chapter.last_edit?.summary ? (
                    <p className="text-xs text-muted-foreground">Siste AI-endring: {chapter.last_edit.summary}</p>
                  ) : null}
                  <textarea
                    className="min-h-[420px] w-full rounded-md border bg-background p-3 font-mono text-sm leading-relaxed"
                    value={draftText}
                    onChange={(e) => {
                      setDraftText(e.target.value);
                      setDirty(true);
                    }}
                  />
                  <div className="flex flex-wrap items-center gap-2">
                    <Input
                      placeholder="Egendefinert endring — f.eks. «gjør tonen varmere» eller «skriv om åpningen»"
                      value={customInstruction}
                      onChange={(e) => setCustomInstruction(e.target.value)}
                      className="flex-1 min-w-[240px]"
                    />
                    <Button size="sm" variant="secondary" onClick={() => runEdit("custom")} disabled={busy || !customInstruction.trim()}>
                      {busyAction === "edit:custom" ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Wand2 className="mr-1 h-4 w-4" />}
                      Gjør endringen
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle className="text-base flex items-center gap-2"><ImageIcon className="h-4 w-4" /> Illustrasjon til kapittelet</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  {chapter.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={chapter.image_url} alt={chapter.chapter_title} className="max-h-64 rounded-md border" />
                  ) : null}
                  <div className="flex flex-wrap items-center gap-2">
                    <Input
                      placeholder={`Beskriv bildet (standard: illustrasjon til «${chapter.chapter_title}»)`}
                      value={imagePrompt}
                      onChange={(e) => setImagePrompt(e.target.value)}
                      className="flex-1 min-w-[240px]"
                    />
                    <select
                      className="h-9 rounded-md border bg-background px-2 text-sm"
                      value={imageStyle}
                      onChange={(e) => setImageStyle(e.target.value)}
                    >
                      <option value="illustration">Illustrasjon</option>
                      <option value="photo">Foto</option>
                      <option value="watercolor">Akvarell</option>
                      <option value="3d">3D</option>
                      <option value="minimal">Minimalistisk</option>
                    </select>
                    <label className="flex items-center gap-1 text-sm">
                      <input type="checkbox" checked={useOpenArt} onChange={(e) => setUseOpenArt(e.target.checked)} />
                      Bruk OpenArt
                    </label>
                    <Button size="sm" onClick={generateImage} disabled={busy}>
                      {busyAction === "image" ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <ImageIcon className="mr-1 h-4 w-4" />}
                      {chapter.image_url ? "Lag nytt bilde" : "Lag bilde"}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          ) : (
            <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">Velg et kapittel.</CardContent></Card>
          )}
        </div>
      </div>
    );
  }

  // ─── Bibliotek ─────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Feather className="h-6 w-6" /> Forfatterstudio
          </h1>
          <p className="text-sm text-muted-foreground">
            Alle bøkene dine — ferdige og kladd. AI-en er din personlige ekspertforfatter, redaktør og grafiske designer.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={loadLibrary} disabled={libraryLoading}>
          {libraryLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
          Oppdater
        </Button>
      </div>

      {status ? <p className="text-sm rounded-md border bg-muted/40 px-3 py-2">{status}</p> : null}
      {projectLoading ? <p className="text-sm text-muted-foreground"><Loader2 className="inline h-4 w-4 animate-spin" /> Åpner manus…</p> : null}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Manus og kladd</h2>
        {projects.length === 0 && !libraryLoading ? (
          <p className="text-sm text-muted-foreground">
            Ingen manusprosjekter ennå. Hent inn en utgitt bok under, eller lag en ny bok i Bokmotoren i Publishing Hub.
          </p>
        ) : null}
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {projects.map((p) => (
            <Card key={p.id} className="cursor-pointer transition-shadow hover:shadow-md" onClick={() => openProject(p.id)}>
              <CardContent className="pt-5 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-semibold leading-tight">{p.title}</p>
                  <Badge variant="outline">{STATUS_LABELS[String(p.status)] || p.status}</Badge>
                </div>
                {p.subtitle ? <p className="text-xs text-muted-foreground">{p.subtitle}</p> : null}
                <p className="text-xs text-muted-foreground">
                  {langLabel(p.language)} · {p.chapters} kapitler · {p.words.toLocaleString("nb-NO")} ord
                  {p.images > 0 ? ` · ${p.images} bilder` : ""}
                  {p.parent_project_id ? " · språkutgave" : ""}
                  {p.source_book_id ? " · fra utgitt bok" : ""}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold flex items-center gap-2"><BookOpen className="h-5 w-5" /> Utgitte bøker</h2>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {books.map((b) => {
            const linked = projectByBook.get(b.id);
            return (
              <Card key={b.id}>
                <CardContent className="pt-5 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-semibold leading-tight">{b.title}</p>
                    {b.status ? <Badge variant="outline">{b.status}</Badge> : null}
                  </div>
                  {b.subtitle ? <p className="text-xs text-muted-foreground">{b.subtitle}</p> : null}
                  <p className="text-xs text-muted-foreground">
                    {[b.series_name, b.format, b.marketplace].filter(Boolean).join(" · ")}
                  </p>
                  <div className="flex flex-wrap gap-2 pt-1">
                    {linked ? (
                      <Button size="sm" variant="secondary" onClick={() => openProject(linked.id)}>
                        <Feather className="mr-1 h-4 w-4" /> Åpne manus
                      </Button>
                    ) : (
                      <Button size="sm" variant="outline" onClick={() => { setImportBookId(b.id); setImportText(""); setImportFileName(""); }}>
                        <Upload className="mr-1 h-4 w-4" /> Hent inn i studioet
                      </Button>
                    )}
                  </div>

                  {importBookId === b.id ? (
                    <div className="mt-2 space-y-2 rounded-md border p-3">
                      <p className="text-xs text-muted-foreground">
                        Lim inn manuskriptet, eller last opp .docx/.txt/.md. Kapitler gjenkjennes automatisk.
                      </p>
                      <textarea
                        className="min-h-[140px] w-full rounded-md border bg-background p-2 text-sm"
                        placeholder="Lim inn hele manuskriptet her…"
                        value={importText}
                        onChange={(e) => setImportText(e.target.value)}
                      />
                      <div className="flex flex-wrap items-center gap-2">
                        <label className="inline-flex cursor-pointer items-center gap-1 rounded-md border px-3 py-1.5 text-sm hover:bg-muted">
                          <Upload className="h-4 w-4" /> Last opp fil
                          <input
                            type="file"
                            accept=".docx,.txt,.md"
                            className="hidden"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) handleImportFile(file);
                              e.target.value = "";
                            }}
                          />
                        </label>
                        {importFileName ? <span className="text-xs text-muted-foreground">{importFileName}</span> : null}
                        <select
                          className="h-8 rounded-md border bg-background px-2 text-sm"
                          value={importLanguage}
                          onChange={(e) => setImportLanguage(e.target.value)}
                        >
                          {LANGUAGES.map((l) => (
                            <option key={l.code} value={l.code}>{l.label}</option>
                          ))}
                        </select>
                        <Button size="sm" onClick={runImport} disabled={importBusy || !importText.trim()}>
                          {importBusy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Feather className="mr-1 h-4 w-4" />}
                          Hent inn
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setImportBookId(null)}>Avbryt</Button>
                      </div>
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            );
          })}
          {books.length === 0 && !libraryLoading ? (
            <p className="text-sm text-muted-foreground">Ingen bøker i katalogen ennå.</p>
          ) : null}
        </div>
      </section>
    </div>
  );
}
