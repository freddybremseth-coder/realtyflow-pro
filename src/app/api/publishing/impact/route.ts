import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

export async function GET() {
  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });

  const [booksRes, importsRes] = await Promise.all([
    supabase
      .from("publishing_books")
      .select("id,title,orders,royalties,reviews_count,average_rating,role,status,updated_at")
      .order("updated_at", { ascending: false }),
    supabase
      .from("kdp_report_imports")
      .select("id,total_orders,total_royalties,currency,created_at")
      .order("created_at", { ascending: false })
      .limit(2),
  ]);

  if (booksRes.error) return NextResponse.json({ error: booksRes.error.message }, { status: 500 });
  if (importsRes.error) return NextResponse.json({ error: importsRes.error.message }, { status: 500 });

  const books = booksRes.data || [];
  const imports = importsRes.data || [];

  const totals = books.reduce(
    (acc, book) => {
      acc.orders += Number(book.orders || 0);
      acc.royalties += Number(book.royalties || 0);
      acc.reviews += Number(book.reviews_count || 0);
      if (Number(book.average_rating || 0) > 0) {
        acc.ratingSum += Number(book.average_rating || 0);
        acc.ratingCount += 1;
      }
      return acc;
    },
    { orders: 0, royalties: 0, reviews: 0, ratingSum: 0, ratingCount: 0 },
  );

  const latestImport = imports[0] || null;
  const previousImport = imports[1] || null;
  const importDelta = latestImport && previousImport
    ? {
        orders: Number(latestImport.total_orders || 0) - Number(previousImport.total_orders || 0),
        royalties: Number(latestImport.total_royalties || 0) - Number(previousImport.total_royalties || 0),
      }
    : null;

  const noSalesBooks = books
    .filter((book) => Number(book.orders || 0) === 0 && String(book.status || "") !== "parked")
    .slice(0, 5)
    .map((book) => ({ id: book.id, title: book.title, role: book.role || "support" }));

  return NextResponse.json({
    totals: {
      books: books.length,
      orders: totals.orders,
      royalties: Number(totals.royalties.toFixed(2)),
      reviews: totals.reviews,
      average_rating: totals.ratingCount ? Number((totals.ratingSum / totals.ratingCount).toFixed(2)) : null,
    },
    latest_import: latestImport,
    previous_import: previousImport,
    import_delta: importDelta,
    no_sales_books: noSalesBooks,
  });
}

