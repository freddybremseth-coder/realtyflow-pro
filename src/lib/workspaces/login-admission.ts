import { getPlatformSupabase } from "@/lib/platform/supabase";
import { isCanonicalBrandKey, WORKSPACE_PERMISSIONS } from "@/lib/workspaces/brand-policy";

export type WorkspaceLoginAdmission =
  | { ok: true; activeBrands: string[] }
  | { ok: false; reason: "DISABLED" | "UNAVAILABLE" | "NO_ACTIVE_GRANT" | "IDENTITY_MISMATCH" };

/**
 * Final login admission for WORKSPACE_MEMBER only.
 * An active legacy access profile is not enough: the just-authenticated
 * Supabase Auth UUID must also own at least one CURRENT active brand grant.
 * No data permission is derived here; every workspace route still re-checks
 * its exact brand/module grant independently.
 */
export async function admitWorkspaceMemberLogin(
  email: string,
  authenticatedUserId: string,
): Promise<WorkspaceLoginAdmission> {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  if (process.env.REALTYFLOW_WORKSPACE_MEMBERS_ENABLED !== "true") {
    return { ok: false, reason: "DISABLED" };
  }
  if (!normalizedEmail || !normalizedEmail.includes("@") ||
      !/^[a-f\d]{8}-[a-f\d]{4}-[1-8][a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i.test(authenticatedUserId)) {
    return { ok: false, reason: "IDENTITY_MISMATCH" };
  }

  const supabase = getPlatformSupabase();
  if (!supabase) return { ok: false, reason: "UNAVAILABLE" };

  const { data, error } = await supabase.rpc("workspace_user_brand_grants", {
    p_email: normalizedEmail,
  });
  if (error || !Array.isArray(data) || data.length > 50) {
    return { ok: false, reason: "UNAVAILABLE" };
  }
  if (data.length === 0) return { ok: false, reason: "NO_ACTIVE_GRANT" };

  const activeBrands: string[] = [];
  for (const row of data) {
    if (!row || typeof row !== "object") return { ok: false, reason: "UNAVAILABLE" };
    const value = row as Record<string, unknown>;
    const brand = value.brand as Record<string, unknown> | undefined;
    const grant = value.grant as Record<string, unknown> | undefined;
    if (!brand || !grant || !isCanonicalBrandKey(brand.brand_key) ||
        typeof brand.id !== "string" || !brand.id ||
        grant.brand_id !== brand.id || grant.status !== "active" ||
        typeof grant.user_id !== "string" || grant.user_id !== authenticatedUserId ||
        typeof grant.email !== "string" || grant.email.trim().toLowerCase() !== normalizedEmail ||
        !Array.isArray(grant.permissions) || grant.permissions.length === 0 ||
        grant.permissions.length > WORKSPACE_PERMISSIONS.length ||
        new Set(grant.permissions).size !== grant.permissions.length ||
        !grant.permissions.every(permission =>
          typeof permission === "string" && WORKSPACE_PERMISSIONS.includes(permission as any))) {
      return { ok: false, reason: "IDENTITY_MISMATCH" };
    }
    const permissions = grant.permissions as string[];
    const brandKey = brand.brand_key;
    const invalidScope = brandKey === "zeneco"
      ? permissions.some(permission => permission === "crm.read" || permission === "crm.write") ||
        (permissions.includes("crm.joint.write") && !permissions.includes("crm.joint.read")) ||
        (permissions.some(permission => permission === "tasks.joint.read" || permission === "tasks.joint.write") &&
          !permissions.includes("crm.joint.read")) ||
        (permissions.includes("tasks.joint.write") && !permissions.includes("tasks.joint.read"))
      : permissions.some(permission =>
        ["crm.joint.read", "crm.joint.write", "tasks.joint.read", "tasks.joint.write"].includes(permission));
    if (invalidScope) return { ok: false, reason: "IDENTITY_MISMATCH" };
    activeBrands.push(brandKey);
  }

  return { ok: true, activeBrands: Array.from(new Set(activeBrands)) };
}
