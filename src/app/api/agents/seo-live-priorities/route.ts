export const dynamic = "force-dynamic";
export const maxDuration = 90;

import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/api-admin";
import { getGSCBrandSnapshot, targetForBrand } from "@/services/agents/seo-search-console";
import { getSEOLeadSignals } from "@/services/agents/seo-leads";
import { getSEOObservedSignals } from "@/services/agents/seo-data";
import { planGSCOpportunities } from "@/services/agents/seo-priorities";

/** On-demand, no-approval-queue, read-only SEO opportunities. Return aggregate
 *  source-page inquiries separately from genuine GSC search metrics. */
export async function GET(req: NextRequest) {
  const denied = await requireAdminApi(req);
  if (denied) return denied;
  const brandId = req.nextUrl.searchParams.get("brand") || "";
  if (!targetForBrand(brandId)) {
    return NextResponse.json({ error: "Unknown approved portfolio brand" }, { status: 400 });
  }
  try {
    const [gsc, leads, arrivals] = await Promise.all([
      getGSCBrandSnapshot(brandId), getSEOLeadSignals(), getSEOObservedSignals(),
    ]);
    const brandLeads = leads.byBrand.find(brand => brand.brandId === brandId);
    const brandArrivals = arrivals.byBrand.find(brand => brand.brandId === brandId);
    const opportunities = gsc ? planGSCOpportunities([gsc]) : [];
    const sourcePageInquiries = leads.topLeadPages.filter(page => page.brandId === brandId);
    const measuredReferralPages = arrivals.topPages.filter(page => page.brandId === brandId);
    return NextResponse.json({
      brandId,
      at: new Date().toISOString(),
      searchConsole: gsc,
      opportunities,
      sourcePageInquiries,
      measuredReferralPages,
      totals: {
        websiteInquiries: brandLeads?.current ?? 0,
        websiteInquiriesWithKnownPage: brandLeads?.withPage ?? 0,
        websiteInquiriesWithoutKnownPage: brandLeads?.withoutPage ?? 0,
        measuredReferrerArrivals: brandArrivals?.current ?? 0,
      },
      dataQuality: {
        searchConsoleStatus: gsc ? "measured" : "not_connected",
        referralEvents: arrivals.dataQuality.note,
        leadAttribution: leads.dataQuality.note,
        attributionNote: "GSC clicks, search/AI referrer arrivals and website inquiries are independent aggregates. A form page is not necessarily the first landing page. No actual organic leads, conversion rates, keyword-attributed sales or AI citations are proven by these aggregates.",
      },
      published: false, workItemsCreated: 0,
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("[SamSEO] On-demand brand review failed", error instanceof Error ? error.message : "unknown");
    return NextResponse.json({
      error: "Kunne ikke kontrollere dette nettstedets aktuelle data. Sam har ikke lagt inn fiktive målinger.",
    }, { status: 503, headers: { "Cache-Control": "private, no-store" } });
  }
}
