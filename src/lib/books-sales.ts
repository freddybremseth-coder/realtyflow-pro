/** Shared helpers for direct PDF book sales on freddybremseth.com. */
import { createClient } from "@supabase/supabase-js";

export const BOOK_PDF_PRICE_EUR = 5;
export const BOOK_ALL_ACCESS_PRICE_EUR = 50;

export function getBooksSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}
