import type { SupabaseClient } from "@supabase/supabase-js";

type ParsedResult = {
  asin: string;
  title: string;
  price: number | null;
  rating: number | null;
  reviews: number | null;
  url: string;
};

function toNumber(value: string | undefined) {
  if (!value) return null;
  const cleaned = value.replace(/[^\d.,]/g, "").replace(",", ".");
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : null;
}

function parseAmazonResults(html: string): { totalEstimate: number | null; items: ParsedResult[] } {
  const totalMatch = html.match(/\"totalResultCount\"\s*:\s*(\d+)/i) || html.match(/of over ([\d,]+) results/i);
  const totalEstimate = totalMatch ? Number(String(totalMatch[1]).replace(/[^\d]/g, "")) : null;

  const items: ParsedResult[] = [];
  const blockRegex = /<div[^>]+data-asin="([A-Z0-9]{10})"[\s\S]*?<\/h2>[\s\S]*?<\/div>\s*<\/div>/gi;
  let blockMatch: RegExpExecArray | null = null;
  while ((blockMatch = blockRegex.exec(html)) && items.length < 20) {
    const block = blockMatch[0];
    const asin = blockMatch[1];
    const titleMatch = block.match(/<h2[\s\S]*?<span[^>]*>([\s\S]*?)<\/span>/i);
    const priceMatch = block.match(/a-price-whole[^>]*>([\d.,]+)/i);
    const ratingMatch = block.match(/aria-label="([\d.,]+)\s*out of 5 stars"/i);
    const reviewsMatch = block.match(/a-size-base s-underline-text">([\d,]+)/i);
    const title = (titleMatch?.[1] || "").replace(/<[^>]+>/g, "").trim();
    if (!title) continue;
    items.push({
      asin,
      title,
      price: toNumber(priceMatch?.[1]),
      rating: toNumber(ratingMatch?.[1]),
      reviews: toNumber(reviewsMatch?.[1]),
      url: `https://www.amazon.com/dp/${asin}`,
    });
  }
  return { totalEstimate, items };
}

async function fetchAmazonSearch(query: string) {
  const url = `https://www.amazon.com/s?k=${encodeURIComponent(query)}`;
  const res = await fetch(url, {
    headers: {
      "user-agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36",
      "accept-language": "en-US,en;q=0.9",
    },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Amazon search failed (${res.status}) for query: ${query}`);
  const html = await res.text();
  return parseAmazonResults(html);
}

async function getQueries(supabase: SupabaseClient) {
  const defaults = [
    "Freddy Bremseth",
    "mediterranean olive oil cookbook",
    "extra virgin olive oil guide",
    "anti inflammatory mediterranean diet",
  ];

  try {
    const { data } = await supabase.from("brand_settings").select("settings").eq("brand_id", "_system").maybeSingle();
    const configured = (data as any)?.settings?.publishing_market_queries;
    if (Array.isArray(configured) && configured.length > 0) {
      return configured.map(String).map((q) => q.trim()).filter(Boolean);
    }
  } catch {
    // ignore
  }
  return defaults;
}

export async function runPublishingMarketWatch(supabase: SupabaseClient) {
  const queries = await getQueries(supabase);
  const snapshots: Array<Record<string, unknown>> = [];

  for (const query of queries) {
    try {
      const parsed = await fetchAmazonSearch(query);
      const avgReviews =
        parsed.items.length > 0
          ? parsed.items.reduce((sum, item) => sum + Number(item.reviews || 0), 0) / parsed.items.length
          : 0;
      const avgRating =
        parsed.items.length > 0
          ? parsed.items.reduce((sum, item) => sum + Number(item.rating || 0), 0) / parsed.items.length
          : 0;

      const row = {
        brand_id: "freddypublishing",
        source: "amazon_search",
        query,
        marketplace: "amazon.com",
        total_results_estimate: parsed.totalEstimate,
        top_results: parsed.items,
        summary: {
          top_count: parsed.items.length,
          avg_reviews: Number(avgReviews.toFixed(1)),
          avg_rating: Number(avgRating.toFixed(2)),
        },
      };
      snapshots.push(row);
      await supabase.from("publishing_market_snapshots").insert(row);
    } catch (error) {
      snapshots.push({ query, error: error instanceof Error ? error.message : "scan_failed" });
    }
  }

  const { data: ownBooks } = await supabase
    .from("publishing_books")
    .select("id,title,orders,reviews_count,role,status")
    .order("updated_at", { ascending: false })
    .limit(200);

  const own = ownBooks || [];
  const ownOrders = own.reduce((sum, b: any) => sum + Number(b.orders || 0), 0);
  const ownCount = own.length;

  if (ownCount === 0) {
    await supabase.from("work_items").insert({
      title: "Importer alle Amazon-bøker til Publishing Hub",
      description: "Market Watch fant ingen egne bøker i databasen. Uten dette får vi ikke salgsoptimalisering.",
      status: "TO_DO",
      priority: "CRITICAL",
      due_date: new Date().toISOString().slice(0, 10),
      brand_id: "freddypublishing",
      source_type: "kdp",
      source_id: `marketwatch:${new Date().toISOString().slice(0, 10)}:import_books`,
      assigned_agent: "publishing",
      next_action: "Legg inn seed-bøker eller importer KDP-rapport.",
      ai_score: 99,
    });
  }

  return {
    scanned_queries: queries.length,
    snapshots_saved: snapshots.filter((s) => !(s as any).error).length,
    own_books_count: ownCount,
    own_orders_total: ownOrders,
    snapshots,
  };
}
