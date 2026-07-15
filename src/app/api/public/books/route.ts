import { NextRequest } from "next/server";
import { portalJson, portalPreflight } from "@/lib/demosites-portal";
import { BOOK_ALL_ACCESS_PRICE_EUR, BOOK_PDF_PRICE_EUR, getBooksSupabase } from "@/lib/books-sales";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * GET /api/public/books — the storefront list for freddybremseth.com:
 * every book with an uploaded PDF, plus the fixed pricing (5 EUR per
 * download, 50 EUR unlimited).
 */
export async function GET(request: NextRequest) {
  const supabase = getBooksSupabase();
  if (!supabase) return portalJson(request, { error: "Tjenesten er ikke tilgjengelig." }, 503);

  const { data, error } = await supabase
    .from("publishing_books")
    .select("id, title, subtitle, series_name, niche, amazon_url, pdf_path")
    .not("pdf_path", "is", null)
    .order("title");

  if (error) {
    const missingColumn = /pdf_path/.test(error.message);
    return portalJson(
      request,
      { error: missingColumn ? "Kjør migrasjonen 20260716090000_book_pdf_sales.sql i Supabase." : error.message },
      500,
    );
  }

  const books = (data || []).map((book) => ({
    id: book.id,
    title: book.title,
    subtitle: book.subtitle || "",
    series: book.series_name || "",
  }));

  return portalJson(request, {
    books,
    pricing: { single_eur: BOOK_PDF_PRICE_EUR, all_eur: BOOK_ALL_ACCESS_PRICE_EUR },
  });
}

export async function OPTIONS(request: NextRequest) {
  return portalPreflight(request);
}
