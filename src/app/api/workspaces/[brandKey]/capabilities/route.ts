import { NextRequest, NextResponse } from "next/server";
import { getRequestAccessContext } from "@/lib/api-admin";
import { getPlatformSupabase } from "@/lib/platform/supabase";
import {
  hasVerifiedBrandGrant, isCanonicalBrandKey, WORKSPACE_PERMISSIONS, type WorkspacePermission,
} from "@/lib/workspaces/brand-policy";
import { roleAllowsWorkspacePermission } from "@/lib/workspaces/require-brand-workspace";
import { normalizeResponsibilities, type WorkspaceResponsibilityId } from "@/lib/workspaces/responsibilities";

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
  let responsibilities: WorkspaceResponsibilityId[] = [];
  if (context.role !== "OWNER") {
    const grant = scope.grant;
    if (!grant?.user_id) return fail(403, "ACCESS_DENIED");
    const { data: identity, error: authError } = await supabase.auth.admin.getUserById(grant.user_id);
    if (authError || !identity?.user) return fail(403, "ACCESS_DENIED");
    permissions = WORKSPACE_PERMISSIONS.filter(permission =>
      (brandKey === "zeneco"
        ? permission !== "crm.read" && permission !== "crm.write"
        : !["crm.joint.read", "crm.joint.write", "tasks.joint.read", "tasks.joint.write",
            "corporate.read", "corporate.plan"].includes(permission)) &&
      (!["tasks.joint.read", "tasks.joint.write"].includes(permission) ||
        (Array.isArray(grant.permissions) && grant.permissions.includes("crm.joint.read"))) &&
      (permission !== "tasks.joint.write" ||
        (Array.isArray(grant.permissions) && grant.permissions.includes("tasks.joint.read"))) &&
      (permission !== "crm.joint.write" ||
        (Array.isArray(grant.permissions) && grant.permissions.includes("crm.joint.read"))) &&
      (permission !== "marketing.draft" ||
        (Array.isArray(grant.permissions) && grant.permissions.includes("marketing.read"))) &&
      (permission !== "marketing.publish" ||
        (Array.isArray(grant.permissions) &&
         grant.permissions.includes("marketing.read") &&
         grant.permissions.includes("marketing.draft"))) &&
      (!permission.startsWith("reels.") || ["zeneco", "pinosoecolife"].includes(brandKey)) &&
      (permission !== "reels.create" ||
        (Array.isArray(grant.permissions) && grant.permissions.includes("reels.read"))) &&
      (permission !== "reels.publish" ||
        (Array.isArray(grant.permissions) &&
         grant.permissions.includes("reels.read") &&
         grant.permissions.includes("reels.create"))) &&
      (!permission.startsWith("youtube.") || brandKey === "zeneco") &&
      (permission !== "youtube.publish" ||
        (Array.isArray(grant.permissions) && grant.permissions.includes("youtube.read"))) &&
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
        grant, brandId: scope.brand.id, sessionEmail: context.email,
        verifiedUserId: identity.user.id, verifiedUserEmail: identity.user.email || "", permission,
      }),
    );
    const { data: responsibilityRow, error: responsibilityError } = await supabase.schema("core")
      .from("brand_workspace_responsibilities")
      .select("responsibilities")
      .eq("brand_id", scope.brand.id)
      .eq("user_id", identity.user.id)
      .maybeSingle();
    if (responsibilityError) return fail(503, "WORKSPACE_UNAVAILABLE");
    responsibilities = normalizeResponsibilities(
      brandKey,
      responsibilityRow?.responsibilities || [],
      permissions,
    ) || [];

    if (brandKey === "zeneco") {
      // Matching the brand must not expose pre-agreement Zen Eco customers.
      // CRM requires a separate, audited contact cohort from 2026-09-24.
      permissions = permissions.filter(permission =>
        permission !== "crm.read" && permission !== "crm.write");
    }
    if (permissions.length === 0) return fail(403, "ACCESS_DENIED");
  }
  return NextResponse.json({ ok: true, brand: brandKey, permissions, responsibilities }, { headers: noStore });
}
