import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/api-admin";
import { summarizeRemasterAnalytics } from "@/services/growth/remaster-analytics-observation";
import { readRemasterYouTubeAnalytics } from "@/services/integrations/remaster-youtube-analytics";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const denied = await requireAdminApi(request);
  if (denied) return denied;

  const rawDays = Number(request.nextUrl.searchParams.get("days") || 28);
  const days = Number.isFinite(rawDays) ? rawDays : 28;
  const result = await readRemasterYouTubeAnalytics(days);
  const observation = result.state === "READY" ? summarizeRemasterAnalytics(result.videos) : null;

  return NextResponse.json({ ...result, observation }, {
    status: result.state === "ERROR" ? 502 : 200,
    headers: { "Cache-Control": "no-store" },
  });
}
