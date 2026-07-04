import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminApi } from "@/lib/api-admin";
import { seedBooks, type SeedPublishingBook } from "@/lib/publishing/seed-books";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type PublishingBook = SeedPublishingBook & {
  synthetic?: boolean;
  updated_at?: string | null;
};

type Recommendation = {
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

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

async function loadBooks() {
  const supabase = getSupabase();
  if (!supabase) return { books: seedBooks as PublishingBook[], synthetic: true };

  const { data, error } = await supabase
    .from("publishing_books")
    .select("*")
    .order("priority", { ascending: false })
    .order("updated_at", { ascending: false });

  if (error || !data || data.length === 0) {
    return { books: seedBooks as PublishingBook[], synthetic: true, dbError: error?.message || "" };
  }

  return { books: data as PublishingBook[], synthetic: false };
}

function missingMetadata(book: PublishingBook) {
  const missing: string[] = [];
  if (!book.asin) missing.push("ASIN");
  if (!book.amazon_url) missing.push("Amazon-lenke");
  if (!book.subtitle || book.subtitle.length < 35) missing.push("sterk undertittel");
  if (!book.main_category) missing.push("kategori");
  if (!book.keywords || book.keywords.length < 5) missing.push("5-7 keywords");
  if (!book.price) missing.push("pris");
  if (!book.next_action) missing.push("neste handling");
  return missing;
}

function makeRecommendations(books: PublishingBook[]) {
  const recommendations: Recommendation[] = [];
  const activeBooks = books.filter((book) => !["parked"].includes(String(book.status || "")));
  const front = books.find((book) => book.role === "front_product") || books.find((book) => /olive oil cure/i.test(book.title));
  const nextLaunch = books.find((book) => book.role === "next_launch");
  const duplicates = books.filter((book) => /olive oil cure|time mastery|joy code/i.test(book.title));
  const duplicateGroups = new Map<string, PublishingBook[]>();

  for (const book of duplicates) {
    const key = book.title.toLowerCase();
    duplicateGroups.set(key, [...(duplicateGroups.get(key) || []), book]);
  }

  if (front) {
    recommendations.push({
      id: `front-${front.id}`,
      type: "metadata",
      priority: "CRITICAL",
      ai_score: 96,
      title: `Gjør "${front.title}" til hovedproduktet`,
      description: "Denne boken bør få første cover-, metadata-, review- og Ads-løp fordi den best binder sammen olivenolje, Spania, Doña Anna og Mediterraneo Vital.",
      impact: "Høyest sjanse for internasjonalt søk, Amazon Ads-data og kryssalg til olivenolje/nyhetsbrev.",
      effort: "medium",
      next_action: "Lag KDP-klart forslag til tittel/undertittel, HTML-beskrivelse, 7 keywords, 3 kategorier og cover-brief.",
      book_id: front.id,
      book_title: front.title,
    });

    if ((front.reviews_count || 0) < 10) {
      recommendations.push({
        id: `reviews-${front.id}`,
        type: "reviews",
        priority: "HIGH",
        ai_score: 88,
        title: `Bygg review-loop for "${front.title}"`,
        description: "Lav review-base gjør at Amazon Ads ofte blir dyrt og konverteringen svak.",
        impact: "Flere ærlige reviews øker tillit, klikk-til-kjøp og algoritmisk trygghet.",
        effort: "medium",
        next_action: "Lag early reader-liste, frivillig review-tekst og en 14-dagers oppfølgingssekvens.",
        book_id: front.id,
        book_title: front.title,
      });
    }
  }

  if (nextLaunch) {
    recommendations.push({
      id: `launch-${nextLaunch.id}`,
      type: "launch",
      priority: "HIGH",
      ai_score: 90,
      title: `Prioriter neste kommersielle lansering: "${nextLaunch.title}"`,
      description: "Kokebok + beginner + meal plan matcher kjøpsintensjonen i Mediterranean-diettnisjen bedre enn rene informasjonsbøker.",
      impact: "Kan bli trafikkmotoren som også selger The Olive Oil Cure og bygger Doña Anna-listen.",
      effort: "high",
      next_action: "Lag konkurrentanalyse, disposisjon, 100 oppskrifter, 14-dagers meal plan, ARC-plan og launch-kalender.",
      book_id: nextLaunch.id,
      book_title: nextLaunch.title,
    });
  }

  const weakMetadataBooks = activeBooks
    .map((book) => ({ book, missing: missingMetadata(book) }))
    .filter((item) => item.missing.length >= 3)
    .slice(0, 6);

  for (const { book, missing } of weakMetadataBooks) {
    recommendations.push({
      id: `metadata-${book.id}`,
      type: "metadata",
      priority: Number(book.priority || 0) >= 80 ? "HIGH" : "MEDIUM",
      ai_score: Math.min(92, Math.max(68, Number(book.priority || 60))),
      title: `Fyll metadata-hull: "${book.title}"`,
      description: `Mangler: ${missing.join(", ")}.`,
      impact: "Bedre metadata gjør at boken kan indekseres, vurderes og prioriteres riktig før betalt trafikk.",
      effort: "low",
      next_action: "Oppdater ASIN, Amazon-lenke, pris, kategori, 5-7 keywords og konkret neste handling.",
      book_id: book.id,
      book_title: book.title,
    });
  }

  if (activeBooks.length > 6) {
    recommendations.push({
      id: "portfolio-focus",
      type: "portfolio",
      priority: "HIGH",
      ai_score: 86,
      title: "Ikke markedsfør alle bøker samtidig",
      description: "Porteføljen er bred. RealtyFlow bør holde alt i oversikten, men bare aktivt pushe hovedplattformen nå.",
      impact: "Mer fokus gir bedre læring, mindre annonsetap og tydeligere forfatterposisjon.",
      effort: "low",
      next_action: "Kjør 30-dagers løp på The Olive Oil Cure, Spania 2030 som lead-book, og kokeboken som neste launch.",
    });
  }

  if (!books.some((book) => book.role === "lead_magnet")) {
    recommendations.push({
      id: "lead-magnet-checklist",
      type: "funnel",
      priority: "HIGH",
      ai_score: 84,
      title: "Lag lead magnet for alle olivenolje-bøker",
      description: "Amazon gir lite kundedata. Du trenger en frivillig e-postbro fra bok til nyhetsbrev, Doña Anna og review-team.",
      impact: "Bygger eid publikum, gjentatte salg og fremtidig lanseringskraft.",
      effort: "medium",
      next_action: "Lag PDF-en '7 Signs Your Olive Oil Is Low Quality' og legg lenke i starten/slutten av bøkene.",
    });
  }

  for (const [title, group] of Array.from(duplicateGroups.entries())) {
    if (group.length < 2) continue;
    recommendations.push({
      id: `cleanup-${title.replace(/[^a-z0-9]+/g, "-")}`,
      type: "cleanup",
      priority: "MEDIUM",
      ai_score: 72,
      title: `Rydd mulige duplikater: ${group[0].title}`,
      description: `${group.length} utgaver ligger i porteføljen. Det kan splitte reviews, forvirre lesere og gjøre annonser svakere.`,
      impact: "Samlet edition-struktur gir bedre sosial bevis og tydeligere Amazon-side.",
      effort: "medium",
      next_action: "Sjekk i KDP/Goodreads om utgavene skal kobles, slås sammen som editions eller parkeres.",
      book_id: group[0].id,
      book_title: group[0].title,
    });
  }

  recommendations.push({
    id: "ads-readiness",
    type: "ads",
    priority: "MEDIUM",
    ai_score: 74,
    title: "Vent med større Amazon Ads til metadata og reviews er bedre",
    description: "Ads bør brukes som markedsdata, ikke som hovedløsning før cover, preview, beskrivelse og review-loop er klare.",
    impact: "Reduserer bortkastet annonsebudsjett og gir renere signaler når testene starter.",
    effort: "low",
    next_action: "Start med $3-5/dag automatic discovery etter at front product er oppdatert.",
  });

  return recommendations.sort((a, b) => b.ai_score - a.ai_score);
}

async function createWorkItem(recommendation: Recommendation) {
  const supabase = getSupabase();
  if (!supabase) throw new Error("Supabase not configured");

  const payload = {
    title: recommendation.title,
    description: recommendation.description,
    status: "TO_DO",
    priority: recommendation.priority,
    due_date: new Date().toISOString().slice(0, 10),
    brand_id: "freddypublishing",
    source_type: "kdp",
    source_id: recommendation.book_id || recommendation.id,
    assigned_agent: "publishing",
    next_action: recommendation.next_action,
    ai_score: recommendation.ai_score,
    metadata: {
      recommendation_id: recommendation.id,
      recommendation_type: recommendation.type,
      book_title: recommendation.book_title || null,
      impact: recommendation.impact,
      effort: recommendation.effort,
    },
  };

  const { data, error } = await supabase.from("work_items").insert(payload).select().single();
  if (error && /source_type|check constraint|work_items_source/i.test(error.message)) {
    const fallback = { ...payload, source_type: "manual", metadata: { ...payload.metadata, fallback_source_type: "kdp" } };
    const fallbackResult = await supabase.from("work_items").insert(fallback).select().single();
    if (fallbackResult.error) throw fallbackResult.error;
    return { work_item: fallbackResult.data, fallback_source_type: "manual" };
  }
  if (error) throw error;
  return { work_item: data };
}

export async function GET(request: NextRequest) {
  const unauthorized = await requireAdminApi(request);
  if (unauthorized) return unauthorized;

  const { books, synthetic, dbError } = await loadBooks();
  const recommendations = makeRecommendations(books);
  return NextResponse.json({ recommendations, books_count: books.length, synthetic, dbError });
}

export async function POST(request: NextRequest) {
  const unauthorized = await requireAdminApi(request);
  if (unauthorized) return unauthorized;

  const body = await request.json().catch(() => ({}));
  const { books } = await loadBooks();
  const recommendation = makeRecommendations(books).find((item) => item.id === body.id);
  if (!recommendation) return NextResponse.json({ error: "Recommendation not found" }, { status: 404 });

  try {
    const result = await createWorkItem(recommendation);
    return NextResponse.json({ recommendation, ...result }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not create work item" }, { status: 500 });
  }
}
