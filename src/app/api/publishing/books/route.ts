import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { seedBooks } from "@/lib/publishing/seed-books";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

function supabaseProjectHost() {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    return url ? new URL(url).host : null;
  } catch {
    return null;
  }
}

function normalizeList(value: unknown) {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  return String(value || "")
    .split(/[,;\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function sanitizeBook(body: Record<string, unknown>) {
  const keywords = normalizeList(body.keywords);
  return {
    brand_id: String(body.brand_id || "freddypublishing"),
    title: String(body.title || "").trim(),
    subtitle: String(body.subtitle || ""),
    asin: String(body.asin || "").trim() || null,
    format: String(body.format || "kindle"),
    marketplace: String(body.marketplace || "amazon.com"),
    amazon_url: String(body.amazon_url || ""),
    niche: String(body.niche || "olive_oil_mediterranean"),
    series_name: String(body.series_name || ""),
    role: String(body.role || "support"),
    status: String(body.status || "audit"),
    price: body.price === "" || body.price === null || body.price === undefined ? null : Number(body.price),
    currency: String(body.currency || "USD"),
    reviews_count: Number(body.reviews_count || 0),
    average_rating: body.average_rating === "" || body.average_rating === null || body.average_rating === undefined ? null : Number(body.average_rating),
    best_sellers_rank: body.best_sellers_rank === "" || body.best_sellers_rank === null || body.best_sellers_rank === undefined ? null : Number(body.best_sellers_rank),
    main_category: String(body.main_category || ""),
    keywords,
    ad_spend: Number(body.ad_spend || 0),
    clicks: Number(body.clicks || 0),
    orders: Number(body.orders || 0),
    royalties: Number(body.royalties || 0),
    acos: body.acos === "" || body.acos === null || body.acos === undefined ? null : Number(body.acos),
    next_action: String(body.next_action || ""),
    priority: Math.max(0, Math.min(100, Number(body.priority || 50))),
    notes: String(body.notes || ""),
    last_checked_at: body.last_checked_at || new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

export async function GET(request: NextRequest) {
  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ books: seedBooks, synthetic: true });

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");
  const role = searchParams.get("role");

  let query = supabase
    .from("publishing_books")
    .select("*")
    .order("priority", { ascending: false })
    .order("updated_at", { ascending: false });

  if (status) query = query.eq("status", status);
  if (role) query = query.eq("role", role);

  const { data, error } = await query;
  if (error) {
    if (/publishing_books|schema cache|does not exist|relation/i.test(error.message)) {
      return NextResponse.json({
        books: seedBooks,
        synthetic: true,
        tableNotReady: true,
        dbError: error.message,
        supabaseHost: supabaseProjectHost(),
      });
    }
    return NextResponse.json({ error: error.message, books: [] }, { status: 500 });
  }

  if (!data || data.length === 0) {
    return NextResponse.json({ books: seedBooks, synthetic: true, emptyDatabase: true });
  }

  return NextResponse.json({ books: data, synthetic: false });
}

export async function POST(request: NextRequest) {
  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  const body = await request.json().catch(() => ({}));
  const payload = sanitizeBook(body);
  if (!payload.title) return NextResponse.json({ error: "title is required" }, { status: 400 });

  const { data, error } = await supabase.from("publishing_books").insert(payload).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ book: data }, { status: 201 });
}

export async function PATCH(request: NextRequest) {
  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  const body = await request.json().catch(() => ({}));
  const id = String(body.id || "");
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
  if (id.startsWith("seed-")) return NextResponse.json({ error: "Seed books require database migration before editing." }, { status: 409 });

  const payload = sanitizeBook(body);
  if (!payload.title) delete (payload as Partial<typeof payload>).title;

  const { data, error } = await supabase.from("publishing_books").update(payload).eq("id", id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ book: data });
}
