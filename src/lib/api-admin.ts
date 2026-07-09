import { NextRequest, NextResponse } from "next/server";
import { verifyAdminSession } from "@/lib/admin-auth";

export const ADMIN_SESSION_REQUIRED_MESSAGE = "Admin session required";
export const REMASTER_PROXY_AUTH_HEADER = "x-remaster-proxy-authenticated";

export async function requireAdminApi(request: NextRequest, body: Record<string, unknown> = {}) {
  if (request.headers.get(REMASTER_PROXY_AUTH_HEADER) === "true") return null;

  const session = await verifyAdminSession(request.cookies.get("realtyflow_admin")?.value);
  if (session) return null;
  return NextResponse.json({ ...body, error: ADMIN_SESSION_REQUIRED_MESSAGE }, { status: 401 });
}
