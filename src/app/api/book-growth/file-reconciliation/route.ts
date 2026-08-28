import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminApi } from "@/lib/api-admin";
import { buildFileReconciliationCandidates } from "@/lib/publishing/book-file-reconciliation";
import { getServiceSupabase } from "@/services/marketing/campaign-production";

export const dynamic = "force-dynamic";

const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("scan") }),
  z.object({ action: z.enum(["approve", "reject", "apply"]), candidateId: z.string().uuid() }),
]);

async function listAllBookFiles(supabase: NonNullable<ReturnType<typeof getServiceSupabase>>) {
  const files: Array<{ name: string; bucket_id: string; created_at: string | null }> = [];
  for (let offset = 0; offset < 1000; offset += 100) {
    const { data, error } = await supabase.storage.from("book-ebooks").list("", { limit: 100, offset, sortBy: { column: "name", order: "asc" } });
    if (error) throw error;
    for (const file of data || []) if (file.name && !file.id?.endsWith("/")) files.push({ name: file.name, bucket_id: "book-ebooks", created_at: file.created_at || null });
    if ((data || []).length < 100) break;
  }
  return files;
}

async function payload(supabase: NonNullable<ReturnType<typeof getServiceSupabase>>) {
  const { data, error } = await supabase.from("book_file_reconciliation_candidates")
    .select("id,candidate_key,candidate_type,book_id,storage_bucket,storage_path,confidence,match_type,status,evidence,approved_by,approved_at,applied_at,created_at,updated_at,book:book_titles(id,slug,title,language,ebook_file_path)")
    .order("confidence", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });
  if (error) throw error;
  const rows = data || [];
  return {
    summary: {
      total: rows.length,
      pendingLinks: rows.filter((row: any) => row.status === "pending" && row.candidate_type === "link_file").length,
      duplicateGroups: rows.filter((row: any) => row.candidate_type === "duplicate_file" && row.status !== "rejected").length,
      approved: rows.filter((row: any) => row.status === "approved").length,
      applied: rows.filter((row: any) => row.status === "applied").length,
    },
    candidates: rows,
  };
}

export async function GET(request: NextRequest) {
  const denied = await requireAdminApi(request); if (denied) return denied;
  const supabase = getServiceSupabase(); if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });
  try { return NextResponse.json(await payload(supabase)); }
  catch (reason) { return NextResponse.json({ error: reason instanceof Error ? reason.message : String(reason) }, { status: 500 }); }
}

export async function POST(request: NextRequest) {
  const denied = await requireAdminApi(request); if (denied) return denied;
  const supabase = getServiceSupabase(); if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });
  const parsed = actionSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || "Invalid request" }, { status: 400 });
  try {
    if (parsed.data.action === "scan") {
      const [{ data: books, error: booksError }, files] = await Promise.all([
        supabase.from("book_titles").select("id,title,language,ebook_file_path").eq("status", "published"),
        listAllBookFiles(supabase),
      ]);
      if (booksError) throw booksError;
      const result = buildFileReconciliationCandidates(books || [], files);
      const rows = [...result.links.map((row) => ({
        candidate_key: row.candidateKey, candidate_type: row.candidateType, book_id: row.bookId,
        storage_bucket: row.storageBucket, storage_path: row.storagePath, confidence: row.confidence,
        match_type: row.matchType, evidence: { title: row.title, language: row.language, method: "deterministic_title_file_match_v1" },
      })), ...result.duplicates.map((row) => ({
        candidate_key: row.candidateKey, candidate_type: row.candidateType, book_id: null,
        storage_bucket: row.storageBucket, storage_path: row.storagePath, confidence: null,
        match_type: null, evidence: row.evidence,
      }))];
      if (rows.length) {
        const { error } = await supabase.from("book_file_reconciliation_candidates").upsert(rows, { onConflict: "candidate_key", ignoreDuplicates: true });
        if (error) throw error;
      }
      return NextResponse.json({ ok: true, scannedFiles: files.length, proposedLinks: result.links.length, duplicateGroups: result.duplicates.length, ...(await payload(supabase)) });
    }

    if (parsed.data.action === "apply") {
      const { data, error } = await supabase.rpc("book_file_reconciliation_apply", { p_candidate_id: parsed.data.candidateId, p_applied_by: "admin_ui" });
      if (error) return NextResponse.json({ error: error.message }, { status: 409 });
      return NextResponse.json({ ok: true, result: Array.isArray(data) ? data[0] : data });
    }

    const { data: current, error: readError } = await supabase.from("book_file_reconciliation_candidates").select("id,status").eq("id", parsed.data.candidateId).maybeSingle();
    if (readError) throw readError;
    if (!current) return NextResponse.json({ error: "Candidate not found" }, { status: 404 });
    if (current.status !== "pending") return NextResponse.json({ error: `Candidate is already ${current.status}` }, { status: 409 });
    const now = new Date().toISOString();
    const patch = parsed.data.action === "approve"
      ? { status: "approved", approved_by: "admin_ui", approved_at: now, updated_at: now }
      : { status: "rejected", approved_by: null, approved_at: null, updated_at: now };
    const { error } = await supabase.from("book_file_reconciliation_candidates").update(patch).eq("id", parsed.data.candidateId).eq("status", "pending");
    if (error) throw error;
    return NextResponse.json({ ok: true, status: patch.status });
  } catch (reason) {
    return NextResponse.json({ error: reason instanceof Error ? reason.message : String(reason) }, { status: 500 });
  }
}
