import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import { GET as GETAutoPublish } from "./auto-publish/route";
import { GET as GETEngagementTracker } from "./engagement-tracker/route";
import { GET as GETGrowthEngine } from "./growth-engine/route";
import { GET as GETLeadNurture } from "./lead-nurture/route";
import { GET as GETMarketData } from "./market-data/route";
import { GET as GETPublishingAutopilot } from "./publishing-autopilot/route";
import { GET as GETPublishingGrowthLoop } from "./publishing-growth-loop/route";
import { GET as GETPublishingMarketWatch } from "./publishing-market-watch/route";
import { GET as GETPropertyMarketing } from "./property-marketing/route";
import { GET as GETPropertyScanner } from "./property-scanner/route";
import { GET as GETSaasScanner } from "./saas-scanner/route";
import { GET as GETSaasEntitlements } from "./saas-entitlements/route";
import { GET as GETStorageArchive } from "./storage-archive/route";
import { GET as GETTrendingTags } from "./trending-tags/route";
import { GET as GETWeeklyReport } from "./weekly-report/route";

function cronRequest(path: string, authorization?: string) {
  return new NextRequest(`https://realtyflow.test${path}`, {
    headers: authorization ? { authorization } : {},
  });
}

const cronRoutes = [
  { path: "/api/cron/auto-publish", handler: GETAutoPublish },
  { path: "/api/cron/engagement-tracker", handler: GETEngagementTracker },
  { path: "/api/cron/growth-engine", handler: GETGrowthEngine },
  { path: "/api/cron/lead-nurture", handler: GETLeadNurture },
  { path: "/api/cron/market-data", handler: GETMarketData },
  { path: "/api/cron/publishing-autopilot", handler: GETPublishingAutopilot },
  { path: "/api/cron/publishing-growth-loop", handler: GETPublishingGrowthLoop },
  { path: "/api/cron/publishing-market-watch", handler: GETPublishingMarketWatch },
  { path: "/api/cron/property-marketing", handler: GETPropertyMarketing },
  { path: "/api/cron/property-scanner", handler: GETPropertyScanner },
  { path: "/api/cron/saas-scanner", handler: GETSaasScanner },
  { path: "/api/cron/saas-entitlements", handler: GETSaasEntitlements },
  { path: "/api/cron/storage-archive", handler: GETStorageArchive },
  { path: "/api/cron/trending-tags", handler: GETTrendingTags },
  { path: "/api/cron/weekly-report", handler: GETWeeklyReport },
];

test.beforeEach(() => {
  delete process.env.CRON_SECRET;
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
});

test.afterEach(() => {
  delete process.env.CRON_SECRET;
});

test("selected cron routes fail closed when CRON_SECRET is missing", async () => {
  const responses = await Promise.all(
    cronRoutes.map((route) => route.handler(cronRequest(route.path) as any)),
  );

  for (const response of responses) {
    const body = await response.json();
    assert.equal(response.status, 500);
    assert.equal(body.error, "Cron secret required");
  }
});

test("selected cron routes reject invalid cron credentials", async () => {
  process.env.CRON_SECRET = "cron-secret";

  const responses = await Promise.all(
    cronRoutes.map((route) => route.handler(cronRequest(route.path, "Bearer wrong") as any)),
  );

  for (const response of responses) {
    const body = await response.json();
    assert.equal(response.status, 401);
    assert.equal(body.error, "Unauthorized");
  }
});

test("lead nurture cron does not accept the admin middleware header", async () => {
  process.env.CRON_SECRET = "cron-secret";

  const response = await GETLeadNurture(
    new NextRequest("https://realtyflow.test/api/cron/lead-nurture?dry=1", {
      headers: { "x-admin-authenticated": "true" },
    }) as any,
  );

  const body = await response.json();
  assert.equal(response.status, 401);
  assert.equal(body.error, "Unauthorized");
});
