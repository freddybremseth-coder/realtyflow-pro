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
  Trash2,
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
  quality?: { score?: number; notes?: string[]; revised?: boolean; at?: string };
  research?: string;
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
  outline_plan?: { toc?: Array<{ title?: string }> } & Record<string, any>;
  metadata_plan?: Record<string, any>;
};

const GENRES: Array<{ id: string; label: string }> = [
  { id: "guide", label: "Sakprosa / guide" },
  { id: "self_development", label: "Selvutvikling" },
  { id: "memoir", label: "Memoar / biografi" },
  { id: "children", label: "Barnebok" },
  { id: "fiction", label: "Skjønnlitteratur" },
];

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
  rewriting: "Skrives om",
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
  const [importError, setImportError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [voiceText, setVoiceText] = useState("");
  const [showVoice, setShowVoice] = useState(false);
  const [showConsistency, setShowConsistency] = useState(false);
  const [showNewBook, setShowNewBook] = useState(false);
  const [newBook, setNewBook] = useState({ title: "", genre: "guide", language: "no", audience: "", brief: "", pages: 150 });
  const [creatingBook, setCreatingBook] = useState<string | null>(null);
  const [writingNext, setWritingNext] = useState(false);
  const [newBookSource, setNewBookSource] = useState<{ name: string; content: string } | null>(null);
  const [sourceUploading, setSourceUploading] = useState(false);
  const [showInterview, setShowInterview] = useState(false);
  const [interviewTheme, setInterviewTheme] = useState("");
  const [interviewLoading, setInterviewLoading] = useState(false);
  const [interviewData, setInterviewData] = useState<{ directions: Array<{ id: string; title: string; audience?: string; promise?: string; notes?: string }>; questions: string[] } | null>(null);
  const [interviewDirection, setInterviewDirection] = useState("");
  const [interviewAnswers, setInterviewAnswers] = useState<Record<number, string>>({});
  const [showRewrite, setShowRewrite] = useState(false);
  const [rewriteInstruction, setRewriteInstruction] = useState("");
  const [rewriting, setRewriting] = useState(false);
  const [showImportManus, setShowImportManus] = useState(false);
  const [importManus, setImportManus] = useState({ title: "", genre: "guide", language: "no", content: "", fileName: "" });
  const [importManusBusy, setImportManusBusy] = useState(false);
  const [showCover, setShowCover] = useState(false);
  const [coverPrompt, setCoverPrompt] = useState("");
  const [coverUseOpenArt, setCoverUseOpenArt] = useState(false);
  const [coverBusy, setCoverBusy] = useState(false);
  const [showAddChapter, setShowAddChapter] = useState(false);
  const [addChapter, setAddChapter] = useState({ title: "", text: "", position: "start", polish: true });
  const [addingChapter, setAddingChapter] = useState(false);

  const chapters = useMemo(() => project?.chapter_drafts || [], [project]);
  const chapter = chapters[chapterIndex] || null;
  const review = project?.metadata_plan?.author_review as Record<string, any> | undefined;
  const consistency = project?.metadata_plan?.consistency_report as Record<string, any> | undefined;

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
    setVoiceText(String(next.metadata_plan?.voice_sample || ""));
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

  const saveVoice = useCallback(async () => {
    if (!project) return;
    const data = await studioPost(
      { mode: "save_voice", project_id: project.id, voice_sample: voiceText },
      "voice",
      chapter?.chapter_title,
    );
    if (data) setStatus("Stemmeprøven er lagret — all skriving og redigering bruker den nå.");
  }, [project, voiceText, chapter, studioPost]);

  const runScoreAll = useCallback(async () => {
    if (!project) return;
    setBusyAction("score");
    setStatus("Vurderer kapitler mot sjangerens kvalitetsrubrikk…");
    try {
      let remaining = 1;
      let total = 0;
      while (remaining > 0) {
        const res = await fetch("/api/publishing/author-studio", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mode: "score_chapters", project_id: project.id }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Kvalitetsvurderingen feilet.");
        total += Number(data.scored || 0);
        remaining = Number(data.remaining || 0);
        if (data.project) applyProject(data.project as FullProject, chapter?.chapter_title);
        setStatus(`Vurdert ${total} kapitler… ${remaining} igjen.`);
      }
      setStatus(total > 0 ? `Ferdig: ${total} kapitler vurdert. Laveste score først er lurest å forbedre.` : "Alle kapitler er allerede vurdert.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Kvalitetsvurderingen feilet.");
    } finally {
      setBusyAction(null);
    }
  }, [project, chapter, applyProject]);

  const handleNewBookFile = useCallback(async (file: File) => {
    setSourceUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/publishing/book-engine/upload-source", { method: "POST", body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.content) throw new Error(data.error || "Kunne ikke lese filen.");
      setNewBookSource({ name: `${data.file_name} (${Math.round(Number(data.char_count || 0) / 1000)}k tegn)`, content: String(data.content) });
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Kunne ikke lese filen.");
    } finally {
      setSourceUploading(false);
    }
  }, []);

  const runInterview = useCallback(async () => {
    if (!interviewTheme.trim()) return;
    setInterviewLoading(true);
    setInterviewData(null);
    try {
      const res = await fetch("/api/publishing/book-engine/workshop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "discover", theme: interviewTheme.trim(), genre: newBook.genre }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Intervjuet feilet.");
      setInterviewData({
        directions: Array.isArray(data.directions) ? data.directions : [],
        questions: Array.isArray(data.questions) ? data.questions.map(String).slice(0, 8) : [],
      });
      setInterviewDirection("");
      setInterviewAnswers({});
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Intervjuet feilet.");
    } finally {
      setInterviewLoading(false);
    }
  }, [interviewTheme, newBook.genre]);

  const finishInterview = useCallback(async () => {
    if (!interviewData) return;
    setInterviewLoading(true);
    try {
      const direction = interviewData.directions.find((d) => d.id === interviewDirection);
      const answers = interviewData.questions
        .map((question, i) => ({ question, answer: (interviewAnswers[i] || "").trim() }))
        .filter((row) => row.answer);
      const res = await fetch("/api/publishing/book-engine/workshop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "plan",
          theme: interviewTheme.trim(),
          selected_direction: direction ? `${direction.title} — ${direction.promise || ""}` : "",
          genre: newBook.genre,
          question_answers: answers,
          language: newBook.language,
          length_pages: newBook.pages,
        }),
      });
      const plan = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(plan.error || "Bokplanen feilet.");
      const chapterList = Array.isArray(plan.chapter_overview)
        ? plan.chapter_overview.map((c: any) => `${c.chapter}. ${c.title}${c.goal ? ` — ${c.goal}` : ""}`).join("\n")
        : "";
      setNewBook((b) => ({
        ...b,
        title: String(plan.title || b.title),
        audience: String(plan.audience || b.audience),
        pages: Number(plan.target_pages || b.pages),
        brief: [String(plan.positioning || ""), chapterList ? `Foreslått kapitteloversikt:\n${chapterList}` : ""]
          .filter(Boolean)
          .join("\n\n"),
      }));
      setShowInterview(false);
      setShowNewBook(true);
      setStatus("Bokplanen fra intervjuet er fylt inn i Ny bok-skjemaet — juster og trykk «Opprett».");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Bokplanen feilet.");
    } finally {
      setInterviewLoading(false);
    }
  }, [interviewData, interviewDirection, interviewAnswers, interviewTheme, newBook.genre, newBook.language, newBook.pages]);

  const createBook = useCallback(async () => {
    if (!newBook.title.trim()) return;
    setCreatingBook("Oppretter bokprosjektet…");
    setStatus(null);
    try {
      const createRes = await fetch("/api/publishing/book-engine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: newBook.title.trim(),
          genre: newBook.genre,
          language: newBook.language,
          audience: newBook.audience.trim() || undefined,
          positioning: newBook.brief.trim() || undefined,
          niche: "",
          target_pages: newBook.pages,
          target_words: Math.max(12000, Math.round(newBook.pages * 190)),
          source_mode: newBookSource ? "improve_source" : "from_brief",
          source_material: newBookSource?.content || undefined,
          source_instructions: newBookSource ? newBook.brief.trim() || undefined : undefined,
        }),
      });
      const created = await createRes.json();
      if (!createRes.ok || !created.project?.id) throw new Error(created.error || "Kunne ikke opprette boken.");
      const projectId = String(created.project.id);

      setCreatingBook("Steg 1/2: AI-en lager tittelarbeid og metadata…");
      const seoRes = await fetch("/api/publishing/book-engine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "generate_seo", id: projectId }),
      });
      if (!seoRes.ok) {
        const seoErr = await seoRes.json().catch(() => ({}));
        console.warn("SEO-steget feilet (fortsetter):", seoErr.error);
      }

      setCreatingBook("Steg 2/2: Kapitteloversikt lages og første kapittel skrives (research → utkast → redaktørkritikk → revisjon). Tar 2–4 minutter — bli på siden…");
      const genRes = await fetch("/api/publishing/book-engine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "generate_author", id: projectId }),
      });
      const gen = await genRes.json().catch(() => ({}));
      const finalMessage = !genRes.ok
        ? gen.error || "Genereringen fikk problemer — bruk «Lag kapitteloversikt»-knappen i boken for å prøve igjen."
        : gen.warning
          ? String(gen.warning)
          : "Boken er i gang: kapitteloversikt + første kapittel er klart.";

      setShowNewBook(false);
      setNewBook({ title: "", genre: "guide", language: "no", audience: "", brief: "", pages: 150 });
      setNewBookSource(null);
      await loadLibrary();
      await openProject(projectId);
      setStatus(finalMessage);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Kunne ikke opprette boken.");
    } finally {
      setCreatingBook(null);
    }
  }, [newBook, newBookSource, loadLibrary, openProject]);

  // Redningsknapp: lager kapitteloversikt + første kapittel for et prosjekt
  // som mangler dem — f.eks. hvis genereringen ble avbrutt ved opprettelse.
  const generateOutlineNow = useCallback(async () => {
    if (!project) return;
    setWritingNext(true);
    setStatus("Lager kapitteloversikt og skriver første kapittel — tar 2–4 minutter, bli på siden…");
    try {
      const res = await fetch("/api/publishing/book-engine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "generate_author", id: project.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Genereringen feilet — prøv igjen.");
      if (data.project) applyProject(data.project as FullProject);
      setStatus(data.warning ? String(data.warning) : "Kapitteloversikten er klar — fortsett med «Skriv neste kapittel».");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Genereringen feilet — prøv igjen.");
    } finally {
      setWritingNext(false);
    }
  }, [project, applyProject]);

  const handleManusFile = useCallback(async (file: File) => {
    setImportManusBusy(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/publishing/book-engine/upload-source", { method: "POST", body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.content) throw new Error(data.error || "Kunne ikke lese filen.");
      setImportManus((m) => ({
        ...m,
        content: String(data.content),
        fileName: `${data.file_name} (${Math.round(Number(data.char_count || 0) / 1000)}k tegn)`,
        title: m.title || String(data.file_name || "").replace(/\.(pdf|docx|txt|md)$/i, "").replace(/[-_]+/g, " ").trim(),
      }));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Kunne ikke lese filen.");
    } finally {
      setImportManusBusy(false);
    }
  }, []);

  const runImportManus = useCallback(async () => {
    if (!importManus.title.trim() || !importManus.content.trim()) return;
    setImportManusBusy(true);
    try {
      const res = await fetch("/api/publishing/author-studio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "import_manuscript",
          title: importManus.title.trim(),
          genre: importManus.genre,
          language: importManus.language,
          manuscript: importManus.content,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.project) throw new Error(data.error || "Importen feilet.");
      setShowImportManus(false);
      setImportManus({ title: "", genre: "guide", language: "no", content: "", fileName: "" });
      setStatus(`Manuset er importert med ${data.chapters} kapitler — klart for forbedring, omskriving eller oversettelse.`);
      await loadLibrary();
      applyProject(data.project as FullProject);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Importen feilet.");
    } finally {
      setImportManusBusy(false);
    }
  }, [importManus, loadLibrary, applyProject]);

  const generateCover = useCallback(async () => {
    if (!project) return;
    setCoverBusy(true);
    setStatus("Lager bokomslag…");
    try {
      const prompt =
        coverPrompt.trim() ||
        String(project.metadata_plan?.cover_brief || "") ||
        `Premium bokomslag-konsept for «${project.title}»${project.subtitle ? ` — ${project.subtitle}` : ""}. Stemningsfullt, elegant, uten tekst.`;
      const res = await fetch("/api/image-generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          style: "luxury",
          aspectRatio: "4:5",
          brand: "freddypublishing",
          persist: true,
          provider: coverUseOpenArt ? "openart" : "gemini",
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.imageUrl) throw new Error(data.error || "Omslagsgenereringen feilet.");
      const saved = await fetch("/api/publishing/author-studio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "set_cover", project_id: project.id, cover_url: data.imageUrl }),
      });
      const savedData = await saved.json();
      if (!saved.ok) throw new Error(savedData.error || "Kunne ikke lagre omslaget.");
      if (savedData.project) applyProject(savedData.project as FullProject, chapter?.chapter_title);
      setStatus("Omslaget er lagret på boken.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Omslagsgenereringen feilet.");
    } finally {
      setCoverBusy(false);
    }
  }, [project, coverPrompt, coverUseOpenArt, chapter, applyProject]);

  const continueRewrite = useCallback(
    async (editionId: string) => {
      setRewriting(true);
      try {
        let remaining = 1;
        while (remaining > 0) {
          const res = await fetch("/api/publishing/author-studio", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ mode: "rewrite_continue", project_id: editionId }),
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(data.error || "Omskrivingen feilet.");
          remaining = Number(data.remaining || 0);
          if (data.project) applyProject(data.project as FullProject);
          setStatus(remaining > 0 ? `Skriver om… ${remaining} kapitler igjen.` : "Omskrivingen er ferdig! Kjør gjerne «Vurder kvalitet» og «Konsistenspass» etterpå.");
        }
        loadLibrary();
      } catch (error) {
        setStatus(error instanceof Error ? error.message : "Omskrivingen feilet — trykk «Fortsett omskriving» for å ta neste kapittel.");
      } finally {
        setRewriting(false);
      }
    },
    [applyProject, loadLibrary],
  );

  const startRewrite = useCallback(async () => {
    if (!project || !rewriteInstruction.trim()) return;
    setRewriting(true);
    setStatus("Planlegger den nye utgaven ut fra instruksen din…");
    try {
      const res = await fetch("/api/publishing/author-studio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "rewrite_book", project_id: project.id, instruction: rewriteInstruction.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.edition?.id) throw new Error(data.error || "Kunne ikke starte omskrivingen.");
      setShowRewrite(false);
      setRewriteInstruction("");
      setStatus(String(data.message || "Revidert utgave planlagt — skriver kapitlene…"));
      await openProject(String(data.edition.id));
      await continueRewrite(String(data.edition.id));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Kunne ikke starte omskrivingen.");
      setRewriting(false);
    }
  }, [project, rewriteInstruction, openProject, continueRewrite]);

  const writeNextChapter = useCallback(async () => {
    if (!project) return;
    setWritingNext(true);
    setStatus("Skriver neste kapittel: research → utkast → redaktørkritikk → revisjon. Tar 1–3 minutter…");
    try {
      const res = await fetch("/api/publishing/book-engine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "continue", id: project.id, chapter_count: 1 }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Kunne ikke skrive kapittelet.");
      if (data.project) applyProject(data.project as FullProject);
      setStatus(
        Number(data.added || 0) > 0
          ? "Nytt kapittel skrevet, kritisert og revidert. ★-score ligger på kapittelet."
          : String(data.warning || "Ingen nye kapitler — kapitteloversikten kan være ferdig skrevet."),
      );
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Kunne ikke skrive kapittelet.");
    } finally {
      setWritingNext(false);
    }
  }, [project, applyProject]);

  const runAddChapter = useCallback(async () => {
    if (!project || !addChapter.title.trim() || !addChapter.text.trim()) return;
    setAddingChapter(true);
    setStatus(addChapter.polish ? "AI-en polerer teksten i din stemme og legger inn kapittelet…" : "Legger inn kapittelet…");
    try {
      const res = await fetch("/api/publishing/author-studio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "add_chapter",
          project_id: project.id,
          chapter_title: addChapter.title.trim(),
          draft: addChapter.text,
          position: addChapter.position,
          polish: addChapter.polish,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Kunne ikke legge til kapittelet.");
      if (data.project) applyProject(data.project as FullProject, String(data.chapter_title || addChapter.title));
      setShowAddChapter(false);
      setAddChapter({ title: "", text: "", position: "start", polish: true });
      setStatus(`Kapittelet «${data.chapter_title}» er lagt inn ${addChapter.position === "start" ? "først" : "sist"} i boken.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Kunne ikke legge til kapittelet.");
    } finally {
      setAddingChapter(false);
    }
  }, [project, addChapter, applyProject]);

  const runSplitChapters = useCallback(async () => {
    if (!project) return;
    setStatus("AI-en leser manuset og finner kapittelgrensene — tar rundt et halvt minutt…");
    const data = await studioPost({ mode: "split_chapters", project_id: project.id }, "split");
    if (data) setStatus(`Manuset er delt i ${data.chapters} kapitler — nå kan du forbedre, endre og illustrere kapittel for kapittel.`);
  }, [project, studioPost]);

  const runConsistency = useCallback(async () => {
    if (!project) return;
    setStatus("Leser hele boken i sammenheng — dette tar gjerne et halvt minutt…");
    const data = await studioPost(
      { mode: "consistency_check", project_id: project.id },
      "consistency",
      chapter?.chapter_title,
    );
    if (data) {
      setShowConsistency(true);
      setStatus("Konsistenspasset er ferdig.");
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
    setImportError(null);
    setImportFileName(`Leser ${file.name}…`);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/publishing/book-engine/upload-source", { method: "POST", body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.content) throw new Error(data.error || `Kunne ikke lese filen (${res.status}).`);
      setImportText(String(data.content));
      setImportFileName(
        `${data.file_name} — ${Math.round(Number(data.char_count || 0) / 1000)}k tegn lest${data.truncated ? " (kuttet ved 120k)" : ""} ✓`,
      );
    } catch (error) {
      setImportFileName("");
      setImportError(error instanceof Error ? error.message : "Kunne ikke lese filen.");
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
      setImportError(null);
      setStatus(`Boken er hentet inn med ${data.chapters} kapitler.`);
      await loadLibrary();
      applyProject(data.project as FullProject);
    } catch (error) {
      setImportError(error instanceof Error ? error.message : "Importen feilet.");
    } finally {
      setImportBusy(false);
    }
  }, [importBookId, importText, importLanguage, loadLibrary, applyProject]);

  const deleteProject = useCallback(
    async (id: string, title: string) => {
      if (!window.confirm(`Slette kladden «${title}»? Dette kan ikke angres. Utgitte bøker påvirkes ikke.`)) return;
      setDeletingId(id);
      setStatus(null);
      try {
        const res = await fetch("/api/publishing/author-studio", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mode: "delete_project", project_id: id }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Slettingen feilet.");
        setStatus(`«${title}» er slettet.`);
        if (project?.id === id) setProject(null);
        await loadLibrary();
      } catch (error) {
        setStatus(error instanceof Error ? error.message : "Slettingen feilet.");
      } finally {
        setDeletingId(null);
      }
    },
    [project, loadLibrary],
  );

  const busy = Boolean(busyAction) || importBusy || writingNext || Boolean(creatingBook) || rewriting;
  const tocCount = project?.outline_plan?.toc?.length || 0;
  const chaptersRemaining = Math.max(0, tocCount - chapters.length);
  const isRewriteProject = Boolean(project?.metadata_plan?.rewrite_of);
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
            {chaptersRemaining > 0 && !project.parent_project_id && !isRewriteProject ? (
              <Button size="sm" onClick={writeNextChapter} disabled={busy}>
                {writingNext ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Feather className="mr-2 h-4 w-4" />}
                Skriv neste kapittel ({chaptersRemaining} igjen)
              </Button>
            ) : null}
            {isRewriteProject && chaptersRemaining > 0 ? (
              <Button size="sm" onClick={() => continueRewrite(project.id)} disabled={busy}>
                {rewriting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Wand2 className="mr-2 h-4 w-4" />}
                Fortsett omskriving ({chaptersRemaining} igjen)
              </Button>
            ) : null}
            {chapters.length > 0 && !isRewriteProject ? (
              <Button variant={showRewrite ? "secondary" : "outline"} size="sm" onClick={() => setShowRewrite((v) => !v)} disabled={busy}>
                <Wand2 className="mr-2 h-4 w-4" />
                Skriv på nytt
              </Button>
            ) : null}
            {chapters.length > 0 && chapters.length <= 3 && chapters.some((c) => wordsOf(c.draft) > 3500) ? (
              <Button size="sm" onClick={runSplitChapters} disabled={busy}>
                {busyAction === "split" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <BookOpen className="mr-2 h-4 w-4" />}
                Del opp i kapitler
              </Button>
            ) : null}
            <Button variant="outline" size="sm" onClick={runAnalyze} disabled={busy}>
              {busyAction === "analyze" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
              Analyser boken
            </Button>
            <Button variant="outline" size="sm" onClick={runFormatAll} disabled={busy}>
              {busyAction === "format" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Wand2 className="mr-2 h-4 w-4" />}
              Formater hele boken
            </Button>
            <Button variant="outline" size="sm" onClick={runScoreAll} disabled={busy}>
              {busyAction === "score" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
              Vurder kvalitet
            </Button>
            <Button variant="outline" size="sm" onClick={runConsistency} disabled={busy || chapters.length < 2}>
              {busyAction === "consistency" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <BookOpen className="mr-2 h-4 w-4" />}
              Konsistenspass
            </Button>
            <Button variant={showVoice ? "secondary" : "outline"} size="sm" onClick={() => setShowVoice((v) => !v)}>
              <Feather className="mr-2 h-4 w-4" />
              Min stemme
            </Button>
            <Button variant={showCover ? "secondary" : "outline"} size="sm" onClick={() => setShowCover((v) => !v)}>
              <ImageIcon className="mr-2 h-4 w-4" />
              Omslag
            </Button>
            <Button variant="outline" size="sm" asChild>
              <a href={`/api/publishing/book-engine/export-file?id=${encodeURIComponent(project.id)}&format=docx`}>Last ned DOCX</a>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <a href={`/api/publishing/book-engine/export-file?id=${encodeURIComponent(project.id)}&format=epub`}>EPUB</a>
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
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground hover:text-destructive"
              disabled={busy || deletingId === project.id}
              onClick={() => deleteProject(project.id, project.title)}
            >
              {deletingId === project.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
              Slett kladden
            </Button>
          </div>
        </div>

        {status ? <p className="text-sm rounded-md border bg-muted/40 px-3 py-2">{status}</p> : null}

        {showCover ? (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2"><ImageIcon className="h-4 w-4" /> Bokomslag</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {project.metadata_plan?.cover_image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={String(project.metadata_plan.cover_image_url)} alt="Bokomslag" className="max-h-72 rounded-md border" />
              ) : null}
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  className="flex-1 min-w-[260px]"
                  placeholder={String(project.metadata_plan?.cover_brief || "Beskriv omslaget — eller la stå tomt for automatisk konsept")}
                  value={coverPrompt}
                  onChange={(e) => setCoverPrompt(e.target.value)}
                />
                <label className="flex items-center gap-1 text-sm">
                  <input type="checkbox" checked={coverUseOpenArt} onChange={(e) => setCoverUseOpenArt(e.target.checked)} />
                  Bruk OpenArt
                </label>
                <Button size="sm" onClick={generateCover} disabled={coverBusy}>
                  {coverBusy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <ImageIcon className="mr-1 h-4 w-4" />}
                  {project.metadata_plan?.cover_image_url ? "Lag nytt omslag" : "Lag omslag"}
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : null}

        {showRewrite ? (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2"><Wand2 className="h-4 w-4" /> Skriv på nytt — forbedret og endret utgave</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <p className="text-xs text-muted-foreground">
                Lager en NY utgave av hele boken etter instruksen din — originalen røres ikke. AI-en planlegger revidert kapitteloversikt, gjenbruker substansen fra kapitlene som skal beholdes, og skriver nye kapitler der instruksen ber om det.
              </p>
              <textarea
                className="min-h-[110px] w-full rounded-md border bg-background p-3 text-sm"
                placeholder={'F.eks.: «Behold alle områdene som er omtalt, men utvid guiden med disse 5: Altea, Jávea, Moraira, Calpe og Benissa. Oppdater prisnivåene til 2026 og gjør tonen mer personlig.»'}
                value={rewriteInstruction}
                onChange={(e) => setRewriteInstruction(e.target.value)}
              />
              <div className="flex items-center gap-2">
                <Button size="sm" onClick={startRewrite} disabled={busy || !rewriteInstruction.trim()}>
                  {rewriting ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Wand2 className="mr-1 h-4 w-4" />}
                  Start omskrivingen
                </Button>
                <span className="text-xs text-muted-foreground">Skriver kapittel for kapittel — regn med ca. 1 min per kapittel.</span>
              </div>
            </CardContent>
          </Card>
        ) : null}

        {showVoice ? (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2"><Feather className="h-4 w-4" /> Min stemme</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <p className="text-xs text-muted-foreground">
                Lim inn 1–2 sider av din egen beste tekst. AI-en etterligner rytmen, tonen og temperamentet — ikke innholdet — i all skriving, utviding og forbedring på dette prosjektet.
              </p>
              <textarea
                className="min-h-[160px] w-full rounded-md border bg-background p-3 text-sm leading-relaxed"
                placeholder="Lim inn tekst du selv har skrevet og er stolt av…"
                value={voiceText}
                onChange={(e) => setVoiceText(e.target.value)}
              />
              <div className="flex items-center gap-2">
                <Button size="sm" onClick={saveVoice} disabled={busy}>
                  {busyAction === "voice" ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Save className="mr-1 h-4 w-4" />}
                  Lagre stemmen
                </Button>
                <span className="text-xs text-muted-foreground">{voiceText.trim() ? `${voiceText.trim().split(/\s+/).length} ord` : "Ingen stemmeprøve lagret ennå."}</span>
              </div>
            </CardContent>
          </Card>
        ) : null}

        {consistency && showConsistency ? (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base">
                Konsistenspass — hele boken i sammenheng
                {consistency.checked_at ? (
                  <span className="ml-2 text-xs font-normal text-muted-foreground">
                    {new Date(String(consistency.checked_at)).toLocaleString("nb-NO")}
                  </span>
                ) : null}
              </CardTitle>
              <Button variant="ghost" size="sm" onClick={() => setShowConsistency(false)}>Skjul</Button>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <p>{consistency.overall}</p>
              {(consistency.issues || []).length === 0 ? (
                <p className="text-muted-foreground">Ingen kryssende problemer funnet — boken henger sammen. 🎉</p>
              ) : (
                <div className="space-y-2">
                  {(consistency.issues || []).map((issue: any, i: number) => (
                    <div key={i} className="rounded-md border bg-muted/30 p-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        {String(issue.type || "").replace(/_/g, " ")}
                        {Array.isArray(issue.chapters) && issue.chapters.length > 0 ? ` · ${issue.chapters.join(" ↔ ")}` : ""}
                      </p>
                      <p className="mt-1">{issue.issue}</p>
                      {issue.fix ? <p className="mt-1 text-xs text-muted-foreground"><span className="font-semibold">Grep:</span> {issue.fix}</p> : null}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        ) : consistency && !showConsistency ? (
          <Button variant="ghost" size="sm" onClick={() => setShowConsistency(true)}>
            Vis siste konsistenspass ({(consistency.issues || []).length} funn)
          </Button>
        ) : null}

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
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base">Kapitler</CardTitle>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => setShowAddChapter((v) => !v)}
                disabled={busy || addingChapter}
              >
                + Nytt kapittel
              </Button>
            </CardHeader>
            <CardContent className="space-y-1">
              {showAddChapter ? (
                <div className="mb-2 space-y-2 rounded-md border p-3">
                  <Input
                    placeholder="Kapitteltittel — f.eks. «Om forfatteren»"
                    value={addChapter.title}
                    onChange={(e) => setAddChapter((a) => ({ ...a, title: e.target.value }))}
                  />
                  <textarea
                    className="min-h-[120px] w-full rounded-md border bg-background p-2 text-sm"
                    placeholder="Lim inn teksten til kapittelet her…"
                    value={addChapter.text}
                    onChange={(e) => setAddChapter((a) => ({ ...a, text: e.target.value }))}
                  />
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <select
                      className="h-8 rounded-md border bg-background px-2"
                      value={addChapter.position}
                      onChange={(e) => setAddChapter((a) => ({ ...a, position: e.target.value }))}
                    >
                      <option value="start">Først i boken</option>
                      <option value="end">Sist i boken</option>
                    </select>
                    <label className="flex items-center gap-1">
                      <input
                        type="checkbox"
                        checked={addChapter.polish}
                        onChange={(e) => setAddChapter((a) => ({ ...a, polish: e.target.checked }))}
                      />
                      Poler språket med AI (beholder alt innhold)
                    </label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button size="sm" onClick={runAddChapter} disabled={addingChapter || !addChapter.title.trim() || !addChapter.text.trim()}>
                      {addingChapter ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Feather className="mr-1 h-4 w-4" />}
                      Legg til kapittel
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setShowAddChapter(false)} disabled={addingChapter}>Avbryt</Button>
                  </div>
                </div>
              ) : null}
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
                    {c.quality?.score ? ` · ★ ${c.quality.score}/10` : ""}
                    {c.image_url ? " · 🖼" : ""}
                    {c.formatted ? " · ✓ formatert" : ""}
                  </span>
                </button>
              ))}
              {chapters.length === 0 ? (
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">
                    Ingen kapitler ennå. {project.parent_project_id ? "Kjør «Fortsett oversettelse» øverst." : tocCount > 0 ? "Trykk «Skriv neste kapittel» øverst for å komme i gang." : "Trykk knappen under, så lager AI-en kapitteloversikten og skriver første kapittel."}
                  </p>
                  {project.metadata_plan?.generation_warning ? (
                    <p className="text-xs text-amber-600 dark:text-amber-400">{String(project.metadata_plan.generation_warning)}</p>
                  ) : null}
                  {!project.parent_project_id && !isRewriteProject && tocCount === 0 ? (
                    <Button size="sm" onClick={generateOutlineNow} disabled={busy}>
                      {writingNext ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Feather className="mr-1 h-4 w-4" />}
                      Lag kapitteloversikt + skriv første kapittel
                    </Button>
                  ) : null}
                </div>
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
                  {chapter.quality?.score ? (
                    <div className="rounded-md border bg-muted/30 px-3 py-2 text-xs">
                      <span className="font-semibold">Redaktørens score: {chapter.quality.score}/10</span>
                      {(chapter.quality.notes || []).length > 0 ? (
                        <ul className="mt-1 list-disc pl-4 text-muted-foreground">
                          {(chapter.quality.notes || []).map((note, i) => <li key={i}>{note}</li>)}
                        </ul>
                      ) : null}
                    </div>
                  ) : null}
                  {chapter.last_edit?.summary ? (
                    <p className="text-xs text-muted-foreground">Siste AI-endring: {chapter.last_edit.summary}</p>
                  ) : null}
                  {chapter.research ? (
                    <details className="rounded-md border bg-muted/30 px-3 py-2 text-xs">
                      <summary className="cursor-pointer font-semibold">Research-notat (kildene bak kapittelet)</summary>
                      <pre className="mt-2 whitespace-pre-wrap font-sans text-muted-foreground">{chapter.research}</pre>
                    </details>
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
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={() => setShowNewBook((v) => !v)} disabled={Boolean(creatingBook)}>
            <Feather className="mr-2 h-4 w-4" />
            Ny bok
          </Button>
          <Button variant={showInterview ? "secondary" : "outline"} size="sm" onClick={() => setShowInterview((v) => !v)} disabled={Boolean(creatingBook)}>
            <Sparkles className="mr-2 h-4 w-4" />
            Intervju: finn vinkelen
          </Button>
          <Button variant={showImportManus ? "secondary" : "outline"} size="sm" onClick={() => setShowImportManus((v) => !v)} disabled={Boolean(creatingBook)}>
            <Upload className="mr-2 h-4 w-4" />
            Importer manus
          </Button>
          <Button variant="outline" size="sm" onClick={loadLibrary} disabled={libraryLoading}>
            {libraryLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            Oppdater
          </Button>
        </div>
      </div>

      {status ? <p className="text-sm rounded-md border bg-muted/40 px-3 py-2">{status}</p> : null}
      {creatingBook ? (
        <p className="text-sm rounded-md border border-primary/40 bg-primary/10 px-3 py-2 flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" /> {creatingBook}
        </p>
      ) : null}

      {showImportManus ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2"><Upload className="h-4 w-4" /> Importer manus — bok som ikke ligger i systemet</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Last opp en bok eller et manus (.pdf/.docx/.txt/.md) som ikke finnes i Publishing Hub fra før. Kapitler gjenkjennes automatisk, og manuset blir et prosjekt du kan forbedre, skrive om, oversette og eksportere.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <label className="inline-flex cursor-pointer items-center gap-1 rounded-md border px-3 py-1.5 text-sm hover:bg-muted">
                <Upload className="h-4 w-4" /> {importManusBusy && !importManus.content ? "Leser fil…" : "Velg fil"}
                <input
                  type="file"
                  accept=".pdf,.docx,.txt,.md"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleManusFile(file);
                    e.target.value = "";
                  }}
                />
              </label>
              {importManus.fileName ? <span className="text-xs text-muted-foreground">{importManus.fileName} ✓</span> : null}
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              <label className="text-sm md:col-span-1">
                <span className="mb-1 block font-medium">Tittel *</span>
                <Input value={importManus.title} onChange={(e) => setImportManus((m) => ({ ...m, title: e.target.value }))} placeholder="Bokens tittel" />
              </label>
              <label className="text-sm">
                <span className="mb-1 block font-medium">Sjanger</span>
                <select className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={importManus.genre} onChange={(e) => setImportManus((m) => ({ ...m, genre: e.target.value }))}>
                  {GENRES.map((g) => <option key={g.id} value={g.id}>{g.label}</option>)}
                </select>
              </label>
              <label className="text-sm">
                <span className="mb-1 block font-medium">Språk (som manuset er skrevet på)</span>
                <select className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={importManus.language} onChange={(e) => setImportManus((m) => ({ ...m, language: e.target.value }))}>
                  {LANGUAGES.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
                </select>
              </label>
            </div>
            <textarea
              className="min-h-[120px] w-full rounded-md border bg-background p-3 text-sm"
              placeholder="…eller lim inn manuskriptet her"
              value={importManus.content}
              onChange={(e) => setImportManus((m) => ({ ...m, content: e.target.value }))}
            />
            <div className="flex items-center gap-2">
              <Button size="sm" onClick={runImportManus} disabled={importManusBusy || !importManus.title.trim() || !importManus.content.trim()}>
                {importManusBusy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Upload className="mr-1 h-4 w-4" />}
                Importer til studioet
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setShowImportManus(false)} disabled={importManusBusy}>Avbryt</Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {showInterview ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2"><Sparkles className="h-4 w-4" /> Intervju — vi finner vinkelen sammen</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Fortell løst hva du har lyst å skrive om, så foreslår AI-en retninger med kommersielt potensial og stiller oppfølgingsspørsmål. Svarene blir til en ferdig bokplan i Ny bok-skjemaet.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <Input
                className="flex-1 min-w-[260px]"
                placeholder="F.eks. «en guide til å flytte til Costa Blanca» eller «barnebok om oliventreet Olivia»"
                value={interviewTheme}
                onChange={(e) => setInterviewTheme(e.target.value)}
              />
              <select
                className="h-9 rounded-md border bg-background px-2 text-sm"
                value={newBook.genre}
                onChange={(e) => setNewBook((b) => ({ ...b, genre: e.target.value }))}
              >
                {GENRES.map((g) => <option key={g.id} value={g.id}>{g.label}</option>)}
              </select>
              <Button size="sm" onClick={runInterview} disabled={interviewLoading || !interviewTheme.trim()}>
                {interviewLoading && !interviewData ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Sparkles className="mr-1 h-4 w-4" />}
                Start intervjuet
              </Button>
            </div>

            {interviewData ? (
              <div className="space-y-3">
                <div>
                  <p className="mb-1 text-sm font-semibold">1. Velg retning</p>
                  <div className="grid gap-2 md:grid-cols-2">
                    {interviewData.directions.map((d) => (
                      <label key={d.id} className={`cursor-pointer rounded-md border p-3 text-sm ${interviewDirection === d.id ? "border-primary bg-primary/10" : "hover:bg-muted/40"}`}>
                        <input type="radio" className="sr-only" name="direction" checked={interviewDirection === d.id} onChange={() => setInterviewDirection(d.id)} />
                        <span className="font-medium">{d.title}</span>
                        {d.promise ? <span className="mt-0.5 block text-xs text-muted-foreground">{d.promise}</span> : null}
                        {d.audience ? <span className="mt-0.5 block text-xs text-muted-foreground">Målgruppe: {d.audience}</span> : null}
                      </label>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="mb-1 text-sm font-semibold">2. Svar på det du vil (alt er valgfritt)</p>
                  <div className="space-y-2">
                    {interviewData.questions.map((q, i) => (
                      <label key={i} className="block text-sm">
                        <span className="mb-1 block text-xs text-muted-foreground">{q}</span>
                        <Input value={interviewAnswers[i] || ""} onChange={(e) => setInterviewAnswers((a) => ({ ...a, [i]: e.target.value }))} placeholder="Svar kort — eller hopp over" />
                      </label>
                    ))}
                  </div>
                </div>
                <Button size="sm" onClick={finishInterview} disabled={interviewLoading || !interviewDirection}>
                  {interviewLoading ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Feather className="mr-1 h-4 w-4" />}
                  Lag bokplan av intervjuet
                </Button>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {showNewBook ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2"><Feather className="h-4 w-4" /> Ny bok</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-3 md:grid-cols-2">
              <label className="text-sm">
                <span className="mb-1 block font-medium">Tittel / arbeidstittel *</span>
                <Input value={newBook.title} onChange={(e) => setNewBook((b) => ({ ...b, title: e.target.value }))} placeholder="F.eks. «Olivenolje for nybegynnere»" />
              </label>
              <label className="text-sm">
                <span className="mb-1 block font-medium">Målgruppe</span>
                <Input value={newBook.audience} onChange={(e) => setNewBook((b) => ({ ...b, audience: e.target.value }))} placeholder="F.eks. helsebevisste lesere 40+" />
              </label>
              <label className="text-sm">
                <span className="mb-1 block font-medium">Sjanger</span>
                <select
                  className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                  value={newBook.genre}
                  onChange={(e) => setNewBook((b) => ({ ...b, genre: e.target.value }))}
                >
                  {GENRES.map((g) => <option key={g.id} value={g.id}>{g.label}</option>)}
                </select>
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="text-sm">
                  <span className="mb-1 block font-medium">Språk</span>
                  <select
                    className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                    value={newBook.language}
                    onChange={(e) => setNewBook((b) => ({ ...b, language: e.target.value }))}
                  >
                    {LANGUAGES.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
                  </select>
                </label>
                <label className="text-sm">
                  <span className="mb-1 block font-medium">Sider (ca.)</span>
                  <Input
                    type="number"
                    min={30}
                    max={400}
                    value={newBook.pages}
                    onChange={(e) => setNewBook((b) => ({ ...b, pages: Math.max(30, Math.min(400, Number(e.target.value) || 150)) }))}
                  />
                </label>
              </div>
            </div>
            <label className="block text-sm">
              <span className="mb-1 block font-medium">Hva skal boken handle om? Hva skal leseren sitte igjen med?</span>
              <textarea
                className="min-h-[110px] w-full rounded-md border bg-background p-3 text-sm"
                placeholder="Jo mer konkret du er om vinkling, innhold og hva som gjør boken annerledes, desto bedre blir kapitteloversikten og teksten."
                value={newBook.brief}
                onChange={(e) => setNewBook((b) => ({ ...b, brief: e.target.value }))}
              />
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <label className="inline-flex cursor-pointer items-center gap-1 rounded-md border px-3 py-1.5 text-sm hover:bg-muted">
                <Upload className="h-4 w-4" /> {sourceUploading ? "Leser fil…" : "Last opp grunnlag (.pdf/.docx/.txt/.md)"}
                <input
                  type="file"
                  accept=".pdf,.docx,.txt,.md"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleNewBookFile(file);
                    e.target.value = "";
                  }}
                />
              </label>
              {newBookSource ? (
                <span className="text-xs text-muted-foreground">
                  {newBookSource.name} ✓ — brukes som kildemateriale for et forbedret manus
                  <button className="ml-2 underline" onClick={() => setNewBookSource(null)}>fjern</button>
                </span>
              ) : null}
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" onClick={createBook} disabled={!newBook.title.trim() || Boolean(creatingBook)}>
                {creatingBook ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Feather className="mr-1 h-4 w-4" />}
                Opprett og skriv første kapittel
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setShowNewBook(false)} disabled={Boolean(creatingBook)}>Avbryt</Button>
              <span className="text-xs text-muted-foreground">AI-en lager kapitteloversikt og skriver første kapittel (2–4 min).</span>
            </div>
          </CardContent>
        </Card>
      ) : null}
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
                  <div className="flex items-center gap-1">
                    <Badge variant="outline">{STATUS_LABELS[String(p.status)] || p.status}</Badge>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                      title="Slett kladden"
                      disabled={deletingId === p.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteProject(p.id, p.title);
                      }}
                    >
                      {deletingId === p.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                    </Button>
                  </div>
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
                        Lim inn manuskriptet, eller last opp .pdf/.docx/.txt/.md. Kapitler gjenkjennes automatisk.
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
                            accept=".pdf,.docx,.txt,.md"
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
                        <Button size="sm" variant="ghost" onClick={() => { setImportBookId(null); setImportError(null); }}>Avbryt</Button>
                      </div>
                      {importError ? (
                        <p className="text-xs text-destructive rounded-md border border-destructive/40 bg-destructive/10 px-2 py-1.5">
                          {importError}
                        </p>
                      ) : null}
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
