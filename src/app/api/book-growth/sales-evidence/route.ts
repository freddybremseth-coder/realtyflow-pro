import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/api-admin";
import { getServiceSupabase } from "@/services/marketing/campaign-production";

export const dynamic = "force-dynamic";

function unavailable(message: string) {
  return /publishing_sales_(facts|import_batches|reconciliation_exceptions)|publishing_reconcile_legacy_sales_metrics|schema cache|does not exist|relation/i.test(message);
}

export async function GET(request: NextRequest) {
  const denied = await requireAdminApi(request);
  if (denied) return denied;
  const sb = getServiceSupabase();
  if (!sb) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });

  const [factsRes, batchesRes, exceptionsRes, worksRes, editionsRes] = await Promise.all([
    sb.from("publishing_sales_facts").select("id,work_id,edition_id,revision_id,attribution_status,channel,marketplace,format,metric_date,orders,units,pages_read,gross_sales,royalties,ad_spend,ad_sales,currency,source,created_at").order("metric_date", { ascending: false }).limit(5000),
    sb.from("publishing_sales_import_batches").select("id,source,status,scanned_rows,imported_rows,unmatched_rows,requested_by,started_at,completed_at,error_message").order("started_at", { ascending: false }).limit(25),
    sb.from("publishing_sales_reconciliation_exceptions").select("id,source_metric_id,source_book_id,reason,evidence,first_seen_at,last_seen_at").is("resolved_at", null).order("last_seen_at", { ascending: false }).limit(500),
    sb.from("publishing_catalog_works").select("id,canonical_title,series_name"),
    sb.from("publishing_catalog_editions").select("id,work_id,title,language,format"),
  ]);
  const error = factsRes.error || batchesRes.error || exceptionsRes.error || worksRes.error || editionsRes.error;
  if (error) return NextResponse.json({ available: false, error: unavailable(error.message) ? "Fase 5.0-migreringen er ikke installert ennå." : error.message }, { status: unavailable(error.message) ? 503 : 500 });

  const works = new Map((worksRes.data ?? []).map((row: any) => [String(row.id), row]));
  const editions = new Map((editionsRes.data ?? []).map((row: any) => [String(row.id), row]));
  const facts = (factsRes.data ?? []).map((row: any) => ({ ...row, work: works.get(String(row.work_id)) ?? null, edition: editions.get(String(row.edition_id)) ?? null }));
  const monetaryByCurrency: Record<string, { royalties: number; grossSales: number; adSpend: number; adSales: number }> = {};
  let units = 0, orders = 0, pagesRead = 0;
  for (const row of facts) {
    const currency = String(row.currency || "UNKNOWN").toUpperCase();
    monetaryByCurrency[currency] ||= { royalties: 0, grossSales: 0, adSpend: 0, adSales: 0 };
    monetaryByCurrency[currency].royalties += Number(row.royalties || 0);
    monetaryByCurrency[currency].grossSales += Number(row.gross_sales || 0);
    monetaryByCurrency[currency].adSpend += Number(row.ad_spend || 0);
    monetaryByCurrency[currency].adSales += Number(row.ad_sales || 0);
    units += Number(row.units || 0); orders += Number(row.orders || 0); pagesRead += Number(row.pages_read || 0);
  }
  return NextResponse.json({
    available: true,
    summary: { facts: facts.length, exactRevision: facts.filter((row: any) => row.attribution_status === "exact_revision").length, editionOnly: facts.filter((row: any) => row.attribution_status === "edition_only").length, openExceptions: exceptionsRes.data?.length ?? 0, units, orders, pagesRead, monetaryByCurrency },
    facts,
    batches: batchesRes.data ?? [],
    exceptions: exceptionsRes.data ?? [],
  });
}

export async function POST(request: NextRequest) {
  const denied = await requireAdminApi(request);
  if (denied) return denied;
  const body = await request.json().catch(() => null);
  if (body?.action !== "reconcile_legacy") return NextResponse.json({ error: "Ugyldig fase 5.0-handling" }, { status: 400 });
  const sb = getServiceSupabase();
  if (!sb) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });
  const { data, error } = await sb.rpc("publishing_reconcile_legacy_sales_metrics", { p_actor: "admin_ui" });
  if (error) return NextResponse.json({ error: error.message }, { status: unavailable(error.message) ? 503 : 409 });
  return NextResponse.json({ ok: true, result: data });
}
