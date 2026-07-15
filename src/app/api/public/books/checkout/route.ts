import { NextRequest } from "next/server";
import { portalJson, portalPreflight } from "@/lib/demosites-portal";
import { BOOK_ALL_ACCESS_PRICE_EUR, BOOK_PDF_PRICE_EUR, getBooksSupabase } from "@/lib/books-sales";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const SITE_BASE = process.env.BOOKS_SITE_BASE_URL || "https://www.freddybremseth.com";

/**
 * POST /api/public/books/checkout
 * Body: { book_id } for one PDF (5 EUR) or { scope: "all" } for unlimited
 * downloads of every book (50 EUR). One-time Stripe payment; the webhook
 * creates the download grant and the success page picks it up via
 * session_id.
 */
export async function POST(request: NextRequest) {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) return portalJson(request, { error: "Betaling er ikke konfigurert." }, 503);

  const supabase = getBooksSupabase();
  if (!supabase) return portalJson(request, { error: "Tjenesten er ikke tilgjengelig." }, 503);

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const scope = body.scope === "all" ? "all" : "single";
  const bookId = String(body.book_id || "").trim();
  const customerEmail = String(body.email || "").trim();

  let productName = `Alle bøker av Freddy Bremseth – ubegrenset PDF-nedlasting`;
  let amountEur = BOOK_ALL_ACCESS_PRICE_EUR;

  if (scope === "single") {
    if (!bookId) return portalJson(request, { error: "book_id er påkrevd." }, 400);
    const { data: book } = await supabase
      .from("publishing_books")
      .select("id, title, pdf_path")
      .eq("id", bookId)
      .maybeSingle();
    if (!book?.pdf_path) return portalJson(request, { error: "Boken er ikke tilgjengelig som PDF." }, 404);
    productName = `${book.title} – PDF-nedlasting`;
    amountEur = BOOK_PDF_PRICE_EUR;
  }

  const params = new URLSearchParams();
  params.set("mode", "payment");
  params.append("payment_method_types[]", "card");
  if (customerEmail.includes("@")) params.set("customer_email", customerEmail);
  params.set("locale", "auto");
  params.set("success_url", `${SITE_BASE}/nedlasting.html?session_id={CHECKOUT_SESSION_ID}`);
  params.set("cancel_url", `${SITE_BASE}/nedlasting.html`);
  params.set("line_items[0][quantity]", "1");
  params.set("line_items[0][price_data][currency]", "eur");
  params.set("line_items[0][price_data][unit_amount]", String(amountEur * 100));
  params.set("line_items[0][price_data][product_data][name]", productName);
  params.set("metadata[book_scope]", scope);
  if (scope === "single") params.set("metadata[book_id]", bookId);

  try {
    const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: { Authorization: `Bearer ${secretKey}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
      signal: AbortSignal.timeout(20_000),
    });
    const data = (await res.json()) as { url?: string; error?: { message?: string } };
    if (!res.ok || !data.url) throw new Error(data.error?.message || `Stripe feilet (HTTP ${res.status})`);
    return portalJson(request, { url: data.url });
  } catch (error) {
    console.error("[Book Checkout] Error:", error);
    return portalJson(request, { error: "Kunne ikke starte betalingen. Prøv igjen." }, 500);
  }
}

export async function OPTIONS(request: NextRequest) {
  return portalPreflight(request);
}
