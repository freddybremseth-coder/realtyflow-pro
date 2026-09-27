import { NextRequest, NextResponse } from "next/server";
import { getRequestAccessContext } from "@/lib/api-admin";
import { findAccessProfile } from "@/lib/access-control-server";
import { getPlatformSupabase } from "@/lib/platform/supabase";
import { isCanonicalBrandKey, WORKSPACE_PERMISSIONS, type WorkspacePermission } from "@/lib/workspaces/brand-policy";
import { getWorkspaceRuntimeState } from "@/lib/workspaces/runtime-control";

export const dynamic = "force-dynamic";
export const revalidate = 0;
const noStore = { "Cache-Control": "private, no-store" };
const reply = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: noStore });

function planScopeValid(brandKey: string, permissions: WorkspacePermission[]) {
  if (permissions.includes("marketing.draft") && !permissions.includes("marketing.read")) return false;
  if (brandKey === "zeneco") {
    if (permissions.includes("crm.read") || permissions.includes("crm.write")) return false;
    if (permissions.includes("crm.joint.write") && !permissions.includes("crm.joint.read")) return false;
    if ((permissions.includes("tasks.joint.read") || permissions.includes("tasks.joint.write")) &&
        !permissions.includes("crm.joint.read")) return false;
    if (permissions.includes("tasks.joint.write") && !permissions.includes("tasks.joint.read")) return false;
    return true;
  }
  return !permissions.some(permission =>
    ["crm.joint.read", "crm.joint.write", "tasks.joint.read", "tasks.joint.write"].includes(permission));
}

/**
 * Owner-only, read-only go-live preflight. It NEVER creates Auth users,
 * access profiles, memberships, invitations, customer grants or feature flags.
 */
export async function GET(request: NextRequest) {
  const context = await getRequestAccessContext(request);
  if (!context) return reply({ error: "AUTH_REQUIRED" }, 401);
  if (context.role !== "OWNER" || context.source !== "owner-session")
    return reply({ error: "OWNER_REQUIRED" }, 403);

  const { searchParams } = new URL(request.url);
  const brandKey = searchParams.get("brandKey") || "";
  const email = (searchParams.get("email") || "").trim().toLowerCase();
  if (!isCanonicalBrandKey(brandKey) ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    return reply({ error: "INVALID_BRAND_OR_EMAIL" }, 400);
  }

  const supabase = getPlatformSupabase();
  if (!supabase) return reply({ error: "WORKSPACE_UNAVAILABLE" }, 503);

  const [snapshot, grants, securitySnapshot, profileResult, authResult, runtime] = await Promise.all([
    supabase.rpc("workspace_access_snapshot"),
    supabase.rpc("workspace_user_brand_grants", { p_email: email }),
    supabase.rpc("workspace_staff_security_preflight"),
    findAccessProfile(email),
    supabase.auth.admin.listUsers({ page: 1, perPage: 1000 }),
    getWorkspaceRuntimeState(supabase),
  ]);
  const securityError = securitySnapshot.error;
  const securityRpcMissing = Boolean(securityError &&
    (securityError.code === "PGRST202" || securityError.code === "42883") &&
    /workspace_staff_security_preflight/i.test(securityError.message || ""));
  if (snapshot.error || grants.error || profileResult.error || authResult.error || runtime.error ||
      (securityError && !securityRpcMissing) ||
      !snapshot.data || !Array.isArray(snapshot.data.brands) || !Array.isArray(snapshot.data.plans) ||
      !Array.isArray(grants.data)) {
    return reply({ error: "WORKSPACE_UNAVAILABLE" }, 503);
  }
  const securityPreflight = securityRpcMissing ? null : securitySnapshot.data;
  if (securityPreflight && (
      typeof securityPreflight !== "object" ||
      typeof securityPreflight.safe_for_workspace_auth !== "boolean" ||
      typeof securityPreflight.required_customer_tables_rls !== "boolean" ||
      typeof securityPreflight.private_document_buckets_present !== "boolean" ||
      typeof securityPreflight.private_document_buckets_private !== "boolean" ||
      !Number.isSafeInteger(securityPreflight.private_document_authenticated_policies) ||
      !Number.isSafeInteger(securityPreflight.operational_storage_authenticated_write_policies) ||
      !Number.isSafeInteger(securityPreflight.direct_customer_policy_risk) ||
      !Number.isSafeInteger(securityPreflight.direct_internal_policy_risk) ||
      !Number.isSafeInteger(securityPreflight.direct_security_definer_risk))) {
    return reply({ error: "WORKSPACE_UNAVAILABLE" }, 503);
  }

  const brand = snapshot.data.brands.find((item: any) => item?.brand_key === brandKey);
  if (!brand?.id) return reply({ error: "WORKSPACE_NOT_FOUND" }, 404);
  const plan = snapshot.data.plans.find((item: any) =>
    item?.brand_id === brand.id && item?.email === email && item?.status === "draft") || null;

  const permissions: WorkspacePermission[] = plan && Array.isArray(plan.permissions)
    ? plan.permissions.filter((permission: unknown): permission is WorkspacePermission =>
        typeof permission === "string" &&
        WORKSPACE_PERMISSIONS.includes(permission as WorkspacePermission))
    : [];

  const authUser = (authResult.data.users || []).find(user =>
    String(user.email || "").trim().toLowerCase() === email) || null;
  const profile = profileResult.profile;
  const activeMembership = grants.data.find((entry: any) =>
    entry?.brand?.id === brand.id &&
    entry?.grant?.status === "active" &&
    entry?.grant?.email === email) || null;

  const blockers: string[] = [];
  if (!plan) blockers.push("NO_DRAFT");
  if (plan && permissions.length !== plan.permissions.length) blockers.push("INVALID_DRAFT_PERMISSIONS");
  if (plan && permissions.length === 0) blockers.push("EMPTY_PERMISSIONS");
  if (plan && !planScopeValid(brandKey, permissions)) blockers.push("INVALID_BRAND_SCOPE");
  if (permissions.includes("marketing.publish"))
    blockers.push("MARKETING_PUBLISH_NOT_IMPLEMENTED");
  if (!authUser) blockers.push("AUTH_USER_MISSING");
  if (!profile) blockers.push("ACCESS_PROFILE_MISSING");
  else {
    if (profile.role !== "WORKSPACE_MEMBER") blockers.push("ACCESS_PROFILE_WRONG_ROLE");
    if (!profile.active) blockers.push("ACCESS_PROFILE_INACTIVE");
  }
  if (activeMembership) blockers.push("ACTIVE_MEMBERSHIP_ALREADY_PRESENT");
  if (securityRpcMissing) blockers.push("SECURITY_PREFLIGHT_NOT_INSTALLED");
  else if (!securityPreflight?.safe_for_workspace_auth) blockers.push("DIRECT_AUTH_SECURITY_BLOCKER");
  if (!runtime.enabled) blockers.push("FEATURE_FLAG_DISABLED");

  const reviewBlockers = blockers.filter(code => code !== "FEATURE_FLAG_DISABLED");
  return reply({
    ok: true,
    brand: { brandKey, name: typeof brand.display_name === "string" ? brand.display_name : brandKey },
    email,
    draft: plan ? { permissions } : null,
    checks: {
      authUserExists: Boolean(authUser),
      workspaceProfile: profile ? { role: profile.role, active: profile.active } : null,
      activeMembershipExists: Boolean(activeMembership),
      securityPreflight,
      featureFlagEnabled: runtime.enabled,
    },
    blockers,
    readyForOwnerReview: reviewBlockers.length === 0,
    activationAvailable: false,
    message: "Kontrollen er kun lesing. Ingen bruker, medlemskap, invitasjon eller tilgang aktiveres.",
  });
}
