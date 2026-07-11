import { NextRequest } from "next/server";
import { GET as executiveBriefingGET } from "../../executive-briefing/route";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest) {
  return executiveBriefingGET(request);
}
