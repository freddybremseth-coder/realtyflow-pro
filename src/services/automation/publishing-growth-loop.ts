import type { SupabaseClient } from "@supabase/supabase-js";

type Book = {
  id: string;
  title: string;
  subtitle?: string | null;
  asin?: string | null;
  role?: string | null;
  status?: string | null;
  price?: number | null;
  reviews_count?: number | null;
  average_rating?: number | null;
  orders?: number | null;
  royalties?: number | null;
  ad_spend?: number | null;
  keywords?: string[] | null;
  main_category?: string | null;
  series_name?: string | null;
  updated_at?: string | null;
};

type GrowthAction = {
  type: "metadata" | "price" | "cover" | "series" | "reviews" | "ads";
  priority: "CRITICAL" | "HIGH" | "MEDIUM";
  title: string;
  description: string;
  next_action: string;
  ai_score: number;
};

function buildActions(book: Book): GrowthAction[] {
  const actions: GrowthAction[] = [];
  const reviews = Number(book.reviews_count || 0);
  const orders = Number(book.orders || 0);
  const spend = Number(book.ad_spend || 0);
  const rating = Number(book.average_rating || 0);
  const keywords = Array.isArray(book.keywords) ? book.keywords.length : 0;

  if (!book.subtitle || book.subtitle.length < 35 || keywords < 5 || !book.main_category) {
    actions.push({
      type: "metadata",
      priority: "CRITICAL",
      title: `KDP metadata sprint: ${book.title}`,
      description: "Boken mangler metadata som trengs for bedre synlighet i Amazon-søk.",
      next_action: "Oppdater undertittel, 7 keywords, kategori og trygg salgsbeskrivelse.",
      ai_score: 95,
    });
  }

  if (reviews < 10) {
    actions.push({
      type: "reviews",
      priority: "HIGH",
      title: `Review-loop for ${book.title}`,
      description: "Lav review-base svekker klikk-til-kjøp og algoritmisk tillit.",
      next_action: "Aktiver early reader-flyt og be om frivillige, ærlige reviews.",
      ai_score: 88,
    });
  }

  if (orders === 0 && spend > 0) {
    actions.push({
      type: "price",
      priority: "HIGH",
      title: `Pris-test for ${book.title}`,
      description: "Du bruker annonsekroner uten salgssignal. Test pris for bedre konvertering.",
      next_action: "Test Kindle-pris i 7 dager (f.eks. 2.99) og mål CTR/ordrer.",
      ai_score: 84,
    });
  }

  if (orders === 0 && reviews < 15) {
    actions.push({
      type: "cover",
      priority: "HIGH",
      title: `Cover-thumbnail test: ${book.title}`,
      description: "Ved null salg er thumbnail ofte hovedflaskehals.",
      next_action: "Bestill 2 cover-varianter og kjør A/B-test i listing + annonser.",
      ai_score: 82,
    });
  }

  if (!book.series_name || String(book.series_name).trim() === "") {
    actions.push({
      type: "series",
      priority: "MEDIUM",
      title: `Serie-posisjonering: ${book.title}`,
      description: "Boken står alene og mister kryssalg mellom egne titler.",
      next_action: "Legg boken i tydelig serie og oppdater intern kryss-promotering.",
      ai_score: 74,
    });
  }

  if (spend === 0 && reviews >= 5 && (book.role === "front_product" || book.role === "next_launch")) {
    actions.push({
      type: "ads",
      priority: "MEDIUM",
      title: `Start lav Ads-discovery: ${book.title}`,
      description: "Boken har nok grunnlag til å hente markedsdata fra Amazon Ads.",
      next_action: "Start automatic + exact keywords på lavt budsjett i 14 dager.",
      ai_score: 70,
    });
  }

  if (rating > 0 && rating < 3.8) {
    actions.push({
      type: "metadata",
      priority: "HIGH",
      title: `Forbedre forventningsmatch: ${book.title}`,
      description: "Lav rating tyder ofte på mismatch mellom listing og faktisk innhold.",
      next_action: "Juster tittel/beskrivelse så den matcher innhold og målgruppe bedre.",
      ai_score: 86,
    });
  }

  return actions;
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

export async function runPublishingGrowthLoop(supabase: SupabaseClient, options: { limit?: number } = {}) {
  const limit = Math.min(Math.max(Number(options.limit || 25), 1), 100);
  const { data: books, error } = await supabase
    .from("publishing_books")
    .select("id,title,subtitle,asin,role,status,price,reviews_count,average_rating,orders,royalties,ad_spend,keywords,main_category,series_name,updated_at")
    .order("priority", { ascending: false })
    .limit(limit);

  if (error) throw error;
  const rows = (books || []) as Book[];
  const existingRes = await supabase
    .from("work_items")
    .select("source_id,status")
    .in("source_type", ["kdp", "publishing", "manual"])
    .in("status", ["TO_DO", "IN_PROGRESS", "REVIEW"]);

  const existingOpen = new Set((existingRes.data || []).map((r: any) => String(r.source_id || "")));
  const inserts: Record<string, unknown>[] = [];

  for (const book of rows) {
    const actions = buildActions(book);
    for (const action of actions) {
      const sourceId = `growthloop:${todayKey()}:${book.id}:${action.type}`;
      if (existingOpen.has(sourceId)) continue;
      inserts.push({
        title: action.title,
        description: action.description,
        status: "TO_DO",
        priority: action.priority,
        due_date: new Date().toISOString().slice(0, 10),
        brand_id: "freddypublishing",
        source_type: "kdp",
        source_id: sourceId,
        assigned_agent: "publishing",
        next_action: action.next_action,
        ai_score: action.ai_score,
        metadata: {
          loop: "publishing_growth_v1",
          book_id: book.id,
          book_title: book.title,
          action_type: action.type,
          asin: book.asin || null,
          snapshot: {
            orders: book.orders || 0,
            royalties: book.royalties || 0,
            ad_spend: book.ad_spend || 0,
            reviews_count: book.reviews_count || 0,
            average_rating: book.average_rating || null,
          },
        },
      });
    }
  }

  if (inserts.length > 0) {
    const { error: insertErr } = await supabase.from("work_items").insert(inserts);
    if (insertErr) throw insertErr;
  }

  return {
    books_scanned: rows.length,
    actions_created: inserts.length,
    date: todayKey(),
  };
}

