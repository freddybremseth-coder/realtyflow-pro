import { randomBytes } from "node:crypto";
import { NextRequest } from "next/server";
import { portalJson, portalPreflight } from "@/lib/demosites-portal";
import { getBooksSupabase } from "@/lib/books-sales";

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
  email: string | null;
};

async function grantFromSession(supabase: NonNullable<ReturnType<typeof getBooksSupabase>>, sessionId: string): Promise<GrantRow | { error: string; status: number }> {
  const { data: existing } = await supabase
    .from("book_download_grants")
    .select("id, token, scope, book_id, email")
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
    customer_details?: { email?: string };
    metadata?: { book_scope?: string; book_id?: string };
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
    stripe_session_id: sessionId,
  };
  const { data: created, error } = await supabase
    .from("book_download_grants")
    .insert(insert)
    .select("id, token, scope, book_id, email")
    .single();
  if (error) {
    // Unique race with the webhook — read the row it created.
    const { data: raced } = await supabase
      .from("book_download_grants")
      .select("id, token, scope, book_id, email")
      .eq("stripe_session_id", sessionId)
      .maybeSingle();
    if (raced) return raced as GrantRow;
    return { error: "Kjør migrasjonen 20260716090000_book_pdf_sales.sql i Supabase.", status: 500 };
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
      .select("id, token, scope, book_id, email")
      .eq("token", token)
      .maybeSingle();
    if (!data) return portalJson(request, { error: "Ugyldig nedlastingslenke." }, 404);
    grant = data as GrantRow;
  } else {
    return portalJson(request, { error: "session_id eller token er påkrevd." }, 400);
  }

  let query = supabase
    .from("publishing_books")
    .select("id, title, subtitle")
    .not("pdf_path", "is", null)
    .order("title");
  if (grant.scope === "single" && grant.book_id) query = query.eq("id", grant.book_id);

  const { data: books } = await query;
  return portalJson(request, {
    token: grant.token,
    scope: grant.scope,
    books: books || [],
  });
}

export async function OPTIONS(request: NextRequest) {
  return portalPreflight(request);
}
