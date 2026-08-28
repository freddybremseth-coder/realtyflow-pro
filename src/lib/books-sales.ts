/** Shared helpers for direct digital-book sales on books.freddybremseth.com. */
import { createClient } from "@supabase/supabase-js";

export const BOOK_PDF_PRICE_EUR = 5;
export const BOOK_EPUB_PRICE_EUR = 5;
export const BOOK_ALL_ACCESS_PRICE_EUR = 50;
export const BOOK_MIN_PRICE_EUR = 1.99;
export const BOOK_MAX_PRICE_EUR = 49.99;

export type BookFileFormat = "pdf" | "epub";

export function isBookFileFormat(value: unknown): value is BookFileFormat {
  return value === "pdf" || value === "epub";
}

export function safeBookPrice(value: unknown, fallback = BOOK_EPUB_PRICE_EUR) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.round(Math.min(BOOK_MAX_PRICE_EUR, Math.max(BOOK_MIN_PRICE_EUR, parsed)) * 100) / 100;
}

export function availableBookFormats(book: { pdf_path?: unknown; epub_path?: unknown }): BookFileFormat[] {
  const formats: BookFileFormat[] = [];
  if (String(book.pdf_path || "").trim()) formats.push("pdf");
  if (String(book.epub_path || "").trim()) formats.push("epub");
  return formats;
}

export function resolveBookDownload(
  book: { title?: unknown; pdf_path?: unknown; epub_path?: unknown },
  requested: unknown,
  granted: unknown,
) {
  const requestedFormat = isBookFileFormat(requested) ? requested : null;
  const grantedFormat = isBookFileFormat(granted) ? granted : null;
  if (requestedFormat && grantedFormat && requestedFormat !== grantedFormat) return null;
  const format = grantedFormat || requestedFormat || (book.pdf_path ? "pdf" : book.epub_path ? "epub" : null);
  if (!format) return null;
  const path = String(format === "pdf" ? book.pdf_path || "" : book.epub_path || "").trim();
  if (!path) return null;
  const safeTitle = String(book.title || "book").trim() || "book";
  return {
    format,
    path,
    bucket: format === "pdf" ? "book-pdfs" : "book-epubs",
    filename: `${safeTitle}.${format}`,
  };
}

export function getBooksSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}
