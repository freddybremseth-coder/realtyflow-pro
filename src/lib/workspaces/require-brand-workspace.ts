import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { getRequestAccessContext } from "@/lib/api-admin";
import { hasPermission, type AccessPermission, type AccessRole } from "@/lib/access-control";
import { getPlatformSupabase } from "@/lib/platform/supabase";
import { hasVerifiedBrandGrant, isCanonicalBrandKey, type WorkspacePermission } from "./brand-policy";

type Rejection = { value: null; response: NextResponse };
type Access = { value: { brandKey: string; brandId: string; supabase: NonNullable<ReturnType<typeof getPlatformSupabase>> }; response: null };

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
export function roleAllowsWorkspacePermission(role: AccessRole, permission: WorkspacePermission) {
  if (role === "OWNER") return true;
  if (role === "WORKSPACE_MEMBER") return process.env.REALTYFLOW_WORKSPACE_MEMBERS_ENABLED === "true";
  const legacyPermission: AccessPermission = permission === "crm.write" ? "customers.write"
    : permission === "crm.read" ? "customers.read"
    : permission === "marketing.publish" || permission === "marketing.draft" ? "marketing.write"
    : permission === "marketing.read" ? "marketing.read" : "revenue.read";
  return hasPermission(role, legacyPermission);
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
  const supabase = getPlatformSupabase();
  if (!supabase) return reject(503, "WORKSPACE_UNAVAILABLE");

  // The public-schema RPC is service-role-only; core is NOT exposed to PostgREST clients.
  const { data: scope, error: scopeError } = await supabase.rpc("workspace_brand_grant", {
    p_brand_key: brandKey, p_email: context.email,
  });
  if (scopeError) return reject(503, "WORKSPACE_UNAVAILABLE");
  if (!scope?.brand?.id || scope.brand.brand_key !== brandKey) return reject(404, "WORKSPACE_NOT_FOUND");
  const brandId: string = scope.brand.id;

  if (context.role !== "OWNER") {
    const grant = scope.grant;
    if (!grant?.user_id) return reject(403, "ACCESS_DENIED");
    const { data: authResult, error: authError } = await supabase.auth.admin.getUserById(grant.user_id);
    if (authError || !authResult?.user || !hasVerifiedBrandGrant({
      grant, brandId, sessionEmail: context.email,
      verifiedUserId: authResult.user.id, verifiedUserEmail: authResult.user.email || "",
      permission,
    })) return reject(403, "ACCESS_DENIED");
  }
  return { value: { brandKey, brandId, supabase }, response: null };
}
