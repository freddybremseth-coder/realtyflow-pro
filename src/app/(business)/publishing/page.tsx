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
  const [newBook, setNewBook] = useState({
    title: "",
    subtitle: "",
    asin: "",
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

  useEffect(() => {
    loadBooks();
    loadRecommendations();
  }, []);

  async function pushRecommendation(recommendation: PublishingRecommendation) {
    setHubStatus(null);
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
        series_name: "Mediterranean Olive Oil",
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
          ["Bøker", books.length, "Totalt i publishing-porteføljen"],
          ["Aktive", totals.active, "Launch/active/optimize"],
          ["Reviews", totals.reviews, "Samlet review-base"],
          ["Orders", totals.orders, "Registrert fra Ads/salg"],
          ["Royalties", `$${totals.royalties.toFixed(0)}`, "Registrert inntekt"],
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
                    <Button variant="secondary" size="sm" onClick={() => pushRecommendation(recommendation)}>
                      Send til HUB
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
                      <Button variant="outline" size="sm" onClick={() => pushBookTask(book)}>
                        Send til HUB
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
    </div>
  );
}
