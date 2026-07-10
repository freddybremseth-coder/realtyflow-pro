import { NextRequest, NextResponse } from "next/server";
import { verifyAdminSession, isAdminEmail } from "@/lib/admin-auth";

export const ADMIN_SESSION_REQUIRED_MESSAGE = "Admin session required";

/**
 * Requests proxied from the Re-Master Freddy admin carry the shared
 * migration secret plus the verified admin email instead of the RealtyFlow
 * session cookie. Same trust chain as the other Re-Master proxy routes
 * (autopilot-settings, youtube/status, ...).
 */
function isRemasterProxyRequest(request: NextRequest) {
  const secret = process.env.REALTYFLOW_MIGRATION_SECRET;
  if (!secret) return false;
  if (request.headers.get("x-remaster-migration-secret") !== secret) return false;
  return isAdminEmail(request.headers.get("x-remaster-admin"));
}

export async function requireAdminApi(request: NextRequest, body: Record<string, unknown> = {}) {
  const session = await verifyAdminSession(request.cookies.get("realtyflow_admin")?.value);
  if (session) return null;
  if (isRemasterProxyRequest(request)) return null;
  return NextResponse.json({ ...body, error: ADMIN_SESSION_REQUIRED_MESSAGE }, { status: 401 });
}
