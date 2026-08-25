import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/api-admin";
import { getServiceSupabase } from "@/services/marketing/campaign-production";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const denied = await requireAdminApi(request); if (denied) return denied;
  const sb = getServiceSupabase(); if (!sb) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });
  const [rowsRes, candidatesRes, booksRes] = await Promise.all([
    sb.from("book_growth_channel_metadata").select("id,book_id,channel,marketplace,external_id,product_url,format,language,title,subtitle,is_active,last_verified_at").order("book_id"),
    sb.from("book_growth_channel_metadata_candidates").select("*").order("created_at", { ascending: false }),
    sb.from("book_titles").select("id,slug,title,language,status").eq("status","published"),
  ]);
  const error = rowsRes.error || candidatesRes.error || booksRes.error; if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const books = booksRes.data ?? []; const byBook = new Map(books.map((b:any)=>[String(b.id),b]));
  const rows = (rowsRes.data ?? []).map((r:any)=>({ ...r, book: byBook.get(String(r.book_id)) ?? null }));
  const candidates = (candidatesRes.data ?? []).map((c:any)=>({ ...c, book: byBook.get(String(c.book_id)) ?? null }));
  return NextResponse.json({ summary: {
    channelRows: rows.length,
    amazonRows: rows.filter((r:any)=>r.channel==='amazon').length,
    missingFormat: rows.filter((r:any)=>r.channel==='amazon' && !r.format).length,
    missingLanguage: rows.filter((r:any)=>r.channel==='amazon' && !r.language).length,
    missingTitle: rows.filter((r:any)=>r.channel==='amazon' && !r.title).length,
    pending: candidates.filter((c:any)=>c.status==='pending').length,
    approved: candidates.filter((c:any)=>c.status==='approved').length,
    applied: candidates.filter((c:any)=>c.status==='applied').length,
  }, rows, candidates });
}

export async function POST(request: NextRequest) {
  const denied = await requireAdminApi(request); if (denied) return denied;
  const sb = getServiceSupabase(); if (!sb) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });
  const body = await request.json().catch(()=>({}));
  const id = typeof body?.candidateId === 'string' ? body.candidateId.trim() : '';
  const action = body?.action;
  if (!id || !['approve','reject','apply'].includes(action)) return NextResponse.json({ error: 'candidateId og gyldig action er påkrevd' }, { status: 400 });
  if (action === 'apply') {
    const { data, error } = await sb.rpc('book_growth_apply_channel_metadata_candidate', { p_candidate_id: id, p_applied_by: 'admin_ui' });
    if (error) return NextResponse.json({ error: error.message }, { status: 409 });
    return NextResponse.json({ ok:true, action, result: Array.isArray(data) ? data[0] : data });
  }
  const { data: current, error: readError } = await sb.from('book_growth_channel_metadata_candidates').select('id,status').eq('id',id).maybeSingle();
  if (readError) return NextResponse.json({ error: readError.message }, { status:500 });
  if (!current) return NextResponse.json({ error:'Candidate not found' }, { status:404 });
  if (current.status !== 'pending') return NextResponse.json({ error:`Candidate er allerede ${current.status}` }, { status:409 });
  const patch = action === 'approve' ? { status:'approved', approved_by:'admin_ui', approved_at:new Date().toISOString(), updated_at:new Date().toISOString() } : { status:'rejected', approved_by:null, approved_at:null, updated_at:new Date().toISOString() };
  const { data, error } = await sb.from('book_growth_channel_metadata_candidates').update(patch).eq('id',id).eq('status','pending').select('*').maybeSingle();
  if (error) return NextResponse.json({ error:error.message }, { status:500 });
  return NextResponse.json({ ok:true, action, candidate:data });
}
