import { NextRequest, NextResponse } from "next/server";

export const CRON_SECRET_REQUIRED_MESSAGE = "Cron secret required";
export const CRON_UNAUTHORIZED_MESSAGE = "Unauthorized";

export function requireCronApi(request: NextRequest, body: Record<string, unknown> = {}) {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return NextResponse.json({ ...body, error: CRON_SECRET_REQUIRED_MESSAGE }, { status: 500 });
  }

  const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  const headerSecret = request.headers.get("x-cron-secret")?.trim();
  const querySecret = request.nextUrl.searchParams.get("key")?.trim();

  if (bearer === expected || headerSecret === expected || querySecret === expected) return null;

  return NextResponse.json({ ...body, error: CRON_UNAUTHORIZED_MESSAGE }, { status: 401 });
}
