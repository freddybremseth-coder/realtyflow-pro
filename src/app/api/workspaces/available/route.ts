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
      (brand.brand_key === "zeneco"
        ? permission !== "crm.read" && permission !== "crm.write"
        : !["crm.joint.read", "crm.joint.write", "tasks.joint.read", "tasks.joint.write",
            "corporate.read", "corporate.plan"].includes(permission)) &&
      (!["tasks.joint.read", "tasks.joint.write"].includes(permission) ||
        (Array.isArray(grant.permissions) && grant.permissions.includes("crm.joint.read"))) &&
      (permission !== "tasks.joint.write" ||
        (Array.isArray(grant.permissions) && grant.permissions.includes("tasks.joint.read"))) &&
      (permission !== "crm.joint.write" ||
        (Array.isArray(grant.permissions) && grant.permissions.includes("crm.joint.read"))) &&
      (permission !== "customer360.write" ||
        (Array.isArray(grant.permissions) && grant.permissions.includes("customer360.read"))) &&
      (permission !== "marketing.draft" ||
        (Array.isArray(grant.permissions) && grant.permissions.includes("marketing.read"))) &&
      (permission !== "marketing.publish" ||
        (Array.isArray(grant.permissions) &&
         grant.permissions.includes("marketing.read") &&
         grant.permissions.includes("marketing.draft"))) &&
      (permission !== "corporate.plan" ||
        (Array.isArray(grant.permissions) && grant.permissions.includes("corporate.read"))) &&
      (permission !== "visibility.plan" ||
        (Array.isArray(grant.permissions) && grant.permissions.includes("visibility.read"))) &&
      (permission !== "ads.draft" ||
        (Array.isArray(grant.permissions) && grant.permissions.includes("ads.read"))) &&
      (permission !== "content.edit" ||
        (Array.isArray(grant.permissions) && grant.permissions.includes("content.read"))) &&
      (permission !== "content.publish" ||
        (Array.isArray(grant.permissions) &&
         grant.permissions.includes("content.read") &&
         grant.permissions.includes("content.edit"))) &&
      (permission !== "email.draft" ||
        (Array.isArray(grant.permissions) && grant.permissions.includes("email.read"))) &&
      (permission !== "email.send" ||
        (Array.isArray(grant.permissions) &&
         grant.permissions.includes("email.read") &&
         grant.permissions.includes("email.draft"))) &&
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
