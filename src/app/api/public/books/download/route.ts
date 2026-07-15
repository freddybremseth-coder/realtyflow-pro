import { NextRequest, NextResponse } from "next/server";
import { portalJson, portalPreflight } from "@/lib/demosites-portal";
import { getBooksSupabase } from "@/lib/books-sales";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * GET /api/public/books/download?token=…&book_id=…
 *
 * Validates the purchase grant (single book or all-access) and redirects
 * to a 30-minute signed URL for the PDF in the private bucket. The token
 * itself never expires — unlimited customers keep their link forever.
 */
export async function GET(request: NextRequest) {
  const supabase = getBooksSupabase();
  if (!supabase) return portalJson(request, { error: "Tjenesten er ikke tilgjengelig." }, 503);

  const token = String(request.nextUrl.searchParams.get("token") || "").trim();
  const bookId = String(request.nextUrl.searchParams.get("book_id") || "").trim();
  if (!token || !bookId) return portalJson(request, { error: "token og book_id er påkrevd." }, 400);

  const { data: grant } = await supabase
    .from("book_download_grants")
    .select("id, scope, book_id, download_count")
    .eq("token", token)
    .maybeSingle();
  if (!grant) return portalJson(request, { error: "Ugyldig nedlastingslenke." }, 404);
  if (grant.scope === "single" && grant.book_id !== bookId) {
    return portalJson(request, { error: "Kjøpet ditt gjelder en annen bok. Oppgrader til 'alle bøker' for full tilgang." }, 403);
  }

  const { data: book } = await supabase
    .from("publishing_books")
    .select("id, title, pdf_path")
    .eq("id", bookId)
    .maybeSingle();
  if (!book?.pdf_path) return portalJson(request, { error: "Fant ikke PDF-en for denne boken." }, 404);

  const { data: signed, error: signError } = await supabase.storage
    .from("book-pdfs")
    .createSignedUrl(book.pdf_path, 60 * 30, { download: `${book.title}.pdf` });
  if (signError || !signed?.signedUrl) {
    return portalJson(request, { error: "Kunne ikke klargjøre nedlastingen. Kontakt post@chatgenius.pro." }, 500);
  }

  await supabase
    .from("book_download_grants")
    .update({ download_count: (grant.download_count || 0) + 1, last_downloaded_at: new Date().toISOString() })
    .eq("id", grant.id);

  return NextResponse.redirect(signed.signedUrl, 302);
}

export async function OPTIONS(request: NextRequest) {
  return portalPreflight(request);
}
