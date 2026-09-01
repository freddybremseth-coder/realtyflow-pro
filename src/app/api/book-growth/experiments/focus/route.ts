import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/api-admin";
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

  const [{ data: edition, error: editionError }, { data: revision, error: revisionError }, { data: facts, error: factsError }, { data: experiments, error: experimentsError }] = await Promise.all([
    sb.from("publishing_catalog_editions").select("id,work_id,title,language,format,status").eq("id", editionId).maybeSingle(),
    sb.from("publishing_catalog_revisions").select("id,edition_id,revision_number,is_canonical,status").eq("edition_id", editionId).eq("is_canonical", true).maybeSingle(),
    sb.from("publishing_sales_facts").select("id,edition_id,revision_id,attribution_status,channel,marketplace,metric_date,orders,units,pages_read,gross_sales,royalties,ad_sales,currency").eq("edition_id", editionId).order("metric_date", { ascending: false }).limit(5000),
    sb.from("publishing_sales_experiments").select("id,edition_id,revision_id,channel,marketplace,change_field,success_metric,proposed_value,status,measurement_start,measurement_end,relative_lift,evidence_level,created_at").eq("edition_id", editionId).order("created_at", { ascending: false }).limit(500),
  ]);
  const error = editionError || revisionError || factsError || experimentsError;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!edition || edition.status === "retired") return NextResponse.json({ error: "Active catalog edition not found" }, { status: 404 });

  const canonicalRevisionId = String((revision as any)?.id || "");
  const revisionMatches = !revisionId || canonicalRevisionId === revisionId;
  const focusedRevisionId = revisionId || canonicalRevisionId;
  const exactFacts = (facts ?? []).filter((row: any) => String(row.revision_id || "") === focusedRevisionId);
  const exactRevisionFacts = exactFacts.filter((row: any) => row.attribution_status === "exact_revision");
  const focusedExperiments = (experiments ?? []).filter((row: any) => String(row.revision_id || "") === focusedRevisionId);
  const activeExperiments = focusedExperiments.filter((row: any) => ["proposed", "approved", "running"].includes(String(row.status)));
  const completedDirectional = focusedExperiments.filter((row: any) => row.status === "completed" && row.evidence_level === "directional" && row.relative_lift != null);
  const repeatedGroups = new Map<string, any[]>();
  for (const row of completedDirectional) {
    const key = [row.channel, row.marketplace, row.change_field, row.success_metric, JSON.stringify(row.proposed_value)].join("|");
    repeatedGroups.set(key, [...(repeatedGroups.get(key) || []), row]);
  }
  const eligibleLearningGroups = [...repeatedGroups.values()].filter((rows) => rows.length >= 3).map((rows) => ({
    channel: rows[0]?.channel,
    marketplace: rows[0]?.marketplace,
    changeField: rows[0]?.change_field,
    successMetric: rows[0]?.success_metric,
    proposedValue: rows[0]?.proposed_value,
    experimentCount: rows.length,
    averageRelativeLift: rows.reduce((sum, row) => sum + Number(row.relative_lift || 0), 0) / rows.length,
    experimentIds: rows.map((row) => row.id),
  }));
  const channels = [...new Set(exactFacts.map((row: any) => String(row.channel || "")).filter(Boolean))];
  const metricCoverage = {
    orders: exactFacts.some((row: any) => Number(row.orders || 0) !== 0),
    units: exactFacts.some((row: any) => Number(row.units || 0) !== 0),
    pages_read: exactFacts.some((row: any) => Number(row.pages_read || 0) !== 0),
    gross_sales: exactFacts.some((row: any) => Number(row.gross_sales || 0) !== 0),
    royalties: exactFacts.some((row: any) => Number(row.royalties || 0) !== 0),
    ad_sales: exactFacts.some((row: any) => Number(row.ad_sales || 0) !== 0),
  };

  return NextResponse.json({
    ok: true,
    edition,
    canonicalRevision: revision,
    requestedRevisionId: revisionId || null,
    revisionMatches,
    facts: {
      total: exactFacts.length,
      exactRevision: exactRevisionFacts.length,
      channels,
      metricCoverage,
      firstMetricDate: exactFacts.length ? exactFacts[exactFacts.length - 1]?.metric_date ?? null : null,
      lastMetricDate: exactFacts[0]?.metric_date ?? null,
    },
    experiments: focusedExperiments,
    activeExperimentCount: activeExperiments.length,
    completedDirectionalCount: completedDirectional.length,
    eligibleLearningGroups,
    learningEligible: Boolean(revisionMatches && eligibleLearningGroups.length > 0),
    learningHref: revisionMatches && eligibleLearningGroups.length > 0
      ? `/book-growth/learning?editionId=${encodeURIComponent(editionId)}&revisionId=${encodeURIComponent(focusedRevisionId)}`
      : null,
    canOpenProposalForm: Boolean(revisionMatches && canonicalRevisionId),
    note: "This focus endpoint is read-only. Staging an experiment remains explicit; learning eligibility mirrors the phase 5.3 minimum of three completed directional experiments in the same canonical evidence group.",
  });
}
