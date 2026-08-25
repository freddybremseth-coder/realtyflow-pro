import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/api-admin";
import { getServiceSupabase } from "@/services/marketing/campaign-production";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const denied = await requireAdminApi(request);
  if (denied) return denied;
  const supabase = getServiceSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  const [worksRes, membersRes, booksRes, seriesRes, candidatesRes] = await Promise.all([
    supabase.from("book_growth_works").select("id,series_id,work_key,canonical_title,canonical_series_number,status,metadata").order("canonical_title"),
    supabase.from("book_growth_work_members").select("work_id,book_id,relation_type,confidence,verified,evidence"),
    supabase.from("book_titles").select("id,slug,title,language,series_number,status").eq("status", "published"),
    supabase.from("book_series").select("id,slug,title"),
    supabase.from("book_growth_work_merge_candidates").select("id,source_work_id,target_work_id,relation_type,source,evidence,confidence,status,approved_by,approved_at,applied_at,created_at").order("confidence", { ascending: false }),
  ]);
  const error = worksRes.error || membersRes.error || booksRes.error || seriesRes.error || candidatesRes.error;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const works = worksRes.data ?? [];
  const members = membersRes.data ?? [];
  const books = booksRes.data ?? [];
  const series = seriesRes.data ?? [];
  const candidates = candidatesRes.data ?? [];
  const bookById = new Map(books.map((b: any) => [String(b.id), b]));
  const seriesById = new Map(series.map((s: any) => [String(s.id), s]));
  const workById = new Map(works.map((w: any) => [String(w.id), w]));
  const membersByWork = new Map<string, any[]>();
  for (const m of members as any[]) {
    const key = String(m.work_id);
    const list = membersByWork.get(key) ?? [];
    list.push({ ...m, book: bookById.get(String(m.book_id)) ?? null });
    membersByWork.set(key, list);
  }

  const hydrateWork = (id: string) => {
    const w: any = workById.get(String(id));
    if (!w) return null;
    return {
      ...w,
      series: w.series_id ? seriesById.get(String(w.series_id)) ?? null : null,
      members: membersByWork.get(String(w.id)) ?? [],
    };
  };

  const grouped = works.map((w: any) => hydrateWork(String(w.id))).filter(Boolean);
  const unverifiedGroups = grouped.filter((w: any) => w.status !== "archived" && w.members.length > 1 && w.members.some((m: any) => !m.verified));

  return NextResponse.json({
    summary: {
      activeWorks: works.filter((w: any) => w.status !== "archived").length,
      archivedWorks: works.filter((w: any) => w.status === "archived").length,
      totalMembers: members.length,
      verifiedMembers: members.filter((m: any) => Boolean(m.verified)).length,
      unverifiedGroups: unverifiedGroups.length,
      mergeCandidates: candidates.length,
      pendingMerges: candidates.filter((c: any) => c.status === "pending").length,
      approvedMerges: candidates.filter((c: any) => c.status === "approved").length,
      appliedMerges: candidates.filter((c: any) => c.status === "applied").length,
    },
    unverifiedGroups,
    candidates: candidates.map((c: any) => ({ ...c, sourceWork: hydrateWork(String(c.source_work_id)), targetWork: hydrateWork(String(c.target_work_id)) })),
  });
}

export async function POST(request: NextRequest) {
  const denied = await requireAdminApi(request);
  if (denied) return denied;
  const supabase = getServiceSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });
  const body = await request.json().catch(() => ({}));
  const action = String(body?.action ?? "");

  if (action === "verify_group") {
    const workId = typeof body?.workId === "string" ? body.workId.trim() : "";
    if (!workId) return NextResponse.json({ error: "workId er påkrevd" }, { status: 400 });
    const { data: members, error: memberError } = await supabase.from("book_growth_work_members").select("book_id").eq("work_id", workId);
    if (memberError) return NextResponse.json({ error: memberError.message }, { status: 500 });
    if (!members || members.length < 2) return NextResponse.json({ error: "Work må ha minst to members for group verification" }, { status: 409 });
    const now = new Date().toISOString();
    const { error: updateMembersError } = await supabase.from("book_growth_work_members").update({ verified: true, confidence: 1, evidence: { method: "admin_group_verification", verified_at: now } }).eq("work_id", workId);
    if (updateMembersError) return NextResponse.json({ error: updateMembersError.message }, { status: 500 });
    const { error: updateWorkError } = await supabase.from("book_growth_works").update({ status: "verified" }).eq("id", workId);
    if (updateWorkError) return NextResponse.json({ error: updateWorkError.message }, { status: 500 });
    return NextResponse.json({ ok: true, action, workId, verifiedMembers: members.length });
  }

  const candidateId = typeof body?.candidateId === "string" ? body.candidateId.trim() : "";
  if (!candidateId || !["approve", "reject", "apply"].includes(action)) return NextResponse.json({ error: "candidateId og gyldig action er påkrevd" }, { status: 400 });

  if (action === "apply") {
    const { data, error } = await supabase.rpc("book_growth_apply_work_merge", { p_candidate_id: candidateId, p_applied_by: "admin_ui" });
    if (error) return NextResponse.json({ error: error.message }, { status: 409 });
    return NextResponse.json({ ok: true, action, result: Array.isArray(data) ? data[0] : data });
  }

  const { data: current, error: readError } = await supabase.from("book_growth_work_merge_candidates").select("id,status").eq("id", candidateId).maybeSingle();
  if (readError) return NextResponse.json({ error: readError.message }, { status: 500 });
  if (!current) return NextResponse.json({ error: "Candidate not found" }, { status: 404 });
  if (current.status !== "pending") return NextResponse.json({ error: `Candidate er allerede ${current.status}` }, { status: 409 });
  const patch = action === "approve"
    ? { status: "approved", approved_by: "admin_ui", approved_at: new Date().toISOString(), updated_at: new Date().toISOString() }
    : { status: "rejected", approved_by: null, approved_at: null, updated_at: new Date().toISOString() };
  const { data, error } = await supabase.from("book_growth_work_merge_candidates").update(patch).eq("id", candidateId).eq("status", "pending").select("*").maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Candidate ble endret av en annen prosess" }, { status: 409 });
  return NextResponse.json({ ok: true, action, candidate: data });
}
