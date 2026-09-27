import { normalizeRole, type AccessRole } from "@/lib/access-control";

/**
 * Edge-safe, fail-closed refresh of legacy non-owner role profiles.
 * A signed cookie proves the original login, not that the user's current
 * role is still active. Always compare its role with the live profile before
 * allowing middleware-only legacy endpoints to run.
 *
 * Service-role credentials stay inside middleware; never put them in headers,
 * responses, logs or browser bundles.
 */
export async function liveRoleForMiddleware(email: string, expectedRole?: AccessRole): Promise<AccessRole | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key || !email || !email.includes("@")) return null;

  try {
    if (expectedRole === "WORKSPACE_MEMBER") {
      const runtime = new URL("/rest/v1/brand_settings", url);
      runtime.searchParams.set("select", "settings");
      runtime.searchParams.set("brand_id", "eq.workspace-auth:runtime");
      runtime.searchParams.set("limit", "1");
      const runtimeResponse = await fetch(runtime, {
        headers: { apikey: key, Authorization: `Bearer ${key}` },
        cache: "no-store",
        signal: AbortSignal.timeout(4_000),
      });
      if (!runtimeResponse.ok) return null;
      const runtimeRows: unknown = await runtimeResponse.json();
      if (!Array.isArray(runtimeRows) || runtimeRows.length !== 1 ||
          runtimeRows[0]?.settings?.enabled !== true) return null;

      const rpc = new URL("/rest/v1/rpc/workspace_login_directory", url);
      const response = await fetch(rpc, {
        method: "POST",
        headers: {
          apikey: key,
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ p_login: email.trim().toLowerCase() }),
        cache: "no-store",
        signal: AbortSignal.timeout(4_000),
      });
      if (!response.ok) return null;
      const row: unknown = await response.json();
      if (!row || typeof row !== "object" || Array.isArray(row)) return null;
      const entry = row as Record<string, unknown>;
      if (entry.status !== "active" ||
          typeof entry.email !== "string" ||
          entry.email.trim().toLowerCase() !== email.trim().toLowerCase() ||
          typeof entry.user_id !== "string" || !entry.user_id) return null;
      return "WORKSPACE_MEMBER";
    }

    const endpoint = new URL("/rest/v1/brand_settings", url);
    endpoint.searchParams.set("select", "settings");
    endpoint.searchParams.set("brand_id", "eq.access-control:profiles");
    endpoint.searchParams.set("limit", "1");
    const result = await fetch(endpoint, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
      cache: "no-store",
      signal: AbortSignal.timeout(4_000),
    });
    if (!result.ok) return null;
    const rows: unknown = await result.json();
    if (!Array.isArray(rows) || rows.length !== 1) return null;
    const profiles: unknown = rows[0]?.settings?.profiles;
    if (!Array.isArray(profiles)) return null;
    type LiveProfile = { email: string; active?: unknown; role?: unknown };
    const matching: LiveProfile[] = profiles.filter((profile: unknown): profile is LiveProfile => {
      if (!profile || typeof profile !== "object" || !("email" in profile) ||
        typeof profile.email !== "string") return false;
      return profile.email.trim().toLowerCase() === email.trim().toLowerCase();
    });
    if (matching.length !== 1 || matching[0].active === false) return null;
    const role = normalizeRole(matching[0].role);
    if (!role || role === "OWNER" || role === "WORKSPACE_MEMBER") return null;
    if (expectedRole && role !== expectedRole) return null;
    return role;
  } catch {
    return null;
  }
}
