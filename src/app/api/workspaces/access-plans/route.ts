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
  const [accessSnapshot, contactSnapshot, zenJointSnapshot] = await Promise.all([
    supabase.rpc("workspace_access_snapshot"),
    supabase.rpc("workspace_contact_brand_counts"),
    supabase.rpc("workspace_zeneco_new_crm_candidates_count"),
  ]);
  const { data, error } = accessSnapshot;
  // This OPTIONAL overview is introduced by a separate unapplied migration.
  // Never break the existing owner permissions dashboard during a safe
  // app-before-migration rollout, and never misreport an unavailable count as 0.
  const optionalRpcError = zenJointSnapshot.error;
  const missingZenRpc = Boolean(optionalRpcError &&
    (optionalRpcError.code === "PGRST202" || optionalRpcError.code === "42883") &&
    /workspace_zeneco_new_crm_candidates_count/i.test(optionalRpcError.message || ""));
  const jointPreview = missingZenRpc ? null : zenJointSnapshot.data;
  if (error || contactSnapshot.error || (optionalRpcError && !missingZenRpc) ||
    !data || !Array.isArray(data.brands) || !Array.isArray(data.plans) ||
    !Array.isArray(contactSnapshot.data) ||
    (jointPreview && (!Number.isSafeInteger(jointPreview.new_crm_records_to_review) ||
      !Number.isSafeInteger(jointPreview.approved_joint_records))) ||
    (!jointPreview && !missingZenRpc)) {
    return response({ error: "WORKSPACE_UNAVAILABLE" }, 503);
  }
  return response({
    brands: data.brands,
    plans: data.plans,
    contactCounts: contactSnapshot.data,
    zenJointPreview: jointPreview,
    activationAvailable: false,
    message: "Dette er kun tilgangsutkast. Ingen tilgang aktiveres eller invitasjoner sendes.",
  });
}

export async function POST(request: NextRequest) {
  const { context, failure } = await ownerAccess(request);
  if (failure) return failure;
  if (!context) return response({ error: "OWNER_REQUIRED" }, 403);
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
  if (action === "SAVE_DRAFT" && Array.isArray(permissions) && (
    (brandKey === "zeneco" && permissions.some(permission => permission === "crm.read" || permission === "crm.write")) ||
    (brandKey !== "zeneco" && permissions.some(permission => permission === "crm.joint.read" || permission === "crm.joint.write")) ||
    (brandKey === "zeneco" && permissions.includes("crm.joint.write") && !permissions.includes("crm.joint.read")))) {
    return response({ error: "INVALID_BRAND_CRM_SCOPE" }, 400);
  }
  const supabase = getPlatformSupabase();
  if (!supabase) return response({ error: "WORKSPACE_UNAVAILABLE" }, 503);
  // Public-schema RPC is service-role-only and writes ONLY a draft, never an actual grant.
  const { data: saved, error } = await supabase.rpc("workspace_access_save_draft", {
    p_brand_key: brandKey, p_email: email,
    p_permissions: action === "SAVE_DRAFT" ? permissions as WorkspacePermission[] : [],
    p_status: action === "SAVE_DRAFT" ? "draft" : "discarded",
    p_actor: context.email,
  });
  if (error) return response({ error: "WORKSPACE_UNAVAILABLE" }, 503);
  if (!saved) return response({ error: action === "SAVE_DRAFT" ? "WORKSPACE_NOT_FOUND" : "DRAFT_NOT_FOUND" }, 404);
  return response({ ok: true, activationAvailable: false });
}
