import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/api-admin";
import { isDistributionReady, publicationApproval } from "@/lib/publishing/book-workflow";
import { getServiceSupabase } from "@/services/marketing/campaign-production";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const denied = await requireAdminApi(request);
  if (denied) return denied;
  const sb = getServiceSupabase();
  if (!sb) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });

  const editionId = String(request.nextUrl.searchParams.get("editionId") || "").trim();
  const revisionId = String(request.nextUrl.searchParams.get("revisionId") || "").trim();
  if (!editionId) return NextResponse.json({ error: "editionId is required" }, { status: 400 });

  const [{ data: edition, error: editionError }, { data: project, error: projectError }, { data: canonicalRevision, error: revisionError }] = await Promise.all([
    sb.from("publishing_catalog_editions").select("id,title,language,format,canonical_project_id").eq("id", editionId).maybeSingle(),
    sb.from("publishing_book_projects").select("id,title,language,status,catalog_edition_id,metadata_plan,chapter_drafts,outline_plan,updated_at").eq("catalog_edition_id", editionId).order("updated_at", { ascending: false }).limit(1).maybeSingle(),
    sb.from("publishing_catalog_revisions").select("id,edition_id,revision_number,is_canonical,status").eq("edition_id", editionId).eq("is_canonical", true).maybeSingle(),
  ]);
  const error = editionError || projectError || revisionError;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!edition) return NextResponse.json({ error: "Catalog edition not found" }, { status: 404 });

  const canonicalProjectId = String((edition as any).canonical_project_id || "").trim();
  const resolvedProject = project && (!canonicalProjectId || String((project as any).id) === canonicalProjectId) ? project : null;
  const revisionMatches = !revisionId || String((canonicalRevision as any)?.id || "") === revisionId;
  const distributionReady = Boolean(resolvedProject && isDistributionReady(resolvedProject as any));

  return NextResponse.json({
    ok: true,
    edition: {
      id: edition.id,
      title: edition.title,
      language: edition.language,
      format: edition.format,
    },
    revision: canonicalRevision,
    requestedRevisionId: revisionId || null,
    revisionMatches,
    project: resolvedProject ? {
      id: resolvedProject.id,
      title: resolvedProject.title,
      language: resolvedProject.language,
      status: resolvedProject.status,
      approval: publicationApproval(resolvedProject as any),
    } : null,
    distributionReady,
    blocking: [
      !resolvedProject ? "No canonical Book Engine project is bound to this catalog edition." : null,
      !revisionMatches ? "The requested revision is no longer the canonical revision." : null,
      resolvedProject && !distributionReady ? "The canonical project is not finally approved for distribution." : null,
    ].filter(Boolean),
    next: distributionReady && revisionMatches
      ? "Review rights, AI disclosure, channel selection and Distribution preflight. No delivery has been prepared."
      : "Resolve the blocking condition before preparing distribution.",
  });
}
