import { NextRequest, NextResponse } from "next/server";
import { verifyAdminSession, isAdminEmail } from "@/lib/admin-auth";
import {
  accessRequirementForApi,
  hasPermission,
  permissionsForRole,
  type AccessPermission,
  type AccessRole,
} from "@/lib/access-control";
import { findAccessProfile } from "@/lib/access-control-server";

export const ADMIN_SESSION_REQUIRED_MESSAGE = "Admin session required";
export const ACCESS_PERMISSION_REQUIRED_MESSAGE = "Access permission required";

export interface RequestAccessContext {
  email: string;
  role: AccessRole;
  permissions: AccessPermission[];
  source: "owner-session" | "role-profile" | "remaster-proxy";
}

/**
 * Requests proxied from the Re-Master Freddy admin carry the shared
 * migration secret plus the verified owner email instead of the RealtyFlow
 * session cookie. The proxy remains owner-only.
 */
function remasterProxyContext(request: NextRequest): RequestAccessContext | null {
  const secret = process.env.REALTYFLOW_MIGRATION_SECRET;
  if (!secret) return null;
  if (request.headers.get("x-remaster-migration-secret") !== secret) return null;
  const email = request.headers.get("x-remaster-admin")?.trim().toLowerCase() || "";
  if (!isAdminEmail(email)) return null;
  return { email, role: "OWNER", permissions: permissionsForRole("OWNER"), source: "remaster-proxy" };
}

export async function getRequestAccessContext(request: NextRequest): Promise<RequestAccessContext | null> {
  const session = await verifyAdminSession(request.cookies.get("realtyflow_admin")?.value);
  if (session?.role === "OWNER" && isAdminEmail(session.email)) {
    return { email: session.email, role: "OWNER", permissions: permissionsForRole("OWNER"), source: "owner-session" };
  }
  if (session) {
    const resolved = await findAccessProfile(session.email);
    if (resolved.error || !resolved.profile || !resolved.profile.active) return null;
    return {
      email: resolved.profile.email,
      role: resolved.profile.role,
      permissions: permissionsForRole(resolved.profile.role),
      source: "role-profile",
    };
  }
  return remasterProxyContext(request);
}

export async function requireAdminApi(request: NextRequest, body: Record<string, unknown> = {}) {
  const context = await getRequestAccessContext(request);
  if (!context) return NextResponse.json({ ...body, error: ADMIN_SESSION_REQUIRED_MESSAGE }, { status: 401 });

  const requirement = accessRequirementForApi(new URL(request.url).pathname, request.method);
  if (context.role === "OWNER" || requirement === "AUTHENTICATED") return null;
  if (requirement === "OWNER_ONLY" || !hasPermission(context.role, requirement)) {
    return NextResponse.json({ ...body, error: ACCESS_PERMISSION_REQUIRED_MESSAGE, requiredPermission: requirement }, { status: 403 });
  }
  return null;
}
