import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/api-admin";
import {
  BRREG_OPEN_DATA_SOURCE,
  brregEntityToProspect,
  isUsableBrregCorporateEntity,
  matchesBrregIndustryProfile,
  parseBrregIndustryProfile,
  type BrregEntity,
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

  const collected: BrregEntity[] = [];
  const warnings: string[] = [];

  for (let page = 0; page < scanPages && collected.length < limit; page += 1) {
    const query = new URLSearchParams({
      fraAntallAnsatte: String(minEmployees),
      tilAntallAnsatte: String(maxEmployees),
      konkurs: "false",
      registrertIForetaksregisteret: "true",
      sort: "antallAnsatte,DESC",
      size: "100",
      page: String(page),
    });

    const url = `${BRREG_OPEN_DATA_SOURCE.endpoint}?${query.toString()}`;
    let response: Response;
    try {
      response = await fetch(url, {
        headers: {
          Accept: "application/vnd.brreg.enhetsregisteret.enhet.v2+json",
          "User-Agent": "RealtyFlow Corporate Homes/1.0",
        },
        cache: "no-store",
        signal: AbortSignal.timeout(12000),
      });
    } catch (error) {
      warnings.push(error instanceof Error ? error.message : "Brønnøysund-kall feilet.");
      break;
    }

    if (!response.ok) {
      warnings.push(`Brønnøysund svarte ${response.status} på side ${page + 1}.`);
      break;
    }

    const body = await response.json().catch(() => null);
    const entities = Array.isArray(body?._embedded?.enheter)
      ? body._embedded.enheter as BrregEntity[]
      : [];

    for (const entity of entities) {
      if (!isUsableBrregCorporateEntity(entity)) continue;
      if (!matchesBrregIndustryProfile(entity, profile)) continue;
      collected.push(entity);
      if (collected.length >= limit) break;
    }

    if (!entities.length) break;
  }

  const candidates = collected
    .map((entity) => brregEntityToProspect(entity))
    .sort((a, b) => Number(b.fit_score || 0) - Number(a.fit_score || 0));

  return NextResponse.json({
    candidates,
    source: BRREG_OPEN_DATA_SOURCE,
    query: {
      minEmployees,
      maxEmployees,
      profile,
      limit,
      scanPages,
    },
    coverage: {
      returned: candidates.length,
      note: "Dette er et avgrenset uttrekk fra Enhetsregisteret, ikke en komplett oversikt over alle relevante norske selskaper.",
    },
    warnings,
  });
}
