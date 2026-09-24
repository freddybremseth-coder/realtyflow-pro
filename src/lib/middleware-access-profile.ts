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
export async function liveRoleForMiddleware(email: string): Promise<AccessRole | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key || !email || !email.includes("@")) return null;

  try {
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
    const matching = profiles.filter((profile: unknown) => (
      profile && typeof profile === "object" &&
      typeof profile.email === "string" &&
      profile.email.trim().toLowerCase() === email.trim().toLowerCase()
    ));
    if (matching.length !== 1 || matching[0].active !== true) return null;
    const role = normalizeRole(matching[0].role);
    if (!role || role === "OWNER") return null;
    if (role === "WORKSPACE_MEMBER" && process.env.REALTYFLOW_WORKSPACE_MEMBERS_ENABLED !== "true") return null;
    return role;
  } catch {
    return null;
  }
}
