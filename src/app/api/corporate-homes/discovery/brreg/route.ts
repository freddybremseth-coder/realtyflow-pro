import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/api-admin";
import {
  BRREG_OPEN_DATA_SOURCE,
  discoverBrregCandidates,
  parseBrregIndustryProfile,
} from "@/lib/corporate-brreg";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function boundedInt(value: string | null, fallback: number, min: number, max: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, Math.round(parsed))) : fallback;
}

export async function GET(request: NextRequest) {
  const denied = await requireAdminApi(request, { candidates: [] });
  if (denied) return denied;

  const params = request.nextUrl.searchParams;
  const minEmployees = boundedInt(params.get("minEmployees"), 15, 5, 5000);
  const maxEmployees = boundedInt(params.get("maxEmployees"), 500, minEmployees, 5000);
  const profile = parseBrregIndustryProfile(params.get("profile"));
  const limit = boundedInt(params.get("limit"), 50, 10, 100);
  const scanPages = boundedInt(params.get("scanPages"), 4, 1, 6);

  const discovery = await discoverBrregCandidates({
    minEmployees,
    maxEmployees,
    profile,
    limit,
    scanPages,
  });

  return NextResponse.json({
    candidates: discovery.candidates,
    source: BRREG_OPEN_DATA_SOURCE,
    query: discovery.query,
    coverage: {
      returned: discovery.candidates.length,
      note: "Dette er et avgrenset uttrekk fra Enhetsregisteret, ikke en komplett oversikt over alle relevante norske selskaper.",
    },
    warnings: discovery.warnings,
  });
}
