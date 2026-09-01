import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/api-admin";
import { getServiceSupabase } from "@/services/marketing/campaign-production";

export const dynamic = "force-dynamic";

type Ids = { proposalId?: string; projectId?: string; editionId?: string; revisionId?: string };
const text = (value: unknown) => String(value || "").trim();

export async function GET(request: NextRequest) {
  const denied = await requireAdminApi(request);
  if (denied) return denied;
  const sb = getServiceSupabase();
  if (!sb) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });

  const ids: Ids = {
    proposalId: text(request.nextUrl.searchParams.get("proposalId")),
    projectId: text(request.nextUrl.searchParams.get("projectId")),
    editionId: text(request.nextUrl.searchParams.get("editionId")),
    revisionId: text(request.nextUrl.searchParams.get("revisionId")),
  };
  if (!Object.values(ids).some(Boolean)) return NextResponse.json({ error: "proposalId, projectId, editionId or revisionId is required" }, { status: 400 });

  let proposal: any = null;
  let project: any = null;
  let edition: any = null;
  let revision: any = null;

  if (ids.proposalId) {
    const res = await sb.from("publishing_learning_proposals").select("*").eq("id", ids.proposalId).maybeSingle();
    if (res.error) return NextResponse.json({ error: res.error.message }, { status: 500 });
    proposal = res.data;
    if (!proposal) return NextResponse.json({ error: "Learning proposal not found" }, { status: 404 });
  }

  if (ids.projectId) {
    const res = await sb.from("publishing_book_projects").select("id,title,subtitle,language,genre,series_name,status,metadata_plan,catalog_work_id,catalog_edition_id,created_at,updated_at").eq("id", ids.projectId).maybeSingle();
    if (res.error) return NextResponse.json({ error: res.error.message }, { status: 500 });
    project = res.data;
    if (!project) return NextResponse.json({ error: "Book Engine project not found" }, { status: 404 });
  }

  if (ids.revisionId) {
    const res = await sb.from("publishing_catalog_revisions").select("*").eq("id", ids.revisionId).maybeSingle();
    if (res.error) return NextResponse.json({ error: res.error.message }, { status: 500 });
    revision = res.data;
    if (!revision) return NextResponse.json({ error: "Catalog revision not found" }, { status: 404 });
  }

  const originProposalId = text(project?.metadata_plan?.book_os_origin?.learning_proposal_id || revision?.metadata?.book_os_origin?.learning_proposal_id);
  if (!proposal && originProposalId) {
    const res = await sb.from("publishing_learning_proposals").select("*").eq("id", originProposalId).maybeSingle();
    if (!res.error) proposal = res.data;
  }

  const resolvedEditionId = text(ids.editionId || revision?.edition_id || project?.catalog_edition_id || proposal?.edition_id);
  if (resolvedEditionId) {
    const res = await sb.from("publishing_catalog_editions").select("*").eq("id", resolvedEditionId).maybeSingle();
    if (res.error) return NextResponse.json({ error: res.error.message }, { status: 500 });
    edition = res.data;
    if (!edition) return NextResponse.json({ error: "Catalog edition not found" }, { status: 404 });
  }

  const resolvedProjectId = text(ids.projectId || edition?.canonical_project_id || revision?.project_id || revision?.metadata?.source_project_id);
  if (!project && resolvedProjectId) {
    const res = await sb.from("publishing_book_projects").select("id,title,subtitle,language,genre,series_name,status,metadata_plan,catalog_work_id,catalog_edition_id,created_at,updated_at").eq("id", resolvedProjectId).maybeSingle();
    if (!res.error) project = res.data;
  }

  const resolvedRevisionId = text(ids.revisionId || proposal?.revision_id);
  if (!revision && resolvedRevisionId) {
    const res = await sb.from("publishing_catalog_revisions").select("*").eq("id", resolvedRevisionId).maybeSingle();
    if (!res.error) revision = res.data;
  }
  if (!revision && edition?.id) {
    const res = await sb.from("publishing_catalog_revisions").select("*").eq("edition_id", edition.id).eq("is_canonical", true).maybeSingle();
    if (!res.error) revision = res.data;
  }

  const workId = text(edition?.work_id || revision?.metadata?.work_id || proposal?.work_id || project?.catalog_work_id);
  let work: any = null;
  if (workId) {
    const res = await sb.from("publishing_catalog_works").select("*").eq("id", workId).maybeSingle();
    if (!res.error) work = res.data;
  }

  const editionId = text(edition?.id || revision?.edition_id);
  const revisionId = text(revision?.id);
  const canonicalProjectId = text(edition?.canonical_project_id);

  const [ingestsRes, publicationsRes, salesRes, experimentsRes, proposalsRes] = await Promise.all([
    editionId ? sb.from("publishing_package_ingests").select("id,ingest_key,work_id,edition_id,revision_id,package_fingerprint,source,status,manifest,actor,created_at,updated_at").eq("edition_id", editionId).order("created_at", { ascending: false }).limit(50) : Promise.resolve({ data: [], error: null }),
    editionId ? sb.from("publishing_distribution_publications").select("id,project_id,book_id,channel,marketplace,external_id,external_url,status,version,submitted_at,published_at,last_synced_at,edition_id,revision_id,created_at,updated_at").eq("edition_id", editionId).order("created_at", { ascending: false }).limit(100) : Promise.resolve({ data: [], error: null }),
    revisionId ? sb.from("publishing_sales_facts").select("id,work_id,edition_id,revision_id,attribution_status,channel,marketplace,format,metric_date,orders,units,pages_read,gross_sales,royalties,ad_spend,ad_sales,ad_orders,currency,source,imported_at").eq("revision_id", revisionId).order("metric_date", { ascending: false }).limit(5000) : Promise.resolve({ data: [], error: null }),
    revisionId ? sb.from("publishing_sales_experiments").select("id,work_id,edition_id,revision_id,channel,marketplace,hypothesis,success_metric,change_field,measurement_start,measurement_end,status,proposed_by,proposed_at,decided_by,decided_at,applied_by,applied_at,evaluated_by,evaluated_at,baseline_metric,experiment_metric,relative_lift,evidence_level,created_at,updated_at").eq("revision_id", revisionId).order("created_at", { ascending: false }).limit(500) : Promise.resolve({ data: [], error: null }),
    revisionId ? sb.from("publishing_learning_proposals").select("id,proposal_type,proposal_key,work_id,edition_id,revision_id,series_name,proposed_title,dimension,success_metric,rationale,evidence_count,evidence_level,status,proposed_by,proposed_at,decided_by,decided_at,decision_note,created_at,updated_at").eq("revision_id", revisionId).order("created_at", { ascending: false }).limit(500) : Promise.resolve({ data: [], error: null }),
  ] as any);

  const queryError = ingestsRes.error || publicationsRes.error || salesRes.error || experimentsRes.error || proposalsRes.error;
  if (queryError) return NextResponse.json({ error: queryError.message }, { status: 500 });

  const sales = salesRes.data || [];
  const totals = sales.reduce((acc: Record<string, number>, row: any) => {
    for (const key of ["orders", "units", "pages_read", "gross_sales", "royalties", "ad_spend", "ad_sales", "ad_orders"]) acc[key] += Number(row[key] || 0);
    return acc;
  }, { orders: 0, units: 0, pages_read: 0, gross_sales: 0, royalties: 0, ad_spend: 0, ad_sales: 0, ad_orders: 0 });

  const conflicts: string[] = [];
  if (project?.id && canonicalProjectId && project.id !== canonicalProjectId) conflicts.push("resolved_project_differs_from_canonical_project");
  if (project?.catalog_edition_id && editionId && project.catalog_edition_id !== editionId) conflicts.push("project_catalog_edition_differs_from_resolved_edition");
  if (revision?.edition_id && editionId && revision.edition_id !== editionId) conflicts.push("revision_edition_differs_from_resolved_edition");
  if (revision?.metadata?.source_project_id && project?.id && revision.metadata.source_project_id !== project.id) conflicts.push("revision_source_project_differs_from_resolved_project");

  const missing: string[] = [];
  if (!proposal && originProposalId) missing.push("origin_learning_proposal");
  if (!project) missing.push("book_engine_project");
  if (!work) missing.push("catalog_work");
  if (!edition) missing.push("catalog_edition");
  if (!revision) missing.push("canonical_revision");

  return NextResponse.json({
    ok: true,
    readOnly: true,
    requested: ids,
    resolved: { proposalId: proposal?.id || null, projectId: project?.id || null, workId: work?.id || null, editionId: edition?.id || null, revisionId: revision?.id || null },
    lineageStatus: conflicts.length ? "conflict" : missing.length ? "incomplete" : "complete",
    conflicts,
    missing,
    proposal,
    project,
    work,
    edition,
    revision,
    packageIngests: ingestsRes.data || [],
    distributionPublications: publicationsRes.data || [],
    salesEvidence: { facts: sales, totals, channels: [...new Set(sales.map((row: any) => row.channel).filter(Boolean))] },
    experiments: experimentsRes.data || [],
    learningProposals: proposalsRes.data || [],
  });
}
