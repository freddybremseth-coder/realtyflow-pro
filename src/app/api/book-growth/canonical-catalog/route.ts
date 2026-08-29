import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/api-admin";
import { canonicalCatalogSummary, canonicalEditionCoverage } from "@/lib/publishing/canonical-catalog";
import { getServiceSupabase } from "@/services/marketing/campaign-production";

export const dynamic = "force-dynamic";

function isCatalogUnavailable(message: string) {
  return /publishing_catalog_|schema cache|does not exist|relation/i.test(message);
}

export async function GET(request: NextRequest) {
  const denied = await requireAdminApi(request);
  if (denied) return denied;
  const supabase = getServiceSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });

  const [worksRes, editionsRes, revisionsRes, assetsRes, identifiersRes, sourceLinksRes, candidatesRes, publicationsRes] = await Promise.all([
    supabase.from("publishing_catalog_works").select("id,canonical_title,series_name,status").order("canonical_title"),
    supabase.from("publishing_catalog_editions").select("id,work_id,edition_key,title,subtitle,language,format,status,canonical_project_id,canonical_book_id,canonical_website_title_id").order("title"),
    supabase.from("publishing_catalog_revisions").select("id,edition_id,status,is_canonical"),
    supabase.from("publishing_catalog_assets").select("id,edition_id,asset_type,status,is_canonical"),
    supabase.from("publishing_catalog_identifiers").select("id,edition_id,scheme,verified"),
    supabase.from("publishing_catalog_source_links").select("id,verified"),
    supabase.from("publishing_catalog_reconciliation_candidates").select("id,source_work_id,target_work_id,match_type,confidence,evidence,status,approved_by,approved_at,applied_at,created_at").order("confidence", { ascending: false }),
    supabase.from("publishing_distribution_publications").select("id,edition_id,revision_id,status"),
  ]);
  const error = worksRes.error || editionsRes.error || revisionsRes.error || assetsRes.error || identifiersRes.error || sourceLinksRes.error || candidatesRes.error || publicationsRes.error;
  if (error) {
    if (isCatalogUnavailable(error.message)) {
      return NextResponse.json({ available: false, error: "Canonical Catalogue-migreringen er ikke installert ennå." });
    }
    return NextResponse.json({ available: false, error: error.message }, { status: 500 });
  }

  const works = worksRes.data ?? [];
  const editions = editionsRes.data ?? [];
  const revisions = revisionsRes.data ?? [];
  const assets = assetsRes.data ?? [];
  const identifiers = identifiersRes.data ?? [];
  const sourceLinks = sourceLinksRes.data ?? [];
  const candidates = candidatesRes.data ?? [];
  const publications = publicationsRes.data ?? [];
  const workById = new Map(works.map((work: any) => [String(work.id), work]));
  const coverage = canonicalEditionCoverage(editions as any, revisions as any, assets as any, identifiers as any, publications as any);

  return NextResponse.json({
    available: true,
    summary: canonicalCatalogSummary({ works, editions: editions as any, revisions: revisions as any, assets: assets as any, identifiers: identifiers as any, publications: publications as any, sourceLinks, candidates }),
    editions: coverage,
    candidates: candidates.map((candidate: any) => ({
      ...candidate,
      sourceWork: workById.get(String(candidate.source_work_id)) ?? null,
      targetWork: workById.get(String(candidate.target_work_id)) ?? null,
    })),
  });
}

export async function POST(request: NextRequest) {
  const denied = await requireAdminApi(request);
  if (denied) return denied;
  const supabase = getServiceSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });
  const body = await request.json().catch(() => ({}));
  const action = String(body?.action ?? "");
  const candidateId = typeof body?.candidateId === "string" ? body.candidateId.trim() : "";
  if (!candidateId || !["approve", "reject", "apply"].includes(action)) {
    return NextResponse.json({ error: "candidateId og gyldig action er påkrevd" }, { status: 400 });
  }

  if (action === "apply") {
    const { data, error } = await supabase.rpc("publishing_catalog_apply_merge_candidate", { candidate_id: candidateId, actor: "admin_ui" });
    if (error) return NextResponse.json({ error: error.message }, { status: isCatalogUnavailable(error.message) ? 503 : 409 });
    return NextResponse.json({ ok: true, action, result: Array.isArray(data) ? data[0] : data });
  }

  const { data: current, error: readError } = await supabase.from("publishing_catalog_reconciliation_candidates")
    .select("id,status").eq("id", candidateId).maybeSingle();
  if (readError) return NextResponse.json({ error: readError.message }, { status: isCatalogUnavailable(readError.message) ? 503 : 500 });
  if (!current) return NextResponse.json({ error: "Candidate not found" }, { status: 404 });
  if (current.status !== "pending") return NextResponse.json({ error: `Candidate er allerede ${current.status}` }, { status: 409 });
  const patch = action === "approve"
    ? { status: "approved", approved_by: "admin_ui", approved_at: new Date().toISOString(), updated_at: new Date().toISOString() }
    : { status: "rejected", approved_by: null, approved_at: null, updated_at: new Date().toISOString() };
  const { data, error } = await supabase.from("publishing_catalog_reconciliation_candidates")
    .update(patch).eq("id", candidateId).eq("status", "pending").select("*").maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Candidate ble endret av en annen prosess" }, { status: 409 });
  return NextResponse.json({ ok: true, action, candidate: data });
}
