export const dynamic = "force-dynamic";
export const maxDuration = 90;

import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/api-admin";
import { auditSEOPortfolio } from "@/services/agents/seo-audit";

/** Explicit user-triggered read-only public portfolio audit; no side effects. */
export async function GET(request: NextRequest) {
  const unauthorized = await requireAdminApi(request);
  if (unauthorized) return unauthorized;
  const audits = await auditSEOPortfolio();
  return NextResponse.json({
    checkedAt: new Date().toISOString(),
    scope: "Public homepage, robots.txt and sitemap.xml only; not a site-wide crawl or indexed-page measurement.",
    audits,
    published: false,
    changedWebsites: 0,
  }, { headers: { "Cache-Control": "private, no-store" } });
}
