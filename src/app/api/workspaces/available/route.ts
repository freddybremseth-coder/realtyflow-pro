import { NextRequest, NextResponse } from "next/server";
import { getRequestAccessContext } from "@/lib/api-admin";
import { getPlatformSupabase } from "@/lib/platform/supabase";
import { WORKSPACE_PERMISSIONS, hasVerifiedBrandGrant, type WorkspacePermission } from "@/lib/workspaces/brand-policy";
import { roleAllowsWorkspacePermission } from "@/lib/workspaces/require-brand-workspace";

export const dynamic = "force-dynamic";
export const revalidate = 0;
const noStore = { "Cache-Control": "private, no-store" };
function fail(status: number, code: string) {
  return NextResponse.json({ ok: false, error: { code } }, { status, headers: noStore });
}

export async function GET(request: NextRequest) {
  const context = await getRequestAccessContext(request);
  if (!context) return fail(401, "AUTH_REQUIRED");
  if (context.source === "remaster-proxy") return fail(403, "ACCESS_DENIED");
  if (context.role === "OWNER") {
    return NextResponse.json({ ok: true, owner: true, workspaces: [] }, { headers: noStore });
  }
  const supabase = getPlatformSupabase();
  if (!supabase) return fail(503, "WORKSPACE_UNAVAILABLE");
  const { data: candidates, error } = await supabase.rpc("workspace_user_brand_grants", {
    p_email: context.email,
  });
  if (error || !Array.isArray(candidates)) return fail(503, "WORKSPACE_UNAVAILABLE");
  const workspaces: Array<{ brandKey: string; name: string; permissions: WorkspacePermission[] }> = [];
  for (const entry of candidates.slice(0, 100)) {
    const brand = entry?.brand;
    const grant = entry?.grant;
    if (!brand?.id || !brand?.brand_key || !grant?.user_id) continue;
    const { data: authResult, error: authError } = await supabase.auth.admin.getUserById(grant.user_id);
    if (authError || !authResult?.user) continue;
    const permissions = WORKSPACE_PERMISSIONS.filter(permission =>
      roleAllowsWorkspacePermission(context.role, permission) &&
      hasVerifiedBrandGrant({
        grant, brandId: brand.id, sessionEmail: context.email,
        verifiedUserId: authResult.user.id, verifiedUserEmail: authResult.user.email || "",
        permission,
      }),
    );
    if (permissions.length) {
      workspaces.push({
        brandKey: brand.brand_key,
        name: typeof brand.display_name === "string" ? brand.display_name : brand.brand_key,
        permissions,
      });
    }
  }
  return NextResponse.json({ ok: true, owner: false, workspaces }, { headers: noStore });
}
