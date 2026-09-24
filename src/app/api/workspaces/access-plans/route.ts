import { NextRequest, NextResponse } from "next/server";
import { getRequestAccessContext } from "@/lib/api-admin";
import { getPlatformSupabase } from "@/lib/platform/supabase";
import { isCanonicalBrandKey, WORKSPACE_PERMISSIONS, type WorkspacePermission } from "@/lib/workspaces/brand-policy";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const noStore = { "Cache-Control": "private, no-store" };
const response = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: noStore });

async function ownerAccess(request: NextRequest) {
  const context = await getRequestAccessContext(request);
  if (!context) return { context: null, failure: response({ error: "AUTH_REQUIRED" }, 401) };
  // Require an actual owner session, not the Re-Master migration proxy.
  if (context.role !== "OWNER" || context.source !== "owner-session") {
    return { context: null, failure: response({ error: "OWNER_REQUIRED" }, 403) };
  }
  return { context, failure: null };
}

export async function GET(request: NextRequest) {
  const { failure } = await ownerAccess(request);
  if (failure) return failure;
  const supabase = getPlatformSupabase();
  if (!supabase) return response({ error: "WORKSPACE_UNAVAILABLE" }, 503);
  const [brandsResult, draftsResult] = await Promise.all([
    supabase.schema("core").from("brands").select("id,brand_key,display_name").order("display_name"),
    supabase.schema("core").from("brand_workspace_access_plans")
      .select("brand_id,email,permissions,status,updated_by,updated_at")
      .order("updated_at", { ascending: false }).limit(500),
  ]);
  if (brandsResult.error || draftsResult.error) return response({ error: "WORKSPACE_UNAVAILABLE" }, 503);
  return response({
    brands: brandsResult.data || [],
    plans: draftsResult.data || [],
    activationAvailable: false,
    message: "Dette er kun tilgangsutkast. Ingen tilgang aktiveres eller invitasjoner sendes.",
  });
}

export async function POST(request: NextRequest) {
  const { context, failure } = await ownerAccess(request);
  if (failure || !context) return failure;
  const origin = request.headers.get("origin");
  const requestOrigin = new URL(request.url).origin;
  if ((origin && origin !== requestOrigin) ||
    request.headers.get("sec-fetch-site") === "cross-site" ||
    !request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return response({ error: "INVALID_REQUEST_ORIGIN" }, 403);
  }
  const body: Record<string, unknown> = await request.json().catch(() => ({}));
  const brandKey = body.brandKey;
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const action = body.action;
  if (!isCanonicalBrandKey(brandKey) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    return response({ error: "INVALID_BRAND_OR_EMAIL" }, 400);
  }
  if (action !== "SAVE_DRAFT" && action !== "DISCARD_DRAFT") {
    return response({ error: "UNSUPPORTED_ACTION" }, 400);
  }
  const permissions = body.permissions;
  if (action === "SAVE_DRAFT" && (!Array.isArray(permissions) ||
    permissions.length > WORKSPACE_PERMISSIONS.length ||
    !permissions.every((permission) => typeof permission === "string" &&
      WORKSPACE_PERMISSIONS.includes(permission as WorkspacePermission)) ||
    new Set(permissions).size !== permissions.length)) {
    return response({ error: "INVALID_PERMISSIONS" }, 400);
  }
  const supabase = getPlatformSupabase();
  if (!supabase) return response({ error: "WORKSPACE_UNAVAILABLE" }, 503);
  const { data: brand, error: brandError } = await supabase.schema("core").from("brands")
    .select("id").eq("brand_key", brandKey).maybeSingle();
  if (brandError) return response({ error: "WORKSPACE_UNAVAILABLE" }, 503);
  if (!brand) return response({ error: "WORKSPACE_NOT_FOUND" }, 404);

  const table = supabase.schema("core").from("brand_workspace_access_plans");
  if (action === "DISCARD_DRAFT") {
    const { data, error } = await table.update({
      status: "discarded", updated_by: context.email, updated_at: new Date().toISOString(),
    }).eq("brand_id", brand.id).eq("email", email).eq("status", "draft").select("email").maybeSingle();
    if (error) return response({ error: "WORKSPACE_UNAVAILABLE" }, 503);
    if (!data) return response({ error: "DRAFT_NOT_FOUND" }, 404);
  } else {
    // The draft table is NEVER consulted by the live authorisation guard.
    const { error } = await table.upsert({
      brand_id: brand.id, email, permissions: permissions as WorkspacePermission[],
      status: "draft", updated_by: context.email, updated_at: new Date().toISOString(),
    }, { onConflict: "brand_id,email" });
    if (error) return response({ error: "WORKSPACE_UNAVAILABLE" }, 503);
  }
  return response({ ok: true, activationAvailable: false });
}
