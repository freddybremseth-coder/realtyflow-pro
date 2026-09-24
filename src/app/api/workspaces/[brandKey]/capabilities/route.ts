import { NextRequest, NextResponse } from "next/server";
import { getRequestAccessContext } from "@/lib/api-admin";
import { getPlatformSupabase } from "@/lib/platform/supabase";
import {
  hasVerifiedBrandGrant, isCanonicalBrandKey, WORKSPACE_PERMISSIONS, type WorkspacePermission,
} from "@/lib/workspaces/brand-policy";
import { roleAllowsWorkspacePermission } from "@/lib/workspaces/require-brand-workspace";

export const dynamic = "force-dynamic";
export const revalidate = 0;
const noStore = { "Cache-Control": "private, no-store" };
function fail(status: number, code: string) {
  return NextResponse.json({ ok: false, error: { code } }, { status, headers: noStore });
}

export async function GET(
  request: NextRequest,
  { params }: { params: { brandKey: string } },
) {
  const { brandKey } = params;
  if (!isCanonicalBrandKey(brandKey)) return fail(404, "WORKSPACE_NOT_FOUND");
  const context = await getRequestAccessContext(request);
  if (!context) return fail(401, "AUTH_REQUIRED");
  if (context.source === "remaster-proxy") return fail(403, "ACCESS_DENIED");
  const supabase = getPlatformSupabase();
  if (!supabase) return fail(503, "WORKSPACE_UNAVAILABLE");
  const { data: scope, error: scopeError } = await supabase.rpc("workspace_brand_grant", {
    p_brand_key: brandKey, p_email: context.email,
  });
  if (scopeError) return fail(503, "WORKSPACE_UNAVAILABLE");
  if (!scope?.brand?.id || scope.brand.brand_key !== brandKey) return fail(404, "WORKSPACE_NOT_FOUND");

  let permissions: WorkspacePermission[] = [...WORKSPACE_PERMISSIONS];
  if (context.role !== "OWNER") {
    const grant = scope.grant;
    if (!grant?.user_id) return fail(403, "ACCESS_DENIED");
    const { data: identity, error: authError } = await supabase.auth.admin.getUserById(grant.user_id);
    if (authError || !identity?.user) return fail(403, "ACCESS_DENIED");
    permissions = WORKSPACE_PERMISSIONS.filter(permission =>
      roleAllowsWorkspacePermission(context.role, permission) &&
      hasVerifiedBrandGrant({
        grant, brandId: scope.brand.id, sessionEmail: context.email,
        verifiedUserId: identity.user.id, verifiedUserEmail: identity.user.email || "", permission,
      }),
    );
    if (permissions.length === 0) return fail(403, "ACCESS_DENIED");
  }
  return NextResponse.json({ ok: true, brand: brandKey, permissions }, { headers: noStore });
}
