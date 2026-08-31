import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/api-admin";
import { getServiceSupabase } from "@/services/marketing/campaign-production";

export const dynamic = "force-dynamic";

function unavailable(message: string) {
  return /publishing_sales_experiments|publishing_(stage|decide|start|evaluate)_sales_experiment|schema cache|does not exist|relation/i.test(message);
}

export async function GET(request: NextRequest) {
  const denied = await requireAdminApi(request);
  if (denied) return denied;
  const sb = getServiceSupabase();
  if (!sb) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });
  const [experimentsRes, worksRes, editionsRes] = await Promise.all([
    sb.from("publishing_sales_experiments").select("*").order("created_at", { ascending: false }).limit(500),
    sb.from("publishing_catalog_works").select("id,canonical_title,series_name"),
    sb.from("publishing_catalog_editions").select("id,work_id,title,language,format,status"),
  ]);
  const error = experimentsRes.error || worksRes.error || editionsRes.error;
  if (error) return NextResponse.json({ available: false, error: unavailable(error.message) ? "Fase 5.2-migreringen er ikke installert ennå." : error.message }, { status: unavailable(error.message) ? 503 : 500 });
  const works = new Map((worksRes.data ?? []).map((row: any) => [String(row.id), row]));
  const editions = new Map((editionsRes.data ?? []).map((row: any) => [String(row.id), row]));
  return NextResponse.json({
    available: true,
    experiments: (experimentsRes.data ?? []).map((row: any) => ({ ...row, work: works.get(String(row.work_id)) ?? null, edition: editions.get(String(row.edition_id)) ?? null })),
    editions: (editionsRes.data ?? []).filter((row: any) => row.status !== "retired").map((row: any) => ({ ...row, work: works.get(String(row.work_id)) ?? null })),
  });
}

export async function POST(request: NextRequest) {
  const denied = await requireAdminApi(request);
  if (denied) return denied;
  const body = await request.json().catch(() => null);
  const sb = getServiceSupabase();
  if (!sb) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });
  let rpc = ""; let args: Record<string, unknown> = {};
  if (body?.action === "stage") {
    const required = ["editionId","channel","hypothesis","successMetric","changeField","baselineValue","proposedValue","measurementStart","measurementEnd"];
    if (required.some((key) => typeof body[key] !== "string" || !body[key].trim())) return NextResponse.json({ error: "Alle eksperimentfeltene er påkrevd" }, { status: 400 });
    rpc = "publishing_stage_sales_experiment";
    args = { p_edition_id: body.editionId, p_channel: body.channel, p_marketplace: body.marketplace || "global", p_hypothesis: body.hypothesis, p_success_metric: body.successMetric, p_currency: body.currency || null, p_change_field: body.changeField, p_baseline_value: body.baselineValue, p_proposed_value: body.proposedValue, p_measurement_start: body.measurementStart, p_measurement_end: body.measurementEnd, p_actor: "admin_ui" };
  } else if (body?.action === "decide" && typeof body.experimentId === "string" && ["approve","reject"].includes(body.decision)) {
    if (body.decision === "reject" && (typeof body.note !== "string" || !body.note.trim())) return NextResponse.json({ error: "Avvisning krever begrunnelse" }, { status: 400 });
    rpc = "publishing_decide_sales_experiment";
    args = { p_experiment_id: body.experimentId, p_decision: body.decision, p_actor: "admin_ui", p_note: typeof body.note === "string" ? body.note.trim().slice(0,1000) : null };
  } else if (body?.action === "start" && typeof body.experimentId === "string" && typeof body.applicationNote === "string" && body.applicationNote.trim()) {
    rpc = "publishing_start_sales_experiment";
    args = { p_experiment_id: body.experimentId, p_actor: "admin_ui", p_application_evidence: { note: body.applicationNote.trim().slice(0,2000), recorded_at: new Date().toISOString(), source: "admin_ui" } };
  } else if (body?.action === "evaluate" && typeof body.experimentId === "string") {
    rpc = "publishing_evaluate_sales_experiment";
    args = { p_experiment_id: body.experimentId, p_actor: "admin_ui" };
  } else return NextResponse.json({ error: "Ugyldig fase 5.2-handling" }, { status: 400 });
  const { data, error } = await sb.rpc(rpc, args);
  if (error) return NextResponse.json({ error: error.message }, { status: unavailable(error.message) ? 503 : 409 });
  return NextResponse.json({ ok: true, result: data });
}
