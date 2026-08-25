import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/api-admin";
import { getServiceSupabase } from "@/services/marketing/campaign-production";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const denied = await requireAdminApi(request);
  if (denied) return denied;
  const supabase = getServiceSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  const [booksRes, seriesRes, channelsRes, candidatesRes, eventsRes] = await Promise.all([
    supabase.from("book_titles").select("id,slug,title,language,series_id,series_number,amazon_url,status,cover_image_url,sample_pdf_path").eq("status", "published").order("title"),
    supabase.from("book_series").select("id,slug,title"),
    supabase.from("book_growth_channel_metadata").select("book_id,channel,marketplace,external_id,product_url,is_active").eq("channel", "amazon").eq("is_active", true),
    supabase.from("book_growth_asin_candidates").select("id,book_id,marketplace,candidate_asin,candidate_url,candidate_title,candidate_author,candidate_format,source,evidence,confidence,status,approved_by,approved_at,applied_at,created_at").order("confidence", { ascending: false }).order("created_at", { ascending: false }),
    supabase.from("book_growth_events").select("book_id,event_type,occurred_at").gte("occurred_at", new Date(Date.now() - 30 * 86400000).toISOString()).limit(10000),
  ]);
  const error = booksRes.error || seriesRes.error || channelsRes.error || candidatesRes.error || eventsRes.error;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const books = booksRes.data ?? [];
  const series = seriesRes.data ?? [];
  const channels = channelsRes.data ?? [];
  const candidates = candidatesRes.data ?? [];
  const events = eventsRes.data ?? [];
  const byBook = new Map(books.map((b: any) => [String(b.id), b]));
  const seriesById = new Map(series.map((s: any) => [String(s.id), s]));
  const amazonByBook = new Map<string, any[]>();
  for (const row of channels as any[]) {
    const k = String(row.book_id);
    const list = amazonByBook.get(k) ?? [];
    list.push(row);
    amazonByBook.set(k, list);
  }
  const intentByBook = new Map<string, number>();
  const weights: Record<string, number> = { book_view: 1, sample_click: 4, amazon_click: 6, direct_buy_click: 8 };
  for (const e of events as any[]) {
    if (!e.book_id) continue;
    const k = String(e.book_id);
    intentByBook.set(k, (intentByBook.get(k) ?? 0) + (weights[e.event_type] ?? 0));
  }
  const candidateCountByBook = new Map<string, number>();
  for (const c of candidates as any[]) {
    if (["pending", "approved"].includes(c.status)) {
      const k = String(c.book_id);
      candidateCountByBook.set(k, (candidateCountByBook.get(k) ?? 0) + 1);
    }
  }

  const missingBooks = books
    .filter((b: any) => !(amazonByBook.get(String(b.id)) ?? []).some((r: any) => Boolean(r.external_id)))
    .map((b: any) => {
      const seriesRow = b.series_id ? seriesById.get(String(b.series_id)) : null;
      const intent = intentByBook.get(String(b.id)) ?? 0;
      const candidateCount = candidateCountByBook.get(String(b.id)) ?? 0;
      const priority = intent + (b.cover_image_url ? 0 : 4) + (b.sample_pdf_path ? 0 : 3) + (candidateCount ? 8 : 0);
      return {
        id: b.id,
        slug: b.slug,
        title: b.title,
        language: b.language,
        seriesId: b.series_id,
        seriesSlug: seriesRow?.slug ?? null,
        seriesTitle: seriesRow?.title ?? null,
        seriesNumber: b.series_number,
        intent30d: intent,
        candidateCount,
        priority,
      };
    })
    .sort((a: any, b: any) => b.priority - a.priority || String(a.title).localeCompare(String(b.title)));

  return NextResponse.json({
    summary: {
      totalBooks: books.length,
      asinLinked: books.length - missingBooks.length,
      missingAsin: missingBooks.length,
      coveragePct: books.length ? Math.round(((books.length - missingBooks.length) / books.length) * 100) : 0,
      candidates: candidates.length,
      pending: candidates.filter((c: any) => c.status === "pending").length,
      approved: candidates.filter((c: any) => c.status === "approved").length,
      applied: candidates.filter((c: any) => c.status === "applied").length,
    },
    missingBooks,
    candidates: candidates.map((c: any) => ({ ...c, book: byBook.get(String(c.book_id)) ?? null })),
  });
}

export async function POST(request: NextRequest) {
  const denied = await requireAdminApi(request);
  if (denied) return denied;
  const supabase = getServiceSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });
  const body = await request.json().catch(() => ({}));
  const id = typeof body?.candidateId === "string" ? body.candidateId.trim() : "";
  const action = body?.action;
  if (!id || !["approve", "reject", "apply"].includes(action)) return NextResponse.json({ error: "candidateId og gyldig action er påkrevd" }, { status: 400 });

  if (action === "apply") {
    const { data, error } = await supabase.rpc("book_growth_apply_asin_candidate", { p_candidate_id: id, p_applied_by: "admin_ui" });
    if (error) return NextResponse.json({ error: error.message }, { status: 409 });
    return NextResponse.json({ ok: true, action, result: Array.isArray(data) ? data[0] : data });
  }

  const { data: current, error: readError } = await supabase.from("book_growth_asin_candidates").select("id,status").eq("id", id).maybeSingle();
  if (readError) return NextResponse.json({ error: readError.message }, { status: 500 });
  if (!current) return NextResponse.json({ error: "Candidate not found" }, { status: 404 });
  if (current.status !== "pending") return NextResponse.json({ error: `Candidate er allerede ${current.status}` }, { status: 409 });

  const patch = action === "approve"
    ? { status: "approved", approved_by: "admin_ui", approved_at: new Date().toISOString(), updated_at: new Date().toISOString() }
    : { status: "rejected", approved_by: null, approved_at: null, updated_at: new Date().toISOString() };
  const { data, error } = await supabase.from("book_growth_asin_candidates").update(patch).eq("id", id).eq("status", "pending").select("*").maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Candidate ble endret av en annen prosess" }, { status: 409 });
  return NextResponse.json({ ok: true, action, candidate: data });
}
