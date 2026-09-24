import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { getRequestAccessContext } from "@/lib/api-admin";
import { type AccessRole } from "@/lib/access-control";
import { getPlatformSupabase } from "@/lib/platform/supabase";
import { hasVerifiedBrandGrant, isCanonicalBrandKey, type WorkspacePermission } from "./brand-policy";

type Rejection = { value: null; response: NextResponse };
type Access = { value: { brandKey: string; brandId: string; verifiedUserId: string | null; supabase: NonNullable<ReturnType<typeof getPlatformSupabase>> }; response: null };

function reject(status: number, code: string): Rejection {
  return {
    value: null,
    response: NextResponse.json({ ok: false, error: { code } }, {
      status,
      headers: { "Cache-Control": "private, no-store" },
    }),
  };
}

/**
 * This is a separate, opt-in scoped path. It does NOT make legacy CRM routes
 * safe for an employee; those must be closed before any employee is invited.
 * Neither tenant membership nor a requested brand ID constitutes permission.
 */
export function roleAllowsWorkspacePermission(role: AccessRole, _permission: WorkspacePermission) {
  // Do not use a legacy global SALES/MARKETING/VIEWER account as a brand member.
  // New branded workspaces may be opened only by OWNER or a narrow,
  // independently verified, flag-enabled WORKSPACE_MEMBER.
  if (role === "OWNER") return true;
  return role === "WORKSPACE_MEMBER" &&
    process.env.REALTYFLOW_WORKSPACE_MEMBERS_ENABLED === "true";
}

export async function requireBrandWorkspace(
  request: NextRequest,
  brandKey: string,
  permission: WorkspacePermission,
): Promise<Access | Rejection> {
  if (!isCanonicalBrandKey(brandKey)) return reject(404, "WORKSPACE_NOT_FOUND");
  const context = await getRequestAccessContext(request);
  if (!context) return reject(401, "AUTH_REQUIRED");
  // Owner-only migration proxy cannot act as a human workspace session.
  if (context.source === "remaster-proxy") return reject(403, "ACCESS_DENIED");
  if (!roleAllowsWorkspacePermission(context.role, permission)) return reject(403, "ACCESS_DENIED");
  // Zen Eco Homes collaboration starts with incoming leads from 24 Sep 2026,
  // not the existing Zen Eco CRM. Until an independently verified per-contact
  // cohort is implemented, NEVER grant a staff member a brand-wide Zen CRM read
  // or write just because they have a Zen brand membership.
  if (brandKey === "zeneco" && context.role !== "OWNER" &&
    (permission === "crm.read" || permission === "crm.write")) {
    return reject(403, "ZEN_NEW_LEADS_COHORT_REQUIRED");
  }
  const supabase = getPlatformSupabase();
  if (!supabase) return reject(503, "WORKSPACE_UNAVAILABLE");

  // The public-schema RPC is service-role-only; core is NOT exposed to PostgREST clients.
  const { data: scope, error: scopeError } = await supabase.rpc("workspace_brand_grant", {
    p_brand_key: brandKey, p_email: context.email,
  });
  if (scopeError) return reject(503, "WORKSPACE_UNAVAILABLE");
  if (!scope?.brand?.id || scope.brand.brand_key !== brandKey) return reject(404, "WORKSPACE_NOT_FOUND");
  const brandId: string = scope.brand.id;

  let verifiedUserId: string | null = null;
  if (context.role !== "OWNER") {
    const grant = scope.grant;
    if (!grant?.user_id) return reject(403, "ACCESS_DENIED");
    const { data: authResult, error: authError } = await supabase.auth.admin.getUserById(grant.user_id);
    if (authError || !authResult?.user || !hasVerifiedBrandGrant({
      grant, brandId, sessionEmail: context.email,
      verifiedUserId: authResult.user.id, verifiedUserEmail: authResult.user.email || "",
      permission,
    })) return reject(403, "ACCESS_DENIED");
    verifiedUserId = authResult.user.id;
  }
  return { value: { brandKey, brandId, verifiedUserId, supabase }, response: null };
}
