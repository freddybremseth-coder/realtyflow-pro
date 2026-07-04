import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import { GET as GETAutomationRules, POST as POSTAutomationRules } from "./automation/rules/route";
import { DELETE as DELETEAreaProfile } from "./area-profiles/[id]/route";
import { POST as POSTAreaProfileGenerate } from "./area-profiles/generate/route";
import { POST as POSTAreaProfiles } from "./area-profiles/route";
import { GET as GETCampaigns, POST as POSTCampaigns } from "./campaigns/route";
import { GET as GETCatastroPdf } from "./plots/[id]/catastro-pdf/route";
import { DELETE as DELETEPlotAsset, PATCH as PATCHPlotAsset } from "./plots/[id]/assets/[assetId]/route";
import { POST as POSTPlotAssetDistribute } from "./plots/[id]/assets/[assetId]/distribute/route";
import { POST as POSTPlotAsset } from "./plots/[id]/assets/route";
import { DELETE as DELETEPlots, POST as POSTPlots } from "./plots/route";
import { POST as POSTMarketingCopy } from "./properties/[id]/marketing-copy/route";
import { GET as GETPropertyPublication, PATCH as PATCHPropertyPublication } from "./properties/[id]/publication/route";
import { DELETE as DELETEProperties, PATCH as PATCHProperties, POST as POSTProperties } from "./properties/route";
import { POST as POSTPropertyPdfMulti } from "./property-pdf/multi/route";
import { GET as GETPropertyPdf, POST as POSTPropertyPdf } from "./property-pdf/route";

function jsonRequest(path: string, method: string, body?: Record<string, unknown>) {
  return new NextRequest(`https://realtyflow.test${path}`, {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
}

test.beforeEach(() => {
  process.env.REALTYFLOW_SESSION_SECRET = "property-admin-routes-test-secret";
  process.env.REALTYFLOW_ADMIN_EMAILS = "freddy.bremseth@gmail.com";
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.GEMINI_API_KEY;
  delete process.env.OPENAI_API_KEY;
});

test("property, plot, area, PDF, campaign, and automation admin actions require admin before body or database access", async () => {
  const propertyParams = { params: { id: "property-1" } } as any;
  const propertyPromiseParams = { params: Promise.resolve({ id: "property-1" }) } as any;
  const areaParams = { params: { id: "area-1" } } as any;
  const plotParams = { params: { id: "plot-1" } } as any;
  const plotAssetParams = { params: { id: "plot-1", assetId: "asset-1" } } as any;

  const responses = await Promise.all([
    POSTProperties(jsonRequest("/api/properties", "POST", { ref: "A1" }) as any),
    PATCHProperties(jsonRequest("/api/properties?id=property-1", "PATCH", { title: "Updated" }) as any),
    DELETEProperties(jsonRequest("/api/properties?id=property-1", "DELETE") as any),
    POSTMarketingCopy(jsonRequest("/api/properties/property-1/marketing-copy", "POST", { notes: "Warm" }) as any, propertyParams),
    GETPropertyPublication(jsonRequest("/api/properties/property-1/publication", "GET") as any, propertyPromiseParams),
    PATCHPropertyPublication(
      jsonRequest("/api/properties/property-1/publication", "PATCH", { visibleBrandIds: ["zeneco"] }) as any,
      propertyPromiseParams,
    ),

    POSTPlots(jsonRequest("/api/plots", "POST", { plotNumber: "P1" }) as any),
    DELETEPlots(jsonRequest("/api/plots", "DELETE", { id: "plot-1" }) as any),
    POSTPlotAsset(jsonRequest("/api/plots/plot-1/assets", "POST") as any, plotParams),
    PATCHPlotAsset(jsonRequest("/api/plots/plot-1/assets/asset-1", "PATCH", { title: "Asset" }) as any, plotAssetParams),
    DELETEPlotAsset(jsonRequest("/api/plots/plot-1/assets/asset-1", "DELETE") as any, plotAssetParams),
    POSTPlotAssetDistribute(
      jsonRequest("/api/plots/plot-1/assets/asset-1/distribute", "POST", { target: "website" }) as any,
      plotAssetParams,
    ),
    GETCatastroPdf(jsonRequest("/api/plots/plot-1/catastro-pdf", "GET") as any, plotParams),

    POSTAreaProfiles(jsonRequest("/api/area-profiles", "POST", { brandId: "zeneco", name: "Calpe" }) as any),
    DELETEAreaProfile(jsonRequest("/api/area-profiles/area-1", "DELETE") as any, areaParams),
    POSTAreaProfileGenerate(jsonRequest("/api/area-profiles/generate", "POST", { name: "Calpe" }) as any),

    GETPropertyPdf(jsonRequest("/api/property-pdf?propertyId=property-1", "GET") as any),
    POSTPropertyPdf(jsonRequest("/api/property-pdf", "POST", { propertyId: "property-1" }) as any),
    POSTPropertyPdfMulti(
      jsonRequest("/api/property-pdf/multi", "POST", {
        propertyIds: ["property-1"],
        brandId: "zeneco",
      }) as any,
    ),

    GETCampaigns(jsonRequest("/api/campaigns", "GET") as any),
    POSTCampaigns(jsonRequest("/api/campaigns", "POST", { brandId: "zeneco", name: "Launch" }) as any),
    GETAutomationRules(jsonRequest("/api/automation/rules", "GET") as any),
    POSTAutomationRules(jsonRequest("/api/automation/rules", "POST", { action: "run", id: "seed-auto-publish" }) as any),
  ]);

  for (const response of responses) {
    const body = await response.json();
    assert.equal(response.status, 401);
    assert.equal(body.error, "Admin session required");
  }
});
