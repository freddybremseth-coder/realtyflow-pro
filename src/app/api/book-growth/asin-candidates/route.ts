import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/api-admin";
import { getServiceSupabase } from "@/services/marketing/campaign-production";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const denied = await requireAdminApi(request);
  if (denied) return denied;
  const supabase = getServiceSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  const [booksRes, candidatesRes] = await Promise.all([
    supabase.from("book_titles").select("id,slug,title,language,series_id,series_number,amazon_url,status").eq("status", "published").order("title"),
    supabase.from("book_growth_asin_candidates").select("id,book_id,marketplace,candidate_asin,candidate_url,candidate_title,candidate_author,candidate_format,source,evidence,confidence,status,approved_by,approved_at,applied_at,created_at").order("confidence", { ascending: false }).order("created_at", { ascending: false }),
  ]);
  const error = booksRes.error || candidatesRes.error;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const books = booksRes.data ?? [];
  const candidates = candidatesRes.data ?? [];
  const byBook = new Map(books.map((b: any) => [String(b.id), b]));
  return NextResponse.json({
    summary: {
      totalBooks: books.length,
      candidates: candidates.length,
      pending: candidates.filter((c: any) => c.status === "pending").length,
      approved: candidates.filter((c: any) => c.status === "approved").length,
      applied: candidates.filter((c: any) => c.status === "applied").length,
    },
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
