export const WORKSPACE_PERMISSIONS = [
  "crm.read",
  "crm.write",
  "crm.joint.read",
  "crm.joint.write",
  "tasks.joint.read",
  "tasks.joint.write",
  "properties.catalog.read",
  "marketing.read",
  "marketing.draft",
  "marketing.publish",
] as const;

export type WorkspacePermission = (typeof WORKSPACE_PERMISSIONS)[number];

export type BrandWorkspaceGrant = {
  brand_id: string;
  user_id: string;
  email: string;
  status: string;
  permissions: unknown;
};

/** A URL/body/header-selected brand is never proof of membership. */
export function isCanonicalBrandKey(value: unknown): value is string {
  return typeof value === "string" && /^[a-z0-9][a-z0-9-]{1,62}$/.test(value);
}

/** A grant is valid only after the server independently verifies the auth user. */
export function hasVerifiedBrandGrant(params: {
  grant: BrandWorkspaceGrant | null;
  brandId: string;
  sessionEmail: string;
  verifiedUserId: string;
  verifiedUserEmail: string;
  permission: WorkspacePermission;
}): boolean {
  const { grant, brandId, sessionEmail, verifiedUserId, verifiedUserEmail, permission } = params;
  if (!grant || !brandId || !verifiedUserId) return false;
  if (!WORKSPACE_PERMISSIONS.includes(permission)) return false;
  if (grant.brand_id !== brandId || grant.user_id !== verifiedUserId || grant.status !== "active") return false;
  const email = (value: string) => value.trim().toLowerCase();
  if (!sessionEmail || !verifiedUserEmail || !grant.email) return false;
  if (email(sessionEmail) !== email(verifiedUserEmail) || email(grant.email) !== email(sessionEmail)) return false;
  return Array.isArray(grant.permissions) && grant.permissions.includes(permission);
}
