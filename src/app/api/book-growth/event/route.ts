import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/services/marketing/campaign-production";

export const dynamic = "force-dynamic";

const EVENT_TYPES = new Set(["book_view", "sample_click", "amazon_click", "direct_buy_click"]);
const DEFAULT_ORIGINS = ["https://books.freddybremseth.com"];

function allowedOrigins() {
  const configured = process.env.BOOK_GROWTH_ALLOWED_ORIGINS?.split(",").map((v) => v.trim()).filter(Boolean) ?? [];
  return configured.length ? configured : DEFAULT_ORIGINS;
}

function cors(origin: string | null) {
  const allowed = origin && allowedOrigins().includes(origin) ? origin : allowedOrigins()[0];
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

export async function OPTIONS(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (origin && !allowedOrigins().includes(origin)) return new NextResponse(null, { status: 403 });
  return new NextResponse(null, { status: 204, headers: cors(origin) });
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (origin && !allowedOrigins().includes(origin)) {
    return NextResponse.json({ error: "Origin not allowed" }, { status: 403, headers: cors(origin) });
  }

  const body = await request.json().catch(() => ({}));
  const eventType = typeof body?.eventType === "string" ? body.eventType.trim() : "";
  const bookId = typeof body?.bookId === "string" ? body.bookId.trim() : "";
  const bookSlug = typeof body?.bookSlug === "string" ? body.bookSlug.trim() : "";
  const locale = typeof body?.locale === "string" ? body.locale.slice(0, 16) : null;
  const path = typeof body?.path === "string" ? body.path.slice(0, 500) : null;
  const referrer = typeof body?.referrer === "string" ? body.referrer.slice(0, 1000) : null;

  if (!EVENT_TYPES.has(eventType)) return NextResponse.json({ error: "Invalid eventType" }, { status: 400, headers: cors(origin) });
  if (!bookId && !bookSlug) return NextResponse.json({ error: "bookId eller bookSlug er påkrevd" }, { status: 400, headers: cors(origin) });

  const supabase = getServiceSupabase();
  if (!supabase) return NextResponse.json({ error: "Service unavailable" }, { status: 503, headers: cors(origin) });

  let resolvedBookId = bookId || null;
  let resolvedSlug = bookSlug || null;
  const query = supabase.from("book_titles").select("id,slug,status").limit(1);
  const { data: book, error: bookError } = bookId
    ? await query.eq("id", bookId).maybeSingle()
    : await query.eq("slug", bookSlug).maybeSingle();

  if (bookError) return NextResponse.json({ error: "Catalog lookup failed" }, { status: 500, headers: cors(origin) });
  if (!book || book.status !== "published") return NextResponse.json({ error: "Book not found" }, { status: 404, headers: cors(origin) });
  resolvedBookId = String(book.id);
  resolvedSlug = String(book.slug);

  const utm = body?.utm && typeof body.utm === "object" ? body.utm : {};
  const payload = {
    book_id: resolvedBookId,
    book_slug: resolvedSlug,
    event_type: eventType,
    locale,
    path,
    referrer,
    utm_source: typeof utm.source === "string" ? utm.source.slice(0, 200) : null,
    utm_medium: typeof utm.medium === "string" ? utm.medium.slice(0, 200) : null,
    utm_campaign: typeof utm.campaign === "string" ? utm.campaign.slice(0, 300) : null,
    utm_content: typeof utm.content === "string" ? utm.content.slice(0, 300) : null,
    utm_term: typeof utm.term === "string" ? utm.term.slice(0, 300) : null,
    metadata: {
      source: "books_web",
      destination: typeof body?.destination === "string" ? body.destination.slice(0, 80) : null,
    },
    occurred_at: new Date().toISOString(),
  };

  const { error } = await supabase.from("book_growth_events").insert(payload);
  if (error) return NextResponse.json({ error: "Event write failed" }, { status: 500, headers: cors(origin) });

  return NextResponse.json({ ok: true }, { status: 201, headers: cors(origin) });
}
