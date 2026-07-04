import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import { POST as POSTRecommendTime } from "./ai/recommend-time/route";
import { GET as GETBookingConfig, POST as POSTBookingConfig } from "./booking-config/route";
import { GET as GETDataHealth } from "./business/data-health/route";
import { GET as GETBrandsSettings, POST as POSTBrandsSettings } from "./brands/settings/route";
import { GET as GETBusinessOverview } from "./business/overview/route";
import { POST as POSTBusinessFinanceSync } from "./business/finance/sync/route";
import { GET as GETChatbotSessions } from "./chatbot/sessions/route";
import { GET as GETPortalAdmin, POST as POSTPortalAdmin } from "./crm/portal-admin/route";
import { POST as POSTNewsletter } from "./email/newsletter/route";
import { GET as GETGrowthAbTests, PATCH as PATCHGrowthAbTests } from "./growth/ab-tests/route";
import { DELETE as DELETEGrowthActions, GET as GETGrowthActions, PATCH as PATCHGrowthActions } from "./growth/actions/route";
import { GET as GETGrowthEngine, POST as POSTGrowthEngine } from "./growth/engine/route";
import { GET as GETGrowthLeadMagnets, PATCH as PATCHGrowthLeadMagnets } from "./growth/lead-magnets/route";
import { GET as GETGrowthStats } from "./growth/stats/route";
import { GET as GETHealth } from "./health/route";
import { GET as GETGmailSync } from "./gmail/sync/route";
import { GET as GETImportSources, POST as POSTImportSources } from "./import-sources/route";
import { DELETE as DELETEImageBank, GET as GETImageBank, PATCH as PATCHImageBank, POST as POSTImageBank } from "./neural-beat/image-bank/route";
import { GET as GETNeuralRecommendations, POST as POSTNeuralRecommendations } from "./neural-beat/recommendations/route";
import { GET as GETSafeNeuralRecommendations, POST as POSTSafeNeuralRecommendations } from "./neural-beat/recommendations-safe/route";
import { POST as POSTThumbnailRotate } from "./neural-beat/thumbnail-rotate/route";
import { GET as GETOlivia } from "./olivia/route";
import { DELETE as DELETEFacebookDiagnose, GET as GETFacebookDiagnose, PATCH as PATCHFacebookDiagnose } from "./oauth/facebook/diagnose/route";
import { POST as POSTFacebookFetchPages } from "./oauth/facebook/fetch-pages/route";
import { DELETE as DELETEGoogleDiagnose, GET as GETGoogleDiagnose } from "./oauth/google/diagnose/route";
import { GET as GETScanner, POST as POSTScanner } from "./scanner/route";
import { GET as GETSettings, POST as POSTSettings } from "./settings/route";
import { DELETE as DELETESocialAccounts, GET as GETSocialAccounts, POST as POSTSocialAccounts } from "./social-accounts/route";
import { GET as GETWorkItems, PATCH as PATCHWorkItems, POST as POSTWorkItems } from "./work-items/route";
import { DELETE as DELETEYoutubeChannels, GET as GETYoutubeChannels, PATCH as PATCHYoutubeChannels, POST as POSTYoutubeChannels } from "./youtube-channels/route";
import { GET as GETYoutubeTest } from "./youtube/test/route";

function jsonRequest(path: string, method: string, body?: Record<string, unknown>) {
  return new NextRequest(`https://realtyflow.test${path}`, {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
}

test.beforeEach(() => {
  process.env.REALTYFLOW_SESSION_SECRET = "platform-admin-routes-test-secret";
  process.env.REALTYFLOW_ADMIN_EMAILS = "freddy.bremseth@gmail.com";
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  delete process.env.OLIVIA_SUPABASE_URL;
  delete process.env.OLIVIA_SUPABASE_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.GEMINI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  delete process.env.EMAIL_ENCRYPTION_KEY;
  delete process.env.REALTYFLOW_MIGRATION_SECRET;
});

test("platform, growth, business, CRM, email, and channel admin routes require admin before env, body, or service access", async () => {
  const responses = await Promise.all([
    GETSettings(jsonRequest("/api/settings", "GET") as any),
    POSTSettings(jsonRequest("/api/settings", "POST", { settings: [{ key: "smtp", value: "secret" }] }) as any),
    GETBrandsSettings(jsonRequest("/api/brands/settings", "GET") as any),
    POSTBrandsSettings(jsonRequest("/api/brands/settings", "POST", { brand_id: "zeneco", settings: {} }) as any),
    GETBookingConfig(jsonRequest("/api/booking-config?brand_id=zeneco", "GET") as any),
    POSTBookingConfig(jsonRequest("/api/booking-config", "POST", { brand_id: "zeneco", booking: {} }) as any),

    GETSocialAccounts(jsonRequest("/api/social-accounts", "GET") as any),
    POSTSocialAccounts(jsonRequest("/api/social-accounts", "POST", { platform: "facebook" }) as any),
    DELETESocialAccounts(jsonRequest("/api/social-accounts?id=account-1", "DELETE") as any),
    GETYoutubeChannels(jsonRequest("/api/youtube-channels", "GET") as any),
    POSTYoutubeChannels(jsonRequest("/api/youtube-channels", "POST", { title: "Channel" }) as any),
    PATCHYoutubeChannels(jsonRequest("/api/youtube-channels?id=channel-1", "PATCH", { title: "Updated" }) as any),
    DELETEYoutubeChannels(jsonRequest("/api/youtube-channels?id=channel-1", "DELETE") as any),

    GETImportSources(jsonRequest("/api/import-sources", "GET") as any),
    POSTImportSources(jsonRequest("/api/import-sources", "POST", { brand_id: "zeneco", name: "Feed" }) as any),
    GETScanner(jsonRequest("/api/scanner", "GET") as any),
    POSTScanner(jsonRequest("/api/scanner", "POST", { action: "weekly_scan" }) as any),
    GETWorkItems(jsonRequest("/api/work-items", "GET") as any),
    POSTWorkItems(jsonRequest("/api/work-items", "POST", { title: "Task" }) as any),
    PATCHWorkItems(jsonRequest("/api/work-items", "PATCH", { id: "work-1", status: "DONE" }) as any),

    GETGrowthStats(jsonRequest("/api/growth/stats", "GET") as any),
    GETGrowthActions(jsonRequest("/api/growth/actions", "GET") as any),
    PATCHGrowthActions(jsonRequest("/api/growth/actions", "PATCH", { id: "action-1", status: "completed" }) as any),
    DELETEGrowthActions(jsonRequest("/api/growth/actions?id=action-1", "DELETE") as any),
    GETGrowthEngine(jsonRequest("/api/growth/engine", "GET") as any),
    POSTGrowthEngine(jsonRequest("/api/growth/engine", "POST", { action: "run_cycle", brands: ["zeneco"] }) as any),
    GETGrowthLeadMagnets(jsonRequest("/api/growth/lead-magnets", "GET") as any),
    PATCHGrowthLeadMagnets(jsonRequest("/api/growth/lead-magnets", "PATCH", { id: "magnet-1", status: "active" }) as any),
    GETGrowthAbTests(jsonRequest("/api/growth/ab-tests", "GET") as any),
    PATCHGrowthAbTests(jsonRequest("/api/growth/ab-tests", "PATCH", { id: "test-1", winner: "a" }) as any),

    GETBusinessOverview(jsonRequest("/api/business/overview", "GET") as any),
    GETDataHealth(jsonRequest("/api/business/data-health", "GET") as any),
    POSTBusinessFinanceSync(jsonRequest("/api/business/finance/sync", "POST") as any),
    GETHealth(jsonRequest("/api/health", "GET") as any),
    GETChatbotSessions(jsonRequest("/api/chatbot/sessions", "GET") as any),
    POSTRecommendTime(
      jsonRequest("/api/ai/recommend-time", "POST", {
        platforms: ["instagram"],
        brand_id: "zeneco",
      }) as any,
    ),
    GETPortalAdmin(jsonRequest("/api/crm/portal-admin?contactId=contact-1", "GET") as any),
    POSTPortalAdmin(jsonRequest("/api/crm/portal-admin", "POST", { action: "message", contactId: "contact-1", message: "Hei" }) as any),
    POSTNewsletter(
      jsonRequest("/api/email/newsletter", "POST", {
        brand_id: "zeneco",
        subject: "Nyhet",
        body_text: "Hei",
        recipients: "individual",
        individual_emails: ["test@example.com"],
      }) as any,
    ),
    GETGmailSync(jsonRequest("/api/gmail/sync?contactEmail=test@example.com", "GET") as any),
    GETFacebookDiagnose(jsonRequest("/api/oauth/facebook/diagnose?brand=zeneco", "GET") as any),
    PATCHFacebookDiagnose(jsonRequest("/api/oauth/facebook/diagnose?id=row-1&brand=zeneco", "PATCH") as any),
    DELETEFacebookDiagnose(jsonRequest("/api/oauth/facebook/diagnose?brand=zeneco&mode=invalid", "DELETE") as any),
    POSTFacebookFetchPages(jsonRequest("/api/oauth/facebook/fetch-pages", "POST", { brand: "zeneco" }) as any),
    GETGoogleDiagnose(jsonRequest("/api/oauth/google/diagnose", "GET") as any),
    DELETEGoogleDiagnose(jsonRequest("/api/oauth/google/diagnose?mode=revoked", "DELETE") as any),
    GETOlivia(jsonRequest("/api/olivia", "GET") as any),
    GETImageBank(jsonRequest("/api/neural-beat/image-bank", "GET") as any),
    POSTImageBank(jsonRequest("/api/neural-beat/image-bank", "POST", { url: "https://example.com/image.png" }) as any),
    PATCHImageBank(jsonRequest("/api/neural-beat/image-bank", "PATCH", { ids: ["image-1"] }) as any),
    DELETEImageBank(jsonRequest("/api/neural-beat/image-bank?id=image-1", "DELETE") as any),
    GETNeuralRecommendations(jsonRequest("/api/neural-beat/recommendations", "GET") as any),
    POSTNeuralRecommendations(jsonRequest("/api/neural-beat/recommendations", "POST", { action: { type: "strategy" } }) as any),
    GETSafeNeuralRecommendations(jsonRequest("/api/neural-beat/recommendations-safe", "GET") as any),
    POSTSafeNeuralRecommendations(
      jsonRequest("/api/neural-beat/recommendations-safe", "POST", {
        action: { type: "strategy" },
      }) as any,
    ),
    POSTThumbnailRotate(jsonRequest("/api/neural-beat/thumbnail-rotate", "POST", { songId: "song-1", variantIndex: 0 }) as any),
    GETYoutubeTest(jsonRequest("/api/youtube/test?brandId=zeneco", "GET") as any),
  ]);

  for (const response of responses) {
    const body = await response.json();
    assert.equal(response.status, 401);
    assert.equal(body.error, "Admin session required");
  }
});
