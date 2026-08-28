import { randomBytes } from "node:crypto";
import { NextRequest } from "next/server";
import { portalJson, portalPreflight } from "@/lib/demosites-portal";
import { availableBookFormats, getBooksSupabase, isBookFileFormat } from "@/lib/books-sales";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * GET /api/public/books/access?session_id=…   (right after payment)
 * GET /api/public/books/access?token=…        (returning customer link)
 *
 * Resolves a paid Stripe session into a permanent download grant
 * (idempotent on stripe_session_id — works even if the webhook lags),
 * or looks up an existing grant by token. Returns the token plus the
 * list of books it unlocks.
 */

type GrantRow = {
  id: string;
  token: string;
  scope: "single" | "all";
  book_id: string | null;
  file_format: "pdf" | "epub" | null;
  email: string | null;
};

async function grantFromSession(supabase: NonNullable<ReturnType<typeof getBooksSupabase>>, sessionId: string): Promise<GrantRow | { error: string; status: number }> {
  const { data: existing } = await supabase
    .from("book_download_grants")
    .select("id, token, scope, book_id, file_format, email")
    .eq("stripe_session_id", sessionId)
    .maybeSingle();
  if (existing) return existing as GrantRow;

  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) return { error: "Betaling er ikke konfigurert.", status: 503 };

  const res = await fetch(`https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}`, {
    headers: { Authorization: `Bearer ${secretKey}` },
    signal: AbortSignal.timeout(15_000),
  });
  const session = (await res.json()) as {
    payment_status?: string;
    amount_total?: number;
    currency?: string;
    customer_details?: { email?: string };
    metadata?: { book_scope?: string; book_id?: string; book_format?: string };
  };
  if (!res.ok) return { error: "Fant ikke betalingen.", status: 404 };
  if (session.payment_status !== "paid") return { error: "Betalingen er ikke fullført ennå.", status: 402 };
  if (!session.metadata?.book_scope) return { error: "Denne betalingen gjelder ikke bøker.", status: 400 };

  const scope = session.metadata.book_scope === "all" ? "all" : "single";
  const insert = {
    token: randomBytes(24).toString("hex"),
    email: session.customer_details?.email || null,
    scope,
    book_id: scope === "single" ? session.metadata.book_id || null : null,
    file_format: scope === "single" && isBookFileFormat(session.metadata.book_format) ? session.metadata.book_format : null,
    stripe_session_id: sessionId,
  };
  const { data: created, error } = await supabase
    .from("book_download_grants")
    .insert(insert)
    .select("id, token, scope, book_id, file_format, email")
    .single();
  if (error) {
    // Unique race with the webhook — read the row it created.
    const { data: raced } = await supabase
      .from("book_download_grants")
      .select("id, token, scope, book_id, file_format, email")
      .eq("stripe_session_id", sessionId)
      .maybeSingle();
    if (raced) return raced as GrantRow;
    return { error: "Boktilgangen kunne ikke opprettes.", status: 500 };
  }
  if (scope === "single" && insert.book_id && insert.file_format) {
    await supabase.rpc("publishing_record_direct_sale", {
      p_stripe_session_id: sessionId,
      p_book_id: insert.book_id,
      p_file_format: insert.file_format,
      p_gross_amount: Number(session.amount_total || 0) / 100,
      p_currency: String(session.currency || "eur"),
      p_metadata: { source: "books_access_confirmation" },
    });
  }
  return created as GrantRow;
}

export async function GET(request: NextRequest) {
  const supabase = getBooksSupabase();
  if (!supabase) return portalJson(request, { error: "Tjenesten er ikke tilgjengelig." }, 503);

  const sessionId = String(request.nextUrl.searchParams.get("session_id") || "").trim();
  const token = String(request.nextUrl.searchParams.get("token") || "").trim();

  let grant: GrantRow;
  if (sessionId) {
    const resolved = await grantFromSession(supabase, sessionId);
    if ("error" in resolved) return portalJson(request, { error: resolved.error }, resolved.status);
    grant = resolved;
  } else if (token) {
    const { data } = await supabase
      .from("book_download_grants")
      .select("id, token, scope, book_id, file_format, email")
      .eq("token", token)
      .maybeSingle();
    if (!data) return portalJson(request, { error: "Ugyldig nedlastingslenke." }, 404);
    grant = data as GrantRow;
  } else {
    return portalJson(request, { error: "session_id eller token er påkrevd." }, 400);
  }

  let query = supabase
    .from("publishing_books")
    .select("id, title, subtitle, pdf_path, epub_path")
    .or("pdf_path.not.is.null,epub_path.not.is.null")
    .order("title");
  if (grant.scope === "single" && grant.book_id) query = query.eq("id", grant.book_id);

  const { data: books } = await query;
  return portalJson(request, {
    token: grant.token,
    scope: grant.scope,
    books: (books || []).map((book) => ({
      id: book.id,
      title: book.title,
      subtitle: book.subtitle,
      formats: grant.scope === "single" && grant.file_format ? [grant.file_format] : availableBookFormats(book),
    })),
  });
}

export async function OPTIONS(request: NextRequest) {
  return portalPreflight(request);
}
