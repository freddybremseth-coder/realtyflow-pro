import { NextRequest, NextResponse } from "next/server";
import { buildSiteProfile, parseServiceList } from "@/lib/site-profile";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type AnalyzeRequest = Record<string, unknown>;

function readText(body: AnalyzeRequest, snakeCase: string, camelCase: string) {
  const value = body[snakeCase] ?? body[camelCase];
  const text = String(value || "").trim();
  return text || null;
}

export async function GET() {
  return NextResponse.json({
    endpoint: "/api/saas/demosites/analyze",
    method: "POST",
    storesData: false,
    required: ["companyName or company_name"],
    optional: ["websiteUrl", "logoUrl", "brandColor", "industry", "services", "notes"],
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as AnalyzeRequest;
    const companyName = readText(body, "company_name", "companyName");

    if (!companyName) {
      return NextResponse.json({ error: "companyName is required" }, { status: 400 });
    }

    const services = parseServiceList(body.services);
    const profile = buildSiteProfile({
      companyName,
      websiteUrl: readText(body, "website_url", "websiteUrl"),
      logoUrl: readText(body, "logo_url", "logoUrl"),
      brandColor: readText(body, "brand_color", "brandColor"),
      industry: readText(body, "industry", "industry"),
      services,
      notes: readText(body, "notes", "notes"),
    });

    return NextResponse.json({
      ok: true,
      companyName,
      profile,
      demoPolicy: {
        previewStatus: "draft_preview",
        expiresInDays: 7,
        customerCanClaim: true,
        customerMustBuyToKeep: true,
        deleteIfNotClaimed: true,
      },
      nextSteps: [
        "Create a demo request in RealtyFlow",
        "Generate preview content from selected template",
        "Show preview URL to customer",
        "Convert preview to paid order or expire it",
      ],
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not analyze site profile" },
      { status: 500 }
    );
  }
}
