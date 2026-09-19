export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getRequestAccessContext } from "@/lib/api-admin";
import { ZENECO_METADATA_VARIANTS } from "@/services/agents/seo-zeneco-metadata";

const PAGES = new Set<string>(ZENECO_METADATA_VARIANTS.map(item => item.path));
function db() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key ? createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  }) : null;
}
async function owner(request: NextRequest) {
  const context = await getRequestAccessContext(request);
  return context?.role === "OWNER";
}

/** Only display a non-secret snapshot of Sam's four owned-page metadata. */
export async function GET(request: NextRequest) {
  if (!await owner(request)) return NextResponse.json({ error: "Owner session required" }, { status: 403 });
  const supabase = db();
  if (!supabase) return NextResponse.json({ error: "Publisher unavailable" }, { status: 503 });
  const { data, error } = await supabase.from("seo_page_overrides")
    .select("page_path,seo_title,seo_description,revision,active,updated_at")
    .eq("brand_id", "zeneco").order("page_path");
  if (error) return NextResponse.json({ error: "Metadata state unavailable" }, { status: 503 });
  return NextResponse.json({ brandId: "zeneco", pages: data || [],
    allowedPaths: [...PAGES] }, { headers: { "Cache-Control": "private, no-store" } });
}

/** Owner-controlled emergency rollback of exactly one versioned title/description.
 * Normal safe edits do NOT need another approval; this endpoint exists to stop
 * a published experiment promptly without touching canonical, content, or CRM.
 */
export async function POST(request: NextRequest) {
  if (!await owner(request)) return NextResponse.json({ error: "Owner session required" }, { status: 403 });
  const origin = request.headers.get("origin");
  if (origin && origin !== request.nextUrl.origin) {
    return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  }
  const body = await request.json().catch(() => ({}));
  const path = typeof body.path === "string" ? body.path : "";
  const expectedRevision = Number(body.expectedRevision);
  if (body.action !== "rollback" || !PAGES.has(path) ||
      !Number.isInteger(expectedRevision) || expectedRevision < 1) {
    return NextResponse.json({ error: "Exact approved page and revision required" }, { status: 400 });
  }
  const supabase = db();
  if (!supabase) return NextResponse.json({ error: "Publisher unavailable" }, { status: 503 });
  const { data: saved, error: stateError } = await supabase.from("seo_page_overrides")
    .select("revision,active").eq("brand_id", "zeneco").eq("page_path", path).maybeSingle();
  if (stateError || !saved) return NextResponse.json({ error: "Page revision unavailable" }, { status: 404 });
  if (!saved.active) return NextResponse.json({ error: "This page is already rolled back" }, { status: 409 });
  if (saved.revision !== expectedRevision) {
    return NextResponse.json({ error: "Page revision changed; reload the page before rollback" }, { status: 409 });
  }
  const { data: result, error: rollbackError } = await supabase.rpc("apply_zeneco_seo_override", {
    p_path: path, p_title: null, p_description: null,
    p_expected_revision: expectedRevision,
    p_change_id: "zeneco_rollback_" + crypto.randomUUID(), p_action: "rollback",
  });
  if (rollbackError || !Array.isArray(result) || result[0]?.active !== false) {
    return NextResponse.json({ error: "Rollback could not be verified in storage" }, { status: 503 });
  }
  // A pending daily publisher must NOT later declare an owner-rolled-back
  // revision visible or attempt an outdated second rollback.
  const { data: pending, error: pendingError } = await supabase.from("automation_logs")
    .select("id,details").eq("action", "seo_zeneco_metadata_attempt").eq("status", "partial")
    .contains("details", { page: path });
  if (pendingError) return NextResponse.json({
    success: true, rollbackRevision: result[0].revision, warning: "Pending audit needs inspection",
  });
  for (const attempt of pending || []) {
    const { error } = await supabase.from("automation_logs")
      .update({ status: "error", details: {
        ...((attempt.details || {}) as Record<string, unknown>),
        owner_rollback: true, rollback_revision: result[0].revision, site_verified: false,
      } }).eq("id", attempt.id).eq("status", "partial");
    if (error) console.error("[SamSEO] Owner rollback pending-log closure failed", error.code);
  }
  const { error: auditError } = await supabase.from("automation_logs").insert({
    action: "seo_zeneco_metadata_manual_rollback",
    agent_name: "Sam SEO Expert", status: "success",
    details: { brand_id: "zeneco", page: path, prior_revision: expectedRevision,
      rollback_revision: result[0].revision, live_visibility_pending: true },
  });
  if (auditError) console.error("[SamSEO] Owner metadata rollback audit failed", auditError.code);
  return NextResponse.json({
    success: true, page: path, rollbackRevision: result[0].revision,
    siteVisibilityPending: true,
    note: "Databaseoverstyringen er deaktivert. Nettstedets opprinnelige metadata vises etter neste regenerering (normalt innen fem minutter etter et besøk).",
  }, { headers: { "Cache-Control": "private, no-store" } });
}
