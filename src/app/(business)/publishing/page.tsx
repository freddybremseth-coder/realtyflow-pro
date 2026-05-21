"use client";

import { useEffect, useMemo, useState } from "react";
import { BookOpen, CheckCircle2, ExternalLink, Loader2, Plus, RefreshCw, Sparkles, Target, TrendingUp, Upload } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

type PublishingBook = {
  id: string;
  brand_id?: string | null;
  title: string;
  subtitle?: string | null;
  asin?: string | null;
  format?: string | null;
  marketplace?: string | null;
  amazon_url?: string | null;
  niche?: string | null;
  series_name?: string | null;
  role?: string | null;
  status?: string | null;
  price?: number | null;
  currency?: string | null;
  reviews_count?: number | null;
  average_rating?: number | null;
  best_sellers_rank?: number | null;
  main_category?: string | null;
  keywords?: string[] | null;
  ad_spend?: number | null;
  clicks?: number | null;
  orders?: number | null;
  royalties?: number | null;
  acos?: number | null;
  next_action?: string | null;
  priority?: number | null;
  notes?: string | null;
  synthetic?: boolean;
};

type PublishingRecommendation = {
  id: string;
  type: "portfolio" | "metadata" | "reviews" | "ads" | "launch" | "funnel" | "cleanup";
  priority: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  ai_score: number;
  title: string;
  description: string;
  impact: string;
  effort: "low" | "medium" | "high";
  next_action: string;
  book_id?: string;
  book_title?: string;
};

type BusinessOverviewTotals = {
  publishingBooks?: number;
  publishingOrders?: number;
  publishingRoyalties?: number;
  saasMrr?: number;
  oliviaNetProfit?: number;
};

type PublishingImpact = {
  hard_mode?: boolean;
  totals?: {
    books: number;
    orders: number;
    royalties: number;
    reviews: number;
    average_rating: number | null;
  };
  latest_import?: {
    total_orders?: number;
    total_royalties?: number;
    currency?: string;
    created_at?: string;
  } | null;
  import_delta?: {
    orders: number;
    royalties: number;
  } | null;
  no_sales_books?: Array<{ id: string; title: string; role: string }>;
};

type PublishingAutopilotRun = {
  id: string;
  status: "success" | "error";
  created_at: string;
  processed: number;
  moved_to_review: number;
  suggestions_created: number;
  created_draft_ids: string[];
  items: Array<{ id: string; status: string; error?: string }>;
  error?: string | null;
};

type BookEngineProject = {
  id: string;
  title: string;
  subtitle?: string | null;
  language?: string | null;
  target_words?: number | null;
  target_pages?: number | null;
  status?: string | null;
  metadata_plan?: Record<string, any>;
  outline_plan?: Record<string, any>;
  chapter_drafts?: Array<{ chapter_title?: string; draft?: string }>;
  created_at: string;
};

type MarketSnapshot = {
  id: string;
  query: string;
  total_results_estimate?: number | null;
  summary?: { top_count?: number; avg_reviews?: number; avg_rating?: number; error?: string };
  created_at: string;
};

type WorkshopDirection = {
  id: string;
  title: string;
  audience: string;
  promise: string;
  commercial_potential: "high" | "medium" | "low";
  notes: string;
};

const kdpTasks = [
  {
    title: "Optimaliser The Olive Oil Cure metadata",
    description: "Oppdater undertittel, tryggere description, 7 backend keywords og relevante KDP-kategorier.",
    priority: "CRITICAL",
    next_action: "Bruk Mediterranean/EVOO/polyphenols/heart-conscious vinkling uten medisinske garantier.",
  },
  {
    title: "Bestill nytt Amazon-thumbnail cover",
    description: "Coveret må fungere i liten Amazon-størrelse og se premium, troverdig og Mediterranean ut.",
    priority: "HIGH",
    next_action: "Lag cover-brief og test 2-3 retninger før opplasting.",
  },
  {
    title: "Sett opp Book Growth Dashboard",
    description: "Spor ASIN, pris, reviews, rating, BSR, keywords, ad spend, klikk, ordre, royalty og neste handling.",
    priority: "HIGH",
    next_action: "Start med olivenolje-bøkene og oppdater ukentlig.",
  },
  {
    title: "Bygg early reader team",
    description: "Lag nøytral review-flyt: gratis/early copy, feedback og frivillig ærlig review uten incentiver for rating.",
    priority: "HIGH",
    next_action: "Endre review-program tekst til feedback/optional honest review.",
  },
  {
    title: "Start lavbudsjett Amazon Ads-test",
    description: "Kjør automatic, manual keyword og product targeting for å finne reelle søkeord og konkurrent-ASINs.",
    priority: "MEDIUM",
    next_action: "Start først etter at cover, description og preview er ryddet.",
  },
  {
    title: "Planlegg Mediterranean Olive Oil Cookbook",
    description: "Ny kommersiell frontbok med 100 recipes, 14-day meal plan og EVOO guide.",
    priority: "HIGH",
    next_action: "Lag disposisjon, konkurrentanalyse og launch-plan før manusproduksjon.",
  },
  {
    title: "Lag lead magnet for alle olivenolje-bøker",
    description: "Free checklist: 7 Signs Your Olive Oil Is Low Quality. Bruk den til email list, review loop og Doña Anna.",
    priority: "HIGH",
    next_action: "Legg lenke i starten og slutten av Kindle-bøkene.",
  },
];

const series = [
  "The Olive Oil Cure / EVOO Guide",
  "Premium Olive Oil",
  "Mediterranean Olive Oil Cookbook for Beginners",
  "Olive Oil Quality Checklist",
];

const authorPlatform = {
  name: "Mediterraneo Vital",
  positioning: "Health, longevity and sustainable living from the Mediterranean olive grove.",
  promise:
    "Hjelpe lesere å forstå ekte middelhavsliv, extra virgin olive oil, polyfenoler, sunnere matvalg og et roligere liv i Spania.",
  primaryAudience: "Health-conscious readers 40+, Mediterranean diet readers, expats, food lovers and Doña Anna followers.",
  commercialPriority: "The Olive Oil Cure først, deretter Mediterranean Olive Oil Cookbook for Beginners.",
};

function getAuditScore(book: PublishingBook) {
  let score = 0;
  const checks = [
    { ok: Boolean(book.title), label: "tittel" },
    { ok: Boolean(book.subtitle && book.subtitle.length > 35), label: "undertittel" },
    { ok: Boolean(book.asin), label: "ASIN" },
    { ok: Boolean(book.main_category), label: "kategori" },
    { ok: Boolean(book.keywords && book.keywords.length >= 5), label: "keywords" },
    { ok: Number(book.reviews_count || 0) >= 10, label: "reviews" },
    { ok: Number(book.price || 0) > 0, label: "pris" },
    { ok: Boolean(book.amazon_url), label: "Amazon-lenke" },
    { ok: Boolean(book.next_action), label: "neste handling" },
    { ok: ["front_product", "next_launch", "support", "lead_magnet", "authority_book", "secondary", "parked"].includes(String(book.role || "")), label: "rolle" },
  ];

  for (const check of checks) {
    if (check.ok) score += 10;
  }

  const missing = checks.filter((check) => !check.ok).map((check) => check.label);
  return { score, missing };
}

function getBookStrategy(book: PublishingBook) {
  const role = String(book.role || "support");
  if (role === "front_product") return "Selge og validere hovedplattformen. Denne må ha best cover, metadata, reviews og Ads-test.";
  if (role === "next_launch") return "Neste kommersielle lansering. Bruk konkurrentanalyse og søkedata før manus bygges ferdig.";
  if (role === "lead_magnet") return "Bygge e-postliste og reader team. Ikke optimaliser primært for royalties.";
  if (role === "authority_book") return "Autoritetsbok som skal skape leads og tillit, ikke nødvendigvis mest Amazon-royalty.";
  if (role === "secondary") return "Sekundær bok. Hold oversikt og rydd metadata, men vent med aktiv trafikkbudsjett.";
  if (role === "parked") return "Ikke bruk trafikkbudsjett nå. Behold i systemet, men prioriter ikke aktivt.";
  return "Støttebok som bygger autoritet, intern trafikk og mer dybde rundt hovedplattformen.";
}

export default function PublishingHubPage() {
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState(0);
  const [books, setBooks] = useState<PublishingBook[]>([]);
  const [booksLoading, setBooksLoading] = useState(true);
  const [booksSynthetic, setBooksSynthetic] = useState(false);
  const [booksTableNotReady, setBooksTableNotReady] = useState(false);
  const [booksDbError, setBooksDbError] = useState("");
  const [booksSupabaseHost, setBooksSupabaseHost] = useState("");
  const [showNewBook, setShowNewBook] = useState(false);
  const [savingBook, setSavingBook] = useState(false);
  const [importingReport, setImportingReport] = useState(false);
  const [hubStatus, setHubStatus] = useState<string | null>(null);
  const [recommendations, setRecommendations] = useState<PublishingRecommendation[]>([]);
  const [recommendationsLoading, setRecommendationsLoading] = useState(false);
  const [recommendationsSynthetic, setRecommendationsSynthetic] = useState(false);
  const [sendingRecommendationId, setSendingRecommendationId] = useState<string | null>(null);
  const [sendingBookId, setSendingBookId] = useState<string | null>(null);
  const [businessTotals, setBusinessTotals] = useState<BusinessOverviewTotals | null>(null);
  const [autopilotRuns, setAutopilotRuns] = useState<PublishingAutopilotRun[]>([]);
  const [autopilotLoading, setAutopilotLoading] = useState(false);
  const [impact, setImpact] = useState<PublishingImpact | null>(null);
  const [impactLoading, setImpactLoading] = useState(false);
  const [hardModeSaving, setHardModeSaving] = useState(false);
  const [bookEngineLoading, setBookEngineLoading] = useState(false);
  const [bookEngineGenerating, setBookEngineGenerating] = useState(false);
  const [bookSourceUploading, setBookSourceUploading] = useState(false);
  const [continuingBookEngineId, setContinuingBookEngineId] = useState<string | null>(null);
  const [generatingBookImagesId, setGeneratingBookImagesId] = useState<string | null>(null);
  const [exportingBookEngineId, setExportingBookEngineId] = useState<string | null>(null);
  const [preparingLanguageVersionId, setPreparingLanguageVersionId] = useState<string | null>(null);
  const [retryingBookEngineId, setRetryingBookEngineId] = useState<string | null>(null);
  const [savingProjectSeriesId, setSavingProjectSeriesId] = useState<string | null>(null);
  const [projectSeriesDrafts, setProjectSeriesDrafts] = useState<Record<string, string>>({});
  const [bookEngineProjects, setBookEngineProjects] = useState<BookEngineProject[]>([]);
  const [marketLoading, setMarketLoading] = useState(false);
  const [marketSnapshots, setMarketSnapshots] = useState<MarketSnapshot[]>([]);
  const [workshopLoading, setWorkshopLoading] = useState(false);
  const [workshopPlanning, setWorkshopPlanning] = useState(false);
  const [workshopTheme, setWorkshopTheme] = useState("");
  const [workshopDirections, setWorkshopDirections] = useState<WorkshopDirection[]>([]);
  const [workshopQuestions, setWorkshopQuestions] = useState<string[]>([]);
  const [workshopAnswers, setWorkshopAnswers] = useState<string[]>([]);
  const [workshopGoals, setWorkshopGoals] = useState<string[]>([]);
  const [selectedDirection, setSelectedDirection] = useState("");
  const [workshopContentFocus, setWorkshopContentFocus] = useState("");
  const [workshopStyle, setWorkshopStyle] = useState("practical");
  const [bookEngineInput, setBookEngineInput] = useState({
    title: "The Mediterranean Olive Oil Cookbook for Beginners",
    subtitle: "100 Simple Anti-Inflammatory Recipes, 14-Day Meal Plan and EVOO Guide",
    genre: "guide",
    series_name: "Mediterranean Olive Oil",
    language: "en",
    target_pages: "180",
    target_words: "32000",
    illustration_style: "animation",
    recurring_characters: "",
    consistency_notes: "",
    source_mode: "from_brief",
    source_instructions: "",
    source_material: "",
    audience: "Health-conscious readers 40+ who want practical Mediterranean habits",
    positioning: "Practical, science-aware, no-hype Mediterranean olive oil guide",
    seed_keywords: "mediterranean diet for beginners, extra virgin olive oil guide, anti inflammatory eating, heart healthy mediterranean diet, polyphenols antioxidants",
  });
  const [newBook, setNewBook] = useState({
    title: "",
    subtitle: "",
    asin: "",
    series_name: "",
    format: "kindle",
    role: "support",
    status: "audit",
    price: "",
    reviews_count: "0",
    average_rating: "",
    best_sellers_rank: "",
    main_category: "",
    keywords: "",
    next_action: "",
    priority: "70",
    notes: "",
  });

  const seriesOptions = useMemo(
    () => Array.from(new Set(books.map((b) => (b.series_name || "").trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b)),
    [books],
  );

  const totals = useMemo(() => {
    const adSpend = books.reduce((sum, book) => sum + Number(book.ad_spend || 0), 0);
    const royalties = books.reduce((sum, book) => sum + Number(book.royalties || 0), 0);
    const orders = books.reduce((sum, book) => sum + Number(book.orders || 0), 0);
    const reviews = books.reduce((sum, book) => sum + Number(book.reviews_count || 0), 0);
    const active = books.filter((book) => ["launch", "active", "optimize"].includes(String(book.status || ""))).length;
    return { adSpend, royalties, orders, reviews, active };
  }, [books]);

  async function loadBooks() {
    setBooksLoading(true);
    try {
      const res = await fetch("/api/publishing/books", { cache: "no-store" });
      const data = await res.json();
      setBooks(data.books || []);
      setBooksSynthetic(Boolean(data.synthetic));
      setBooksTableNotReady(Boolean(data.tableNotReady));
      setBooksDbError(data.dbError || "");
      setBooksSupabaseHost(data.supabaseHost || "");
    } catch (err) {
      console.error("Could not load publishing books:", err);
    } finally {
      setBooksLoading(false);
    }
  }

  async function loadRecommendations() {
    setRecommendationsLoading(true);
    try {
      const res = await fetch("/api/publishing/recommendations", { cache: "no-store" });
      const data = await res.json();
      setRecommendations(data.recommendations || []);
      setRecommendationsSynthetic(Boolean(data.synthetic));
    } catch (err) {
      console.error("Could not load publishing recommendations:", err);
      setHubStatus("Kunne ikke hente Amazon/KDP-anbefalinger.");
    } finally {
      setRecommendationsLoading(false);
    }
  }

  async function loadBusinessOverviewTotals() {
    try {
      const res = await fetch("/api/business/overview", { cache: "no-store" });
      const data = await res.json();
      setBusinessTotals(data.totals || null);
    } catch (err) {
      console.error("Could not load shared business overview totals:", err);
    }
  }

  async function loadAutopilotResults() {
    setAutopilotLoading(true);
    try {
      const res = await fetch("/api/publishing/autopilot-results", { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setHubStatus(data.error || "Kunne ikke hente autopilot-resultater.");
        return;
      }
      setAutopilotRuns(data.runs || []);
    } catch (err) {
      console.error("Could not load autopilot results:", err);
    } finally {
      setAutopilotLoading(false);
    }
  }

  async function loadImpact() {
    setImpactLoading(true);
    try {
      const res = await fetch("/api/publishing/impact", { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (res.ok) setImpact(data);
      else setHubStatus(data.error || "Kunne ikke hente KDP impact.");
    } catch (err) {
      console.error("Could not load impact:", err);
    } finally {
      setImpactLoading(false);
    }
  }

  async function loadBookEngineProjects() {
    setBookEngineLoading(true);
    try {
      const res = await fetch("/api/publishing/book-engine", { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setHubStatus(data.error || "Kunne ikke hente Book Engine-prosjekter.");
        return;
      }
      setBookEngineProjects(data.projects || []);
      if (data.tableNotReady) {
        setHubStatus("Book Engine-tabellen mangler. Kjør migrasjon 20260519142000_publishing_book_engine.sql.");
      }
    } catch (err) {
      console.error("Could not load book engine projects:", err);
    } finally {
      setBookEngineLoading(false);
    }
  }

  async function generateBookEngineProject() {
    setBookEngineGenerating(true);
    setHubStatus(null);
    try {
      const createRes = await fetch("/api/publishing/book-engine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...bookEngineInput,
          brand_id: "freddypublishing",
          target_pages: Number(bookEngineInput.target_pages || 180),
          target_words: Number(bookEngineInput.target_words || 32000),
        }),
      });
      const createData = await createRes.json().catch(() => ({}));
      if (!createRes.ok) {
        setHubStatus(createData.error || "Book Engine feilet.");
        return;
      }

      const projectId = String(createData?.project?.id || "").trim();
      if (!projectId) {
        setHubStatus("Prosjekt ble opprettet uten id. Prøv igjen.");
        return;
      }

      setHubStatus("Prosjekt opprettet. Kjører SEO-plan...");
      const seoRes = await fetch("/api/publishing/book-engine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "generate_seo", id: projectId }),
      });
      const seoData = await seoRes.json().catch(() => ({}));
      if (!seoRes.ok) {
        setHubStatus(seoData.error || "SEO-generering feilet. Prosjektet ligger klart for retry.");
        await loadBookEngineProjects();
        return;
      }

      setHubStatus("SEO-plan ferdig. Lager bokstruktur og kapittelutkast...");
      const authorRes = await fetch("/api/publishing/book-engine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "generate_author", id: projectId }),
      });
      const authorData = await authorRes.json().catch(() => ({}));
      if (!authorRes.ok) {
        setHubStatus(authorData.error || "Forfatterplan feilet. Prosjektet ligger klart for retry.");
        await loadBookEngineProjects();
        return;
      }

      setHubStatus("Book Engine v1 har laget SEO-plan + bokstruktur + kapittelutkast.");
      await loadBookEngineProjects();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Book Engine feilet.";
      if (message.toLowerCase().includes("failed to fetch")) {
        setHubStatus("Nettverksavbrudd under generering. Trykk Oppdater og bruk Prøv igjen på prosjektet.");
      } else {
        setHubStatus(message);
      }
    } finally {
      setBookEngineGenerating(false);
    }
  }

  async function uploadBookSourceFile(file?: File | null) {
    if (!file) return;
    setBookSourceUploading(true);
    setHubStatus(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/publishing/book-engine/upload-source", { method: "POST", body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setHubStatus(data.error || "Kunne ikke lese kildefilen.");
        return;
      }
      setBookEngineInput((prev) => ({
        ...prev,
        source_material: String(data.content || ""),
      }));
      setHubStatus(
        `Kildetekst lastet inn (${data.file_name}, ${Number(data.char_count || 0).toLocaleString("nb-NO")} tegn${data.truncated ? ", trimmet" : ""}).`,
      );
    } catch (err) {
      setHubStatus(err instanceof Error ? err.message : "Kunne ikke laste opp kildefil.");
    } finally {
      setBookSourceUploading(false);
    }
  }

  async function exportBookEngineProject(projectId: string, format: "md" | "docx" | "epub" = "md") {
    setExportingBookEngineId(projectId);
    setHubStatus(null);
    try {
      if (format === "md") {
        const res = await fetch(`/api/publishing/book-engine/export?id=${encodeURIComponent(projectId)}`, { cache: "no-store" });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setHubStatus(data.error || "Kunne ikke eksportere manuspakke.");
          return;
        }
        const text = String(data.markdown || "");
        const fileName = String(data.file_name || "book-engine-manuspakke.md");
        const blob = new Blob([text], { type: "text/markdown;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        setHubStatus(`Manuspakke lastet ned (${fileName}).`);
        return;
      }

      const res = await fetch(
        `/api/publishing/book-engine/export-file?id=${encodeURIComponent(projectId)}&format=${format}`,
        { cache: "no-store" },
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setHubStatus(data.error || `Kunne ikke eksportere ${format}.`);
        return;
      }
      const blob = await res.blob();
      const fileName = res.headers.get("content-disposition")?.match(/filename=\"?([^"]+)\"?/)?.[1] || `book.${format}`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setHubStatus(`${format.toUpperCase()} lastet ned (${fileName}).`);
    } catch (err) {
      setHubStatus(err instanceof Error ? err.message : "Kunne ikke eksportere manuspakke.");
    } finally {
      setExportingBookEngineId(null);
    }
  }

  async function continueBookEngineProject(projectId: string) {
    setContinuingBookEngineId(projectId);
    setHubStatus(null);
    try {
      const res = await fetch("/api/publishing/book-engine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "continue", id: projectId, chapter_count: 2 }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setHubStatus(data.error || "Kunne ikke fortsette bokutkastet.");
        return;
      }
      setHubStatus(`La til ${Number(data.added || 0)} nye kapittelutkast.`);
      await loadBookEngineProjects();
    } catch (err) {
      setHubStatus(err instanceof Error ? err.message : "Kunne ikke fortsette bokutkastet.");
    } finally {
      setContinuingBookEngineId(null);
    }
  }

  function prepareLanguageVersion(project: BookEngineProject) {
    const targetLanguage = window.prompt("Målspråk (f.eks. en, no, es, de, fr):", "es");
    if (!targetLanguage) return;
    const chapterDrafts = Array.isArray(project.chapter_drafts) ? project.chapter_drafts : [];
    const sourceText = chapterDrafts
      .map((ch, i) => `# ${ch.chapter_title || `Kapittel ${i + 1}`}\n\n${ch.draft || ""}`)
      .join("\n\n");
    setPreparingLanguageVersionId(project.id);
    try {
      setBookEngineInput((prev) => ({
        ...prev,
        title: String(project.title || prev.title),
        subtitle: String(project.subtitle || prev.subtitle || ""),
        language: targetLanguage.trim().toLowerCase(),
        genre: String((project as any).genre || prev.genre || "guide"),
        series_name: String((project as any).series_name || prev.series_name || ""),
        source_mode: "rewrite",
        source_material: sourceText || prev.source_material,
        source_instructions:
          `Oversett og lokaliser boken til ${targetLanguage.trim().toLowerCase()}. ` +
          `Behold struktur, budskap og stemme, men tilpass uttrykk naturlig for målspråket.`,
      }));
      setHubStatus(`Språkversjon klargjort (${targetLanguage.trim().toLowerCase()}). Trykk Generer bok.`);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } finally {
      setPreparingLanguageVersionId(null);
    }
  }

  async function retryBookEngineProject(projectId: string) {
    setRetryingBookEngineId(projectId);
    setHubStatus(null);
    try {
      const res = await fetch("/api/publishing/book-engine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "retry_generation", id: projectId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setHubStatus(data.error || "Kunne ikke prøve generering på nytt.");
        return;
      }
      setHubStatus(data.warning ? `Retry fullført med varsel: ${data.warning}` : "Generering prøvd på nytt.");
      await loadBookEngineProjects();
    } catch (err) {
      setHubStatus(err instanceof Error ? err.message : "Kunne ikke prøve generering på nytt.");
    } finally {
      setRetryingBookEngineId(null);
    }
  }

  async function saveBookEngineSeries(projectId: string) {
    const seriesName = String(projectSeriesDrafts[projectId] || "").trim();
    setSavingProjectSeriesId(projectId);
    setHubStatus(null);
    try {
      const res = await fetch("/api/publishing/book-engine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "update_project", id: projectId, series_name: seriesName }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setHubStatus(data.error || "Kunne ikke lagre serie på bokprosjektet.");
        return;
      }
      setHubStatus("Serie lagret på bokprosjektet.");
      await loadBookEngineProjects();
    } catch (err) {
      setHubStatus(err instanceof Error ? err.message : "Kunne ikke lagre serie.");
    } finally {
      setSavingProjectSeriesId(null);
    }
  }

  async function generateBookImages(projectId: string) {
    setGeneratingBookImagesId(projectId);
    setHubStatus(null);
    try {
      const res = await fetch("/api/publishing/book-engine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "generate_images", id: projectId, batch_limit: 4 }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setHubStatus(data.error || "Kunne ikke generere bokbilder.");
        return;
      }
      setHubStatus(
        `Genererte ${Number(data.generated || 0)} bilder, feilet ${Number(data.failed || 0)}. Gjenstår: ${Number(data.remaining || 0)}.`,
      );
      await loadBookEngineProjects();
    } catch (err) {
      setHubStatus(err instanceof Error ? err.message : "Kunne ikke generere bokbilder.");
    } finally {
      setGeneratingBookImagesId(null);
    }
  }

  async function loadMarketWatch() {
    setMarketLoading(true);
    try {
      const res = await fetch("/api/publishing/market-watch", { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setHubStatus(data.error || "Kunne ikke hente Market Watch.");
        return;
      }
      setMarketSnapshots(data.snapshots || []);
      if (data.tableNotReady) {
        setHubStatus("Market Watch-tabellen mangler. Kjør migrasjon 20260519150000_publishing_market_watch.sql.");
      }
    } catch (err) {
      console.error("Could not load market watch:", err);
    } finally {
      setMarketLoading(false);
    }
  }

  async function runWorkshopDiscovery() {
    if (!workshopTheme.trim()) return;
    setWorkshopLoading(true);
    setHubStatus(null);
    try {
      const res = await fetch("/api/publishing/book-engine/workshop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "discover",
          theme: workshopTheme,
          genre: bookEngineInput.genre || "guide",
          illustration_style: bookEngineInput.illustration_style || "",
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setHubStatus(data.error || "Workshop discovery feilet.");
        return;
      }
      setWorkshopDirections(data.directions || []);
      setWorkshopQuestions(data.questions || []);
      setWorkshopAnswers((data.questions || []).map(() => ""));
      setWorkshopGoals(data.goals || []);
      setSelectedDirection((data.directions || [])[0]?.title || "");
      setHubStatus("AI-workshop klar. Velg retning og lag bokplan.");
    } catch (err) {
      setHubStatus(err instanceof Error ? err.message : "Workshop discovery feilet.");
    } finally {
      setWorkshopLoading(false);
    }
  }

  async function buildWorkshopPlan() {
    if (!workshopTheme.trim()) return;
    setWorkshopPlanning(true);
    setHubStatus(null);
    try {
      const res = await fetch("/api/publishing/book-engine/workshop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "plan",
          theme: workshopTheme,
          selected_direction: selectedDirection,
          genre: bookEngineInput.genre || "guide",
          series_name: bookEngineInput.series_name || "",
          goals: workshopGoals,
          question_answers: workshopQuestions.map((q, i) => ({ question: q, answer: String(workshopAnswers[i] || "").trim() })).filter((row) => row.answer),
          content_focus: workshopContentFocus,
          style: workshopStyle,
          length_pages: Number(bookEngineInput.target_pages || 180),
          language: bookEngineInput.language || "en",
        }),
      });
      const plan = await res.json().catch(() => ({}));
      if (!res.ok) {
        setHubStatus(plan.error || "Kunne ikke lage bokplan.");
        return;
      }
      setBookEngineInput((prev) => ({
        ...prev,
        title: String(plan.title || prev.title),
        subtitle: String(plan.subtitle || prev.subtitle),
        audience: String(plan.audience || prev.audience),
        positioning: String(plan.positioning || prev.positioning),
        target_pages: String(plan.target_pages || prev.target_pages),
        target_words: String(plan.target_words || prev.target_words),
        seed_keywords: Array.isArray(plan.seed_keywords) ? plan.seed_keywords.join(", ") : prev.seed_keywords,
      }));
      setHubStatus("Bokplan bygget. Sjekk feltene og trykk Generer bok.");
    } catch (err) {
      setHubStatus(err instanceof Error ? err.message : "Kunne ikke lage bokplan.");
    } finally {
      setWorkshopPlanning(false);
    }
  }

  async function setHardMode(enabled: boolean) {
    setHardModeSaving(true);
    setHubStatus(null);
    try {
      const res = await fetch("/api/publishing/hard-mode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setHubStatus(data.error || "Kunne ikke endre Hard Mode.");
        return;
      }
      setHubStatus(enabled ? "Hard Mode aktivert for Publishing Growth Loop." : "Hard Mode deaktivert.");
      await loadImpact();
    } catch (err) {
      setHubStatus(err instanceof Error ? err.message : "Kunne ikke endre Hard Mode.");
    } finally {
      setHardModeSaving(false);
    }
  }

  useEffect(() => {
    loadBooks();
    loadRecommendations();
    loadBusinessOverviewTotals();
    loadAutopilotResults();
    loadImpact();
    loadBookEngineProjects();
    loadMarketWatch();
  }, []);

  useEffect(() => {
    setProjectSeriesDrafts((prev) => {
      const next = { ...prev };
      for (const project of bookEngineProjects) {
        if (typeof next[project.id] === "undefined") next[project.id] = String((project as any).series_name || "");
      }
      return next;
    });
  }, [bookEngineProjects]);

  async function pushRecommendation(recommendation: PublishingRecommendation) {
    setHubStatus(null);
    setSendingRecommendationId(recommendation.id);
    try {
      const res = await fetch("/api/publishing/recommendations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: recommendation.id }),
      });
      const data = await res.json().catch(() => ({}));
      setHubStatus(
        res.ok
          ? data.fallback_source_type
            ? "Anbefaling sendt til HUB. Databasen brukte fallback source_type=manual."
            : "Anbefaling sendt til Oppgave-HUB."
          : data.error || "Kunne ikke sende anbefaling til HUB.",
      );
    } catch (err) {
      setHubStatus(err instanceof Error ? err.message : "Kunne ikke sende anbefaling til HUB.");
    } finally {
      setSendingRecommendationId(null);
    }
  }

  async function createKdpTasks() {
    setCreating(true);
    setCreated(0);
    setHubStatus(null);
    let count = 0;
    let failures = 0;

    for (const task of kdpTasks) {
      const res = await fetch("/api/work-items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...task,
          brand_id: "freddypublishing",
          source_type: "kdp",
          assigned_agent: "publishing",
          ai_score: task.priority === "CRITICAL" ? 96 : task.priority === "HIGH" ? 86 : 70,
          metadata: { system: "publishing_hub", niche: "olive_oil_mediterranean" },
        }),
      });
      if (res.ok) count += 1;
      else failures += 1;
    }

    setCreated(count);
    setHubStatus(failures > 0 ? `${count} oppgaver opprettet, ${failures} feilet.` : `${count} KDP-oppgaver er lagt i Oppgave-HUB-en.`);
    setCreating(false);
  }

  async function createBook(book: Partial<PublishingBook>) {
    const res = await fetch("/api/publishing/books", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(book),
    });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Could not save book");
    return res.json();
  }

  async function seedBooksToDatabase() {
    if (!books.length) return;
    setSavingBook(true);
    setHubStatus(null);
    try {
      for (const book of books.filter((item) => item.synthetic || item.id.startsWith("seed-"))) {
        await createBook({
          ...book,
          asin: book.asin || "",
          average_rating: book.average_rating ?? null,
          best_sellers_rank: book.best_sellers_rank ?? null,
          acos: book.acos ?? null,
        });
      }
      await loadBooks();
      setHubStatus("Seed-bøkene er lagret i Supabase.");
    } catch (err) {
      console.error("Could not seed publishing books:", err);
      setHubStatus(err instanceof Error ? err.message : "Kunne ikke lagre seed-bøkene.");
    } finally {
      setSavingBook(false);
    }
  }

  async function addBook() {
    if (!newBook.title.trim()) return;
    setSavingBook(true);
    setHubStatus(null);
    try {
      await createBook({
        ...newBook,
        brand_id: "freddypublishing",
        marketplace: "amazon.com",
        niche: "olive_oil_mediterranean",
        series_name: String(newBook.series_name || "").trim() || null,
        keywords: newBook.keywords.split(/[,;\n]/).map((item) => item.trim()).filter(Boolean),
        price: newBook.price ? Number(newBook.price) : null,
        reviews_count: Number(newBook.reviews_count || 0),
        average_rating: newBook.average_rating ? Number(newBook.average_rating) : null,
        best_sellers_rank: newBook.best_sellers_rank ? Number(newBook.best_sellers_rank) : null,
        priority: Number(newBook.priority || 50),
      });
      setNewBook({
        title: "",
        subtitle: "",
        asin: "",
        series_name: "",
        format: "kindle",
        role: "support",
        status: "audit",
        price: "",
        reviews_count: "0",
        average_rating: "",
        best_sellers_rank: "",
        main_category: "",
        keywords: "",
        next_action: "",
        priority: "70",
        notes: "",
      });
      setShowNewBook(false);
      await loadBooks();
      setHubStatus("Boken er lagret.");
    } catch (err) {
      console.error("Could not add publishing book:", err);
      setHubStatus(err instanceof Error ? err.message : "Kunne ikke lagre boken.");
    } finally {
      setSavingBook(false);
    }
  }

  async function pushBookTask(book: PublishingBook) {
    setHubStatus(null);
    setSendingBookId(book.id);
    try {
      const res = await fetch("/api/work-items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: `Publishing: ${book.title}`,
          description: book.subtitle || book.notes || "Bokoppgave fra Publishing Hub.",
          brand_id: "freddypublishing",
          source_type: "kdp",
          source_id: book.id,
          assigned_agent: "publishing",
          priority: Number(book.priority || 0) >= 90 ? "CRITICAL" : Number(book.priority || 0) >= 75 ? "HIGH" : "MEDIUM",
          ai_score: Number(book.priority || 70),
          next_action: book.next_action || "Vurder metadata, cover, keywords, reviews og Ads-data.",
          metadata: { book_title: book.title, asin: book.asin || null, role: book.role || null },
        }),
      });
      const data = await res.json().catch(() => ({}));
      setHubStatus(
        res.ok
          ? data.fallback_source_type
            ? "Sendt til HUB. Databasen brukte fallback source_type=manual."
            : "Bokoppgave sendt til Oppgave-HUB."
          : data.error || "Kunne ikke sende bokoppgave til HUB.",
      );
    } catch (err) {
      setHubStatus(err instanceof Error ? err.message : "Kunne ikke sende bokoppgave til HUB.");
    } finally {
      setSendingBookId(null);
    }
  }

  async function createBookCampaign(book: PublishingBook) {
    setHubStatus(null);
    const score = getAuditScore(book);
    const tasks = [
      {
        title: `Audit: ${book.title}`,
        description: `Audit score ${score.score}/100. Mangler: ${score.missing.join(", ") || "ingen kritiske hull"}.`,
        next_action: "Gå gjennom cover, tittel, undertittel, description, keywords, kategori, pris og preview.",
        priority: "HIGH",
        ai_score: Math.max(70, score.score),
      },
      {
        title: `Amazon SEO: ${book.title}`,
        description: "Lag 7 KDP keyword-felt, kategori-kandidater og konkurrent-ASIN-liste.",
        next_action: "Bruk reader-intent: Mediterranean diet, EVOO, polyphenols, anti-inflammatory, longevity og relevante konkurrenttitler.",
        priority: "HIGH",
        ai_score: 86,
      },
      {
        title: `Sales copy: ${book.title}`,
        description: "Skriv om Amazon-beskrivelse som salgsside uten medisinske garantier.",
        next_action: "Start med drøm/problem, forklar løftet, vis hva leseren lærer, etabler troverdighet og avslutt med CTA.",
        priority: "HIGH",
        ai_score: 84,
      },
      {
        title: `Content engine: ${book.title}`,
        description: "Lag 10 blogginnlegg, 20 sosiale poster og 5 e-poster fra bokens hovedidé.",
        next_action: "Koble innholdet til bok, lead magnet, Doña Anna og Mediterraneo Vital.",
        priority: "MEDIUM",
        ai_score: 78,
      },
      {
        title: `Review loop: ${book.title}`,
        description: "Bygg lovlig early reader-flow for frivillige ærlige reviews.",
        next_action: "Finn 30-50 relevante lesere og be om feedback, ikke rating eller garantert review.",
        priority: "HIGH",
        ai_score: 82,
      },
      {
        title: `Ads readiness: ${book.title}`,
        description: "Klargjør Amazon Ads først etter at metadata, cover, preview og review-plan er bedre.",
        next_action: "Start med automatic discovery, exact keywords og competitor ASIN targeting på lavt budsjett.",
        priority: "MEDIUM",
        ai_score: 74,
      },
    ];

    let count = 0;
    for (const task of tasks) {
      const res = await fetch("/api/work-items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...task,
          brand_id: "freddypublishing",
          source_type: "kdp",
          source_id: book.id,
          assigned_agent: "publishing",
          metadata: {
            book_title: book.title,
            asin: book.asin || null,
            role: book.role || null,
            campaign: "30_day_book_growth",
            platform: authorPlatform.name,
          },
        }),
      });
      if (res.ok) count += 1;
    }
    setHubStatus(`${count}/${tasks.length} kampanjeoppgaver for "${book.title}" er lagt i Oppgave-HUB-en.`);
  }

  async function importKdpReport(file?: File | null) {
    if (!file) return;
    setImportingReport(true);
    setHubStatus(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/publishing/import", {
        method: "POST",
        body: form,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setHubStatus(data.error || "Kunne ikke importere KDP-rapport.");
        return;
      }
      if (data.duplicate) {
        setHubStatus(data.message || "Denne KDP-rapporten er allerede importert.");
      } else {
        setHubStatus(
          `KDP-rapport importert: ${data.rows_imported || 0} rader, ${data.books_touched || 0} bøker, ${data.total_orders || 0} ordre, ${data.currency || "USD"} ${Number(data.total_royalties || 0).toFixed(2)} royalties.`,
        );
      }
      await loadBooks();
    } catch (err) {
      setHubStatus(err instanceof Error ? err.message : "Kunne ikke importere KDP-rapport.");
    } finally {
      setImportingReport(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="flex items-center gap-3 text-2xl font-bold text-white">
            <BookOpen className="text-rose-400" size={28} />
            Publishing Hub
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            KDP, bøker, metadata, anmeldelser, annonser og nye bokideer samlet som én vekstmaskin.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={loadRecommendations} disabled={recommendationsLoading}>
            {recommendationsLoading ? <Loader2 className="mr-2 animate-spin" size={16} /> : <Sparkles className="mr-2" size={16} />}
            Analyser Amazon/KDP
          </Button>
          <Button onClick={createKdpTasks} disabled={creating}>
            {creating ? <Loader2 className="mr-2 animate-spin" size={16} /> : <Plus className="mr-2" size={16} />}
            Opprett KDP-oppgaver
          </Button>
        </div>
      </div>

      {created > 0 && (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-200">
          {created} KDP-oppgaver er lagt i Oppgave-HUB-en.
        </div>
      )}

      {hubStatus && (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-100">
          {hubStatus}
        </div>
      )}

      <Card className="border-emerald-500/20 bg-emerald-500/5">
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="text-white">KDP Impact Dashboard</CardTitle>
            <div className="flex items-center gap-2">
              <Badge variant={impact?.hard_mode ? "destructive" : "secondary"} className="text-[10px]">
                {impact?.hard_mode ? "Hard Mode: På" : "Hard Mode: Av"}
              </Badge>
              <Button
                variant={impact?.hard_mode ? "outline" : "secondary"}
                size="sm"
                onClick={() => setHardMode(!impact?.hard_mode)}
                disabled={hardModeSaving}
              >
                {hardModeSaving ? <Loader2 className="mr-2 animate-spin" size={14} /> : null}
                {impact?.hard_mode ? "Skru av Hard Mode" : "Aktiver Hard Mode"}
              </Button>
              <Button variant="outline" size="sm" onClick={loadImpact} disabled={impactLoading}>
                {impactLoading ? <Loader2 className="mr-2 animate-spin" size={14} /> : <RefreshCw className="mr-2" size={14} />}
                Oppdater
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {!impact?.totals ? (
            <p className="text-sm text-slate-400">Ingen impact-data enda. Importer KDP-rapport og kjør growth loop.</p>
          ) : (
            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-5">
                <div className="rounded border border-slate-700/40 bg-slate-900/60 p-2 text-xs text-slate-300">Bøker: <span className="text-white">{impact.totals.books}</span></div>
                <div className="rounded border border-slate-700/40 bg-slate-900/60 p-2 text-xs text-slate-300">Orders: <span className="text-white">{impact.totals.orders}</span></div>
                <div className="rounded border border-slate-700/40 bg-slate-900/60 p-2 text-xs text-slate-300">Royalties: <span className="text-white">{impact.totals.royalties}</span></div>
                <div className="rounded border border-slate-700/40 bg-slate-900/60 p-2 text-xs text-slate-300">Reviews: <span className="text-white">{impact.totals.reviews}</span></div>
                <div className="rounded border border-slate-700/40 bg-slate-900/60 p-2 text-xs text-slate-300">Rating: <span className="text-white">{impact.totals.average_rating ?? "-"}</span></div>
              </div>
              {impact.import_delta && (
                <p className="text-xs text-slate-400">
                  Siste importendring: Orders {impact.import_delta.orders >= 0 ? "+" : ""}{impact.import_delta.orders},
                  Royalties {impact.import_delta.royalties >= 0 ? "+" : ""}{impact.import_delta.royalties}
                </p>
              )}
              {impact.totals.books === 0 && booksSynthetic && (
                <div className="rounded border border-cyan-500/30 bg-cyan-500/10 p-2">
                  <p className="mb-2 text-xs text-cyan-200">
                    Ingen bøker i databasen ennå. Klikk under for å legge inn porteføljen din, så kan vi optimalisere automatisk.
                  </p>
                  <Button size="sm" onClick={seedBooksToDatabase} disabled={savingBook || booksTableNotReady}>
                    {savingBook ? <Loader2 className="mr-2 animate-spin" size={14} /> : <Plus className="mr-2" size={14} />}
                    Legg inn bøker nå
                  </Button>
                </div>
              )}
              {impact.no_sales_books && impact.no_sales_books.length > 0 && (
                <div className="rounded border border-amber-500/30 bg-amber-500/10 p-2">
                  <p className="mb-1 text-xs text-amber-200">Bøker uten salg (prioriter disse):</p>
                  <p className="text-xs text-slate-200">{impact.no_sales_books.map((b) => `${b.title} (${b.role})`).join(" | ")}</p>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-indigo-500/20 bg-indigo-500/5">
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="text-white">Amazon Market Watch</CardTitle>
            <Button variant="outline" size="sm" onClick={loadMarketWatch} disabled={marketLoading}>
              {marketLoading ? <Loader2 className="mr-2 animate-spin" size={14} /> : <RefreshCw className="mr-2" size={14} />}
              Oppdater
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {marketSnapshots.length === 0 ? (
            <p className="text-sm text-slate-400">Ingen snapshots ennå. Kjør Publishing Market Watch v1 i Automasjon.</p>
          ) : (
            <div className="space-y-2">
              {marketSnapshots.slice(0, 6).map((snap) => (
                <div key={snap.id} className="rounded border border-slate-700/40 bg-slate-900/60 p-2 text-xs text-slate-300">
                  <span className="text-white">{snap.query}</span>
                  <span className="ml-2 text-slate-400">Resultater: {snap.total_results_estimate ?? "-"}</span>
                  <span className="ml-2 text-slate-400">Top: {snap.summary?.top_count ?? 0}</span>
                  <span className="ml-2 text-slate-400">Reviews avg: {snap.summary?.avg_reviews ?? 0}</span>
                  <span className="ml-2 text-slate-400">Rating avg: {snap.summary?.avg_rating ?? 0}</span>
                  {snap.summary?.error ? <span className="ml-2 text-amber-300">Feil: {snap.summary.error}</span> : null}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-purple-500/20 bg-purple-500/5">
        <CardHeader>
          <CardTitle className="text-white">Book Workshop (AI + deg)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 md:grid-cols-2">
            <select
              value={bookEngineInput.genre}
              onChange={(e) => setBookEngineInput((p) => ({ ...p, genre: e.target.value }))}
              className="h-10 w-full rounded-lg border border-slate-600 bg-slate-800 px-3 text-sm text-slate-100"
            >
              <option value="guide">Guide / Fagbok</option>
              <option value="cookbook">Kokebok</option>
              <option value="memoir">Biografi / Memoir</option>
              <option value="thriller">Thriller</option>
              <option value="action">Action / Adventure</option>
              <option value="children">Barnebok</option>
              <option value="self_help">Self-help</option>
              <option value="business">Business</option>
              <option value="travel">Reise</option>
              <option value="romance">Romance</option>
              <option value="fantasy">Fantasy</option>
              <option value="sci_fi">Sci-Fi</option>
            </select>
            {bookEngineInput.genre === "children" ? (
              <select
                value={bookEngineInput.illustration_style}
                onChange={(e) => setBookEngineInput((p) => ({ ...p, illustration_style: e.target.value }))}
                className="h-10 w-full rounded-lg border border-slate-600 bg-slate-800 px-3 text-sm text-slate-100"
              >
                <option value="animation">Animasjon</option>
                <option value="pixar_like">3D animasjon (Pixar-lignende)</option>
                <option value="line_art">Strektegning</option>
                <option value="storybook">Klassisk bildebok</option>
                <option value="watercolor">Akvarell</option>
                <option value="realistic">Realistisk</option>
              </select>
            ) : (
              <Input
                placeholder="Serie (valgfritt)"
                value={bookEngineInput.series_name}
                onChange={(e) => setBookEngineInput((p) => ({ ...p, series_name: e.target.value }))}
                list="series-options"
              />
            )}
          </div>
          <Input
            placeholder="Tema (f.eks: Olivenolje, anti-inflammatorisk livsstil for 40+)"
            value={workshopTheme}
            onChange={(e) => setWorkshopTheme(e.target.value)}
          />
          <div className="flex gap-2">
            <Button onClick={runWorkshopDiscovery} disabled={workshopLoading || !workshopTheme.trim()}>
              {workshopLoading ? <Loader2 className="mr-2 animate-spin" size={14} /> : <Sparkles className="mr-2" size={14} />}
              Finn retninger
            </Button>
            <Button variant="secondary" onClick={buildWorkshopPlan} disabled={workshopPlanning || !workshopTheme.trim()}>
              {workshopPlanning ? <Loader2 className="mr-2 animate-spin" size={14} /> : null}
              Lag bokplan
            </Button>
          </div>
          {workshopDirections.length > 0 && (
            <div className="space-y-2 rounded border border-slate-700/40 bg-slate-900/60 p-3">
              <p className="text-xs text-slate-400">Velg retning</p>
              <select
                value={selectedDirection}
                onChange={(e) => setSelectedDirection(e.target.value)}
                className="h-10 w-full rounded-lg border border-slate-600 bg-slate-800 px-3 text-sm text-slate-100"
              >
                {workshopDirections.map((d) => (
                  <option key={d.id} value={d.title}>
                    {d.title} ({d.commercial_potential})
                  </option>
                ))}
              </select>
              <Input
                placeholder="Hva må boken fokusere på?"
                value={workshopContentFocus}
                onChange={(e) => setWorkshopContentFocus(e.target.value)}
              />
              <select
                value={workshopStyle}
                onChange={(e) => setWorkshopStyle(e.target.value)}
                className="h-10 w-full rounded-lg border border-slate-600 bg-slate-800 px-3 text-sm text-slate-100"
              >
                <option value="practical">Praktisk</option>
                <option value="storytelling">Storytelling</option>
                <option value="expert">Ekspert/Faglig</option>
                <option value="hybrid">Hybrid</option>
              </select>
            </div>
          )}
          {workshopQuestions.length > 0 && (
            <div className="rounded border border-slate-700/40 bg-slate-900/60 p-3">
              <p className="mb-1 text-xs text-slate-400">Avklaringsspørsmål fra AI (Workshop v2)</p>
              <div className="space-y-2">
                {workshopQuestions.slice(0, 8).map((q, i) => (
                  <div key={`${i}-${q}`} className="space-y-1">
                    <p className="text-xs text-slate-300">{i + 1}. {q}</p>
                    <Input
                      placeholder="Skriv svaret ditt her"
                      value={workshopAnswers[i] || ""}
                      onChange={(e) =>
                        setWorkshopAnswers((prev) => {
                          const next = [...prev];
                          next[i] = e.target.value;
                          return next;
                        })
                      }
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-fuchsia-500/20 bg-fuchsia-500/5">
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="text-white">Book Engine v1</CardTitle>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={loadBookEngineProjects} disabled={bookEngineLoading}>
                {bookEngineLoading ? <Loader2 className="mr-2 animate-spin" size={14} /> : <RefreshCw className="mr-2" size={14} />}
                Oppdater
              </Button>
              <Button size="sm" onClick={generateBookEngineProject} disabled={bookEngineGenerating}>
                {bookEngineGenerating ? <Loader2 className="mr-2 animate-spin" size={14} /> : <Sparkles className="mr-2" size={14} />}
                Generer bok
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2">
            <Input placeholder="Tittel" value={bookEngineInput.title} onChange={(e) => setBookEngineInput((p) => ({ ...p, title: e.target.value }))} />
            <Input placeholder="Undertittel" value={bookEngineInput.subtitle} onChange={(e) => setBookEngineInput((p) => ({ ...p, subtitle: e.target.value }))} />
            <select
              value={bookEngineInput.genre}
              onChange={(e) => setBookEngineInput((p) => ({ ...p, genre: e.target.value }))}
              className="h-10 w-full rounded-lg border border-slate-600 bg-slate-800 px-3 text-sm text-slate-100"
            >
              <option value="guide">Guide / Fagbok</option>
              <option value="cookbook">Kokebok</option>
              <option value="memoir">Biografi / Memoir</option>
              <option value="thriller">Thriller</option>
              <option value="action">Action / Adventure</option>
              <option value="children">Barnebok</option>
              <option value="self_help">Self-help</option>
              <option value="business">Business</option>
              <option value="travel">Reise</option>
              <option value="romance">Romance</option>
              <option value="fantasy">Fantasy</option>
              <option value="sci_fi">Sci-Fi</option>
            </select>
            <Input
              value={bookEngineInput.series_name}
              onChange={(e) => setBookEngineInput((p) => ({ ...p, series_name: e.target.value }))}
              placeholder="Serie (skriv ny eller velg eksisterende)"
              list="series-options"
            />
            <Input placeholder="Språk (en/no)" value={bookEngineInput.language} onChange={(e) => setBookEngineInput((p) => ({ ...p, language: e.target.value }))} />
            <Input placeholder="Målsider" value={bookEngineInput.target_pages} onChange={(e) => setBookEngineInput((p) => ({ ...p, target_pages: e.target.value }))} />
            <Input placeholder="Målord" value={bookEngineInput.target_words} onChange={(e) => setBookEngineInput((p) => ({ ...p, target_words: e.target.value }))} />
            <Input placeholder="Seed keywords (komma)" value={bookEngineInput.seed_keywords} onChange={(e) => setBookEngineInput((p) => ({ ...p, seed_keywords: e.target.value }))} />
            <Input placeholder="Målgruppe" value={bookEngineInput.audience} onChange={(e) => setBookEngineInput((p) => ({ ...p, audience: e.target.value }))} className="md:col-span-2" />
            <Input placeholder="Posisjonering" value={bookEngineInput.positioning} onChange={(e) => setBookEngineInput((p) => ({ ...p, positioning: e.target.value }))} className="md:col-span-2" />
            <select
              value={bookEngineInput.source_mode}
              onChange={(e) => setBookEngineInput((p) => ({ ...p, source_mode: e.target.value }))}
              className="h-10 w-full rounded-lg border border-slate-600 bg-slate-800 px-3 text-sm text-slate-100"
            >
              <option value="from_brief">Lag ny bok fra brief/idé</option>
              <option value="rewrite">Forbedre eksisterende manus</option>
              <option value="expand">Bygg videre på førsteutkast</option>
            </select>
            <label className="inline-flex h-10 cursor-pointer items-center justify-center rounded-lg border border-slate-600 bg-slate-900 px-3 text-sm text-slate-200 hover:bg-slate-800">
              {bookSourceUploading ? "Laster opp..." : "Last opp kildefil (.txt, .md, .docx)"}
              <input
                type="file"
                className="hidden"
                accept=".txt,.md,.docx,text/plain,text/markdown,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  uploadBookSourceFile(file);
                }}
              />
            </label>
            <Input
              placeholder="Hva skal AI endre/legge til? (tone, målgruppe, slutt, tempo, kapitler...)"
              value={bookEngineInput.source_instructions}
              onChange={(e) => setBookEngineInput((p) => ({ ...p, source_instructions: e.target.value }))}
              className="md:col-span-2"
            />
            <textarea
              value={bookEngineInput.source_material}
              onChange={(e) => setBookEngineInput((p) => ({ ...p, source_material: e.target.value }))}
              placeholder="Lim inn hele boka, førsteutkast eller forklaring her (valgfritt hvis du har lastet opp fil)."
              className="min-h-[180px] w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-100 md:col-span-2"
            />
            {bookEngineInput.genre === "children" && (
              <>
                <select
                  value={bookEngineInput.illustration_style}
                  onChange={(e) => setBookEngineInput((p) => ({ ...p, illustration_style: e.target.value }))}
                  className="h-10 w-full rounded-lg border border-slate-600 bg-slate-800 px-3 text-sm text-slate-100"
                >
                  <option value="animation">Animasjon</option>
                  <option value="pixar_like">3D animasjon (Pixar-lignende)</option>
                  <option value="line_art">Strektegning</option>
                  <option value="storybook">Klassisk bildebok</option>
                  <option value="watercolor">Akvarell</option>
                  <option value="realistic">Realistisk</option>
                </select>
                <Input
                  placeholder="Gjengangere (navn/dyr), separert med komma"
                  value={bookEngineInput.recurring_characters}
                  onChange={(e) => setBookEngineInput((p) => ({ ...p, recurring_characters: e.target.value }))}
                />
                <Input
                  placeholder="Konsistensregler (utseende/farger/klær for gjengangere)"
                  value={bookEngineInput.consistency_notes}
                  onChange={(e) => setBookEngineInput((p) => ({ ...p, consistency_notes: e.target.value }))}
                  className="md:col-span-2"
                />
              </>
            )}
          </div>
          {bookEngineProjects.length === 0 ? (
            <p className="text-sm text-slate-400">Ingen Book Engine-prosjekter ennå.</p>
          ) : (
            <div className="space-y-3">
              {bookEngineProjects.slice(0, 3).map((project) => (
                <div key={project.id} className="rounded-lg border border-slate-700/40 bg-slate-900/60 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-white">{project.title}</p>
                    <Badge
                      variant={
                        project.status === "generated" || project.status === "ready_for_export"
                          ? "success"
                          : project.status === "generation_failed"
                            ? "destructive"
                            : "secondary"
                      }
                      className="text-[10px]"
                    >
                      {project.status || "draft"}
                    </Badge>
                  </div>
                  <p className="mt-1 text-xs text-slate-400">
                    {project.language || "en"} · {project.target_pages || "-"} sider · {project.target_words || "-"} ord · {project.status || "draft"}
                  </p>
                  {project.metadata_plan?.revision_report ? (
                    <div className="mt-2 rounded border border-cyan-500/30 bg-cyan-500/10 p-2 text-xs text-cyan-100">
                      <p className="font-semibold">Diff-rapport</p>
                      <p className="mt-1 text-cyan-50">{String(project.metadata_plan.revision_report.summary || "")}</p>
                      {Array.isArray(project.metadata_plan.revision_report.kept) && project.metadata_plan.revision_report.kept.length > 0 ? (
                        <p className="mt-1"><span className="font-semibold">Beholdt:</span> {project.metadata_plan.revision_report.kept.slice(0, 3).join(" · ")}</p>
                      ) : null}
                      {Array.isArray(project.metadata_plan.revision_report.changed) && project.metadata_plan.revision_report.changed.length > 0 ? (
                        <p className="mt-1"><span className="font-semibold">Endret:</span> {project.metadata_plan.revision_report.changed.slice(0, 3).join(" · ")}</p>
                      ) : null}
                      {Array.isArray(project.metadata_plan.revision_report.added) && project.metadata_plan.revision_report.added.length > 0 ? (
                        <p className="mt-1"><span className="font-semibold">Lagt til:</span> {project.metadata_plan.revision_report.added.slice(0, 3).join(" · ")}</p>
                      ) : null}
                    </div>
                  ) : null}
                  <div className="mt-2 flex flex-col gap-2 md:flex-row">
                    <Input
                      placeholder="Serie (skriv ny eller velg)"
                      value={projectSeriesDrafts[project.id] ?? String((project as any).series_name || "")}
                      onChange={(e) =>
                        setProjectSeriesDrafts((prev) => ({
                          ...prev,
                          [project.id]: e.target.value,
                        }))
                      }
                      list="series-options"
                      className="h-9"
                    />
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => saveBookEngineSeries(project.id)}
                      disabled={savingProjectSeriesId === project.id}
                    >
                      {savingProjectSeriesId === project.id ? <Loader2 className="mr-2 animate-spin" size={14} /> : null}
                      Lagre serie
                    </Button>
                  </div>
                  {project.status === "generation_failed" && (
                    <div className="mt-2 rounded border border-red-500/30 bg-red-500/10 p-2 text-xs text-red-200">
                      Generering feilet. Trykk Prøv igjen.
                    </div>
                  )}
                  <p className="mt-2 text-xs text-slate-300">
                    SEO: {String(project.metadata_plan?.positioning || project.metadata_plan?.launch_angle || "Ingen SEO-plan")}
                  </p>
                  <p className="mt-1 text-xs text-slate-300">
                    Kapitler: {Array.isArray(project.outline_plan?.toc) ? project.outline_plan.toc.length : 0} · Utkast: {Array.isArray(project.chapter_drafts) ? project.chapter_drafts.length : 0}
                  </p>
                  {project.metadata_plan?.generation_warning ? (
                    <p className="mt-1 text-xs text-amber-300">{String(project.metadata_plan.generation_warning)}</p>
                  ) : null}
                  <p className="mt-1 text-xs text-slate-400">
                    Bilder: {project.metadata_plan?.image_plan?.cover?.image_url ? 1 : 0} forside +
                    {" "}{Array.isArray(project.metadata_plan?.image_plan?.chapters)
                      ? project.metadata_plan.image_plan.chapters.filter((c: any) => c?.image_url).length
                      : 0} kapittelbilder · Feil:
                    {" "}{Array.isArray(project.metadata_plan?.image_plan?.chapters)
                      ? project.metadata_plan.image_plan.chapters.filter((c: any) => c?.status === "error").length
                      : 0}
                  </p>
                  <div className="mt-3 flex justify-end">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => prepareLanguageVersion(project)}
                      disabled={preparingLanguageVersionId === project.id}
                      className="mr-2"
                    >
                      {preparingLanguageVersionId === project.id ? <Loader2 className="mr-2 animate-spin" size={14} /> : null}
                      Lag språkversjon
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => retryBookEngineProject(project.id)}
                      disabled={retryingBookEngineId === project.id}
                      className="mr-2"
                    >
                      {retryingBookEngineId === project.id ? <Loader2 className="mr-2 animate-spin" size={14} /> : null}
                      Prøv igjen
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => generateBookImages(project.id)}
                      disabled={generatingBookImagesId === project.id}
                      className="mr-2"
                    >
                      {generatingBookImagesId === project.id ? <Loader2 className="mr-2 animate-spin" size={14} /> : null}
                      Generer bilder
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => continueBookEngineProject(project.id)}
                      disabled={continuingBookEngineId === project.id}
                      className="mr-2"
                    >
                      {continuingBookEngineId === project.id ? <Loader2 className="mr-2 animate-spin" size={14} /> : null}
                      Fortsett skriv
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => exportBookEngineProject(project.id, "docx")}
                      disabled={exportingBookEngineId === project.id}
                      className="mr-2"
                    >
                      {exportingBookEngineId === project.id ? <Loader2 className="mr-2 animate-spin" size={14} /> : null}
                      Last ned Word
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => exportBookEngineProject(project.id, "epub")}
                      disabled={exportingBookEngineId === project.id}
                      className="mr-2"
                    >
                      {exportingBookEngineId === project.id ? <Loader2 className="mr-2 animate-spin" size={14} /> : null}
                      Last ned Kindle
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => exportBookEngineProject(project.id, "md")}
                      disabled={exportingBookEngineId === project.id}
                    >
                      {exportingBookEngineId === project.id ? <Loader2 className="mr-2 animate-spin" size={14} /> : null}
                      Last ned MD
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-cyan-500/20 bg-cyan-500/5">
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="text-white">Autopilot resultater</CardTitle>
            <Button variant="outline" size="sm" onClick={loadAutopilotResults} disabled={autopilotLoading}>
              {autopilotLoading ? <Loader2 className="mr-2 animate-spin" size={14} /> : <RefreshCw className="mr-2" size={14} />}
              Oppdater
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {autopilotRuns.length === 0 ? (
            <p className="text-sm text-slate-400">
              Ingen kjøringer logget ennå. Kjør Publishing Autopilot v1 i Automasjon for å se resultatene her.
            </p>
          ) : (
            <div className="space-y-3">
              {autopilotRuns.slice(0, 5).map((run) => (
                <div key={run.id} className="rounded-lg border border-slate-700/40 bg-slate-900/60 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={run.status === "success" ? "success" : "destructive"} className="text-[10px]">
                      {run.status}
                    </Badge>
                    <span className="text-xs text-slate-400">{new Date(run.created_at).toLocaleString("nb-NO")}</span>
                  </div>
                  <div className="mt-2 grid gap-2 text-xs text-slate-300 sm:grid-cols-3">
                    <p>Prosessert: <span className="text-white">{run.processed}</span></p>
                    <p>Flyttet til REVIEW: <span className="text-white">{run.moved_to_review}</span></p>
                    <p>Forslag laget: <span className="text-white">{run.suggestions_created}</span></p>
                  </div>
                  <p className="mt-2 text-xs text-slate-500">
                    Draft-IDer: {run.created_draft_ids.length ? run.created_draft_ids.join(", ") : "Ingen (KDP-spor oppdaterer oppgaver direkte)."}
                  </p>
                  {run.items?.length > 0 && (
                    <div className="mt-2 rounded border border-slate-700/40 bg-slate-950/40 p-2">
                      <p className="mb-1 text-[11px] text-slate-400">Oppgaver:</p>
                      <ul className="space-y-1 text-[11px] text-slate-300">
                        {run.items.slice(0, 5).map((item) => (
                          <li key={item.id}>
                            {item.id.slice(0, 8)}… - {item.status}
                            {item.error ? ` (${item.error})` : ""}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {booksTableNotReady && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200">
          <p>
            Live-appen finner ikke tabellen `publishing_books` i Supabase-prosjektet den er koblet til. Viser foreløpig seed-data.
          </p>
          {booksSupabaseHost && <p className="mt-1 text-xs text-amber-100/80">Supabase host: {booksSupabaseHost}</p>}
          {booksDbError && <p className="mt-1 text-xs text-amber-100/80">Databasefeil: {booksDbError}</p>}
          <p className="mt-2 text-xs text-amber-100/80">
            Sjekk at migrasjonen er kjørt i samme Supabase-prosjekt som Vercel bruker i `NEXT_PUBLIC_SUPABASE_URL`.
          </p>
        </div>
      )}

      <Card className="border-rose-500/20 bg-rose-500/5">
        <CardContent className="p-5">
          <div className="grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-rose-300">Author Platform</p>
              <h2 className="mt-2 text-2xl font-bold text-white">{authorPlatform.name}</h2>
              <p className="mt-1 text-sm text-rose-100/90">{authorPlatform.positioning}</p>
              <p className="mt-4 text-sm leading-relaxed text-slate-300">{authorPlatform.promise}</p>
            </div>
            <div className="rounded-lg border border-slate-700/40 bg-slate-900/60 p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Strategisk prioritet</p>
              <p className="mt-2 text-sm text-slate-200">{authorPlatform.commercialPriority}</p>
              <p className="mt-4 text-xs font-semibold uppercase tracking-wider text-slate-500">Primær målgruppe</p>
              <p className="mt-2 text-sm text-slate-300">{authorPlatform.primaryAudience}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-5">
        {[
          ["Bøker", businessTotals?.publishingBooks ?? books.length, "Synket med Business Overview"],
          ["Aktive", totals.active, "Launch/active/optimize"],
          ["Reviews", totals.reviews, "Samlet review-base"],
          ["Orders", businessTotals?.publishingOrders ?? totals.orders, "Synket med Business Overview"],
          ["Royalties", `$${Number(businessTotals?.publishingRoyalties ?? totals.royalties).toFixed(0)}`, "Synket inntekt"],
        ].map(([label, value, description]) => (
          <Card key={String(label)}>
            <CardContent className="p-4">
              <p className="text-xs uppercase tracking-wider text-slate-500">{label}</p>
              <p className="mt-2 text-2xl font-bold text-white">{value}</p>
              <p className="mt-1 text-xs text-slate-500">{description}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="border-cyan-500/20 bg-cyan-500/5">
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="flex items-center gap-2 text-white">
              <Sparkles size={18} className="text-cyan-300" />
              AI-anbefalinger for Amazon/KDP
            </CardTitle>
            {recommendationsSynthetic && (
              <Badge variant="outline" className="w-fit text-[10px]">
                Bruker seed-data til Supabase er fylt
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {recommendationsLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="animate-spin text-slate-400" size={24} />
            </div>
          ) : recommendations.length === 0 ? (
            <p className="text-sm text-slate-400">Ingen anbefalinger ennå. Kjør analysen når bøkene er lastet inn.</p>
          ) : (
            <div className="grid gap-3 lg:grid-cols-2">
              {recommendations.slice(0, 8).map((recommendation) => (
                <div key={recommendation.id} className="rounded-lg border border-slate-700/50 bg-slate-900/70 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={recommendation.priority === "CRITICAL" ? "destructive" : recommendation.priority === "HIGH" ? "success" : "secondary"} className="text-[10px]">
                      {recommendation.priority}
                    </Badge>
                    <span className="rounded-full bg-slate-800 px-2 py-1 text-[10px] text-slate-400">
                      AI {recommendation.ai_score}/100
                    </span>
                    <span className="rounded-full bg-slate-800 px-2 py-1 text-[10px] text-slate-400">
                      {recommendation.type}
                    </span>
                  </div>
                  <h3 className="mt-3 text-sm font-semibold text-white">{recommendation.title}</h3>
                  <p className="mt-2 text-sm text-slate-300">{recommendation.description}</p>
                  <p className="mt-3 text-xs text-slate-500">
                    <span className="text-slate-400">Effekt:</span> {recommendation.impact}
                  </p>
                  <p className="mt-2 text-xs text-slate-500">
                    <span className="text-slate-400">Neste:</span> {recommendation.next_action}
                  </p>
                  <div className="mt-4 flex justify-end">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => pushRecommendation(recommendation)}
                      disabled={sendingRecommendationId === recommendation.id}
                    >
                      {sendingRecommendationId === recommendation.id ? (
                        <>
                          <Loader2 className="mr-2 animate-spin" size={14} />
                          Sender...
                        </>
                      ) : (
                        "Send til HUB"
                      )}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="border-rose-500/20 bg-rose-500/5 lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-white">
              <Target size={18} className="text-rose-300" />
              Første kommersielle fokus
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-sm text-slate-300">
                Start med olivenolje/Mediterranean living som tydelig nisje. Du har ekte autoritet gjennom Spania,
                olivengård, premium EVOO og Doña Anna. Det er sterkere enn å spre energien på mange generiske bøker.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {series.map((item, index) => (
                <div key={item} className="rounded-lg border border-slate-700/40 bg-slate-900/60 p-3">
                  <Badge variant={index === 2 ? "success" : index === 0 ? "destructive" : "secondary"} className="mb-2 text-[10px]">
                    {index === 0 ? "Optimaliser først" : index === 2 ? "Neste salgsprodukt" : "Støtteprodukt"}
                  </Badge>
                  <p className="text-sm font-medium text-white">{item}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="border-cyan-500/20 bg-cyan-500/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-white">
              <TrendingUp size={18} className="text-cyan-300" />
              Målbar loop
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3 text-sm text-slate-300">
              {["Metadata og cover", "Reviews og reader team", "Amazon Ads som markedsdata", "Ny bok basert på signaler", "Email funnel til Doña Anna"].map((item) => (
                <li key={item} className="flex gap-2">
                  <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-cyan-300" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="text-white">Book Growth Dashboard</CardTitle>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={loadBooks} disabled={booksLoading}>
                <RefreshCw className={booksLoading ? "mr-2 animate-spin" : "mr-2"} size={14} />
                Oppdater
              </Button>
              {booksSynthetic && (
                <Button variant="secondary" size="sm" onClick={seedBooksToDatabase} disabled={savingBook || booksTableNotReady}>
                  {savingBook ? <Loader2 className="mr-2 animate-spin" size={14} /> : <Plus className="mr-2" size={14} />}
                  Lagre seed-bøker
                </Button>
              )}
              <Button size="sm" onClick={() => setShowNewBook((value) => !value)}>
                <Plus className="mr-2" size={14} />
                Legg til bok
              </Button>
              <label className="inline-flex h-8 cursor-pointer items-center justify-center rounded-lg border border-slate-600 px-3 text-xs font-medium text-slate-200 transition-all hover:bg-slate-700">
                {importingReport ? <Loader2 className="mr-2 animate-spin" size={14} /> : <Upload className="mr-2" size={14} />}
                Importer KDP CSV
                <input
                  type="file"
                  accept=".csv,.tsv,text/csv,text/tab-separated-values"
                  className="hidden"
                  disabled={importingReport}
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.target.value = "";
                    importKdpReport(file);
                  }}
                />
              </label>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {showNewBook && (
            <div className="mb-5 rounded-lg border border-slate-700/50 bg-slate-900/60 p-4">
              <div className="grid gap-3 md:grid-cols-2">
                <Input placeholder="Tittel" value={newBook.title} onChange={(e) => setNewBook((p) => ({ ...p, title: e.target.value }))} />
                <Input placeholder="ASIN" value={newBook.asin} onChange={(e) => setNewBook((p) => ({ ...p, asin: e.target.value }))} />
                <Input placeholder="Undertittel" value={newBook.subtitle} onChange={(e) => setNewBook((p) => ({ ...p, subtitle: e.target.value }))} className="md:col-span-2" />
                <Input
                  placeholder="Serie (skriv ny eller velg eksisterende)"
                  value={newBook.series_name}
                  onChange={(e) => setNewBook((p) => ({ ...p, series_name: e.target.value }))}
                  list="series-options"
                  className="md:col-span-2"
                />
                <select value={newBook.format} onChange={(e) => setNewBook((p) => ({ ...p, format: e.target.value }))} className="h-10 rounded-lg border border-slate-600 bg-slate-800 px-3 text-sm text-slate-100">
                  <option value="kindle">Kindle</option>
                  <option value="paperback">Paperback</option>
                  <option value="hardcover">Hardcover</option>
                  <option value="audio">Audio</option>
                  <option value="lead_magnet">Lead magnet</option>
                  <option value="other">Other</option>
                </select>
                <select value={newBook.role} onChange={(e) => setNewBook((p) => ({ ...p, role: e.target.value }))} className="h-10 rounded-lg border border-slate-600 bg-slate-800 px-3 text-sm text-slate-100">
                  <option value="front_product">Front product</option>
                  <option value="support">Support</option>
                  <option value="next_launch">Next launch</option>
                  <option value="lead_magnet">Lead magnet</option>
                  <option value="authority_book">Authority book</option>
                  <option value="secondary">Secondary</option>
                  <option value="parked">Parked</option>
                </select>
                <Input placeholder="Pris" value={newBook.price} onChange={(e) => setNewBook((p) => ({ ...p, price: e.target.value }))} />
                <Input placeholder="Reviews" value={newBook.reviews_count} onChange={(e) => setNewBook((p) => ({ ...p, reviews_count: e.target.value }))} />
                <Input placeholder="Kategori" value={newBook.main_category} onChange={(e) => setNewBook((p) => ({ ...p, main_category: e.target.value }))} />
                <Input placeholder="Priority 0-100" value={newBook.priority} onChange={(e) => setNewBook((p) => ({ ...p, priority: e.target.value }))} />
                <Input placeholder="Keywords, separert med komma" value={newBook.keywords} onChange={(e) => setNewBook((p) => ({ ...p, keywords: e.target.value }))} className="md:col-span-2" />
                <Input placeholder="Neste handling" value={newBook.next_action} onChange={(e) => setNewBook((p) => ({ ...p, next_action: e.target.value }))} className="md:col-span-2" />
              </div>
              <div className="mt-3 flex justify-end">
                <Button onClick={addBook} disabled={savingBook || !newBook.title.trim()}>
                  {savingBook ? <Loader2 className="mr-2 animate-spin" size={16} /> : <Plus className="mr-2" size={16} />}
                  Lagre bok
                </Button>
              </div>
            </div>
          )}

          <div className="space-y-3">
            {booksLoading ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 className="animate-spin text-slate-400" size={28} />
              </div>
            ) : (
              books.map((book) => (
                <div key={book.id} className="rounded-lg border border-slate-700/40 bg-slate-900/60 p-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                      {(() => {
                        const audit = getAuditScore(book);
                        return (
                          <div className="mb-3 flex flex-wrap items-center gap-2">
                            <span className={`rounded-full px-2 py-1 text-[10px] font-semibold ${audit.score >= 80 ? "bg-emerald-500/15 text-emerald-300" : audit.score >= 55 ? "bg-amber-500/15 text-amber-300" : "bg-red-500/15 text-red-300"}`}>
                              Audit {audit.score}/100
                            </span>
                            {audit.missing.slice(0, 4).map((item) => (
                              <span key={item} className="rounded-full bg-slate-800 px-2 py-1 text-[10px] text-slate-500">Mangler {item}</span>
                            ))}
                          </div>
                        );
                      })()}
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-base font-semibold text-white">{book.title}</h3>
                        <Badge variant={book.role === "front_product" ? "destructive" : book.role === "next_launch" ? "success" : "secondary"} className="text-[10px]">
                          {book.role || "support"}
                        </Badge>
                        <Badge variant="outline" className="text-[10px]">{book.status || "audit"}</Badge>
                        <span className="text-xs text-slate-500">{book.format || "kindle"} · {book.marketplace || "amazon.com"}</span>
                      </div>
                      {book.subtitle && <p className="mt-1 text-sm text-slate-400">{book.subtitle}</p>}
                      <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-500">
                        <span>ASIN: {book.asin || "mangler"}</span>
                        <span>Reviews: {book.reviews_count || 0}</span>
                        <span>Rating: {book.average_rating || "-"}</span>
                        <span>BSR: {book.best_sellers_rank ? `#${Number(book.best_sellers_rank).toLocaleString()}` : "-"}</span>
                        <span>Ads: ${Number(book.ad_spend || 0).toFixed(0)}</span>
                        <span>Orders: {book.orders || 0}</span>
                      </div>
                      {book.keywords && book.keywords.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-1.5">
                          {book.keywords.slice(0, 7).map((keyword) => (
                            <span key={keyword} className="rounded-full bg-slate-800 px-2 py-1 text-[10px] text-slate-400">{keyword}</span>
                          ))}
                        </div>
                      )}
                      <p className="mt-3 text-sm text-slate-300">
                        <span className="text-slate-500">Neste:</span> {book.next_action || "Legg inn neste handling."}
                      </p>
                      <p className="mt-2 text-xs text-slate-500">
                        <span className="text-slate-400">Strategi:</span> {getBookStrategy(book)}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-2">
                      {book.amazon_url && (
                        <a href={book.amazon_url} target="_blank" rel="noreferrer" className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-600 px-3 text-xs text-slate-300 hover:bg-slate-800">
                          Amazon
                          <ExternalLink size={12} />
                        </a>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => pushBookTask(book)}
                        disabled={sendingBookId === book.id}
                      >
                        {sendingBookId === book.id ? (
                          <>
                            <Loader2 className="mr-2 animate-spin" size={14} />
                            Sender...
                          </>
                        ) : (
                          "Send til HUB"
                        )}
                      </Button>
                      <Button variant="secondary" size="sm" onClick={() => createBookCampaign(book)}>
                        30d kampanje
                      </Button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-white">30-dagers handlingsplan</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-4">
            {[
              ["Uke 1", "Rydd metadata, kategorier, keywords og Author Central."],
              ["Uke 2", "Nytt cover, bedre preview og tryggere sales copy."],
              ["Uke 3", "Early reader team og frivillige ærlige reviews."],
              ["Uke 4", "Amazon Ads-test og datafangst til neste bok."],
            ].map(([week, text]) => (
              <div key={week} className="rounded-lg border border-slate-700/40 bg-slate-900/60 p-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{week}</p>
                <p className="mt-2 text-sm text-slate-200">{text}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-3">
        <a className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-300 hover:bg-slate-800" href="/marketing-tasks">
          Åpne Oppgave-HUB
          <ExternalLink size={14} />
        </a>
        <a className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-300 hover:bg-slate-800" href="/growth-hub">
          Åpne Growth Hub
          <ExternalLink size={14} />
        </a>
      </div>
      <datalist id="series-options">
        {seriesOptions.map((seriesName) => (
          <option key={seriesName} value={seriesName} />
        ))}
      </datalist>
    </div>
  );
}
