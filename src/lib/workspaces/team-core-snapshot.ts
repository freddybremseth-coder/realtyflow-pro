import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export type WorkspaceTeamCoreSnapshot = {
  brands: Array<Record<string, unknown>>;
  users: Array<Record<string, unknown>>;
  memberships: Array<Record<string, unknown>>;
  responsibilities: Array<Record<string, unknown>>;
  error: string | null;
};

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

export async function loadWorkspaceTeamCoreSnapshot(
  supabase: SupabaseClient,
): Promise<WorkspaceTeamCoreSnapshot> {
  const empty = {
    brands: [],
    users: [],
    memberships: [],
    responsibilities: [],
  } satisfies Omit<WorkspaceTeamCoreSnapshot, "error">;

  const { data, error } = await supabase.rpc("workspace_user_admin_snapshot");
  if (error) return { ...empty, error: error.message || "WORKSPACE_TEAM_SNAPSHOT_UNAVAILABLE" };

  const root = record(data);
  if (!root || !Array.isArray(root.users) || !Array.isArray(root.brands)) {
    return { ...empty, error: "INVALID_WORKSPACE_TEAM_SNAPSHOT" };
  }

  const brands = root.brands
    .map(record)
    .filter((row): row is Record<string, unknown> => Boolean(row))
    .map(row => ({
      id: row.id,
      brand_key: row.brand_key,
      display_name: row.display_name,
    }));

  const users: Array<Record<string, unknown>> = [];
  const memberships: Array<Record<string, unknown>> = [];
  const responsibilities: Array<Record<string, unknown>> = [];

  for (const rawUser of root.users) {
    const user = record(rawUser);
    if (!user || typeof user.user_id !== "string") continue;

    users.push({
      user_id: user.user_id,
      email: user.email,
      display_name: user.display_name,
      status: user.status,
      account_kind: user.account_kind,
      access_expires_at: user.access_expires_at,
    });

    for (const rawMembership of Array.isArray(user.memberships) ? user.memberships : []) {
      const membership = record(rawMembership);
      if (!membership || typeof membership.brand_id !== "string") continue;

      memberships.push({
        brand_id: membership.brand_id,
        user_id: user.user_id,
        status: membership.status,
        permissions: Array.isArray(membership.permissions) ? membership.permissions : [],
      });
      responsibilities.push({
        brand_id: membership.brand_id,
        user_id: user.user_id,
        responsibilities: Array.isArray(membership.responsibilities)
          ? membership.responsibilities
          : [],
      });
    }
  }

  return { brands, users, memberships, responsibilities, error: null };
}
