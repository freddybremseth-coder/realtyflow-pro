import { NextRequest, NextResponse } from "next/server";
import { ACCESS_ROLE_LABELS } from "@/lib/access-control";
import { getRequestAccessContext } from "@/lib/api-admin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest) {
  const context = await getRequestAccessContext(request);
  if (!context) return NextResponse.json({ authenticated: false }, { status: 401 });
  return NextResponse.json({
    authenticated: true,
    user: {
      email: context.email,
      role: context.role,
      roleLabel: ACCESS_ROLE_LABELS[context.role],
      permissions: context.permissions,
    },
  });
}
