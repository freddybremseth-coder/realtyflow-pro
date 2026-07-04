import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import { GET as GETContent, POST as POSTContent } from "./content/route";
import { POST as POSTContentPublish } from "./content/publish/route";
import { GET as GETContentHubDrafts } from "./content-hub/drafts/route";
import { POST as POSTContentHubImageAttach } from "./content-hub/images/attach/route";
import { GET as GETDocumentsList } from "./documents/list/route";
import { DELETE as DELETEDocumentsPublish, PATCH as PATCHDocumentsPublish, POST as POSTDocumentsPublish } from "./documents/publish/route";
import { POST as POSTPublish } from "./publish/route";
import { POST as POSTBuyerDraft } from "./reports/buyer-draft/route";
import { POST as POSTReportsFromInsights } from "./reports/from-insights/route";
import { DELETE as DELETEReportsInsights, GET as GETReportsInsights, POST as POSTReportsInsights } from "./reports/insights/route";
import { GET as GETReports, POST as POSTReports } from "./reports/route";
import { GET as GETSchedule, POST as POSTSchedule } from "./schedule/route";

function jsonRequest(path: string, method: string, body?: Record<string, unknown>) {
  return new NextRequest(`https://realtyflow.test${path}`, {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
}

test.beforeEach(() => {
  process.env.REALTYFLOW_SESSION_SECRET = "content-admin-routes-test-secret";
  process.env.REALTYFLOW_ADMIN_EMAILS = "freddy.bremseth@gmail.com";
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.GEMINI_API_KEY;
});

test("content and document admin routes require admin before database, AI, or publishing access", async () => {
  const responses = await Promise.all([
    GETContent(jsonRequest("/api/content", "GET") as any),
    POSTContent(jsonRequest("/api/content", "POST", { type: "text", prompt: "Lag post" }) as any),
    POSTContentPublish(
      jsonRequest("/api/content/publish", "POST", {
        brandId: "soleada",
        contentType: "post",
        platforms: ["facebook"],
      }) as any,
    ),
    GETContentHubDrafts(jsonRequest("/api/content-hub/drafts", "GET") as any),
    POSTContentHubImageAttach(
      jsonRequest("/api/content-hub/images/attach", "POST", {
        draftId: "draft-1",
        imageUrl: "https://example.com/image.jpg",
      }) as any,
    ),
    GETDocumentsList(jsonRequest("/api/documents/list", "GET") as any),
    POSTDocumentsPublish(
      jsonRequest("/api/documents/publish", "POST", {
        title: "Doc",
        content: "Content",
      }) as any,
    ),
    PATCHDocumentsPublish(jsonRequest("/api/documents/publish", "PATCH", { id: "doc-1", title: "Doc" }) as any),
    DELETEDocumentsPublish(jsonRequest("/api/documents/publish?id=doc-1", "DELETE") as any),
    GETReports(jsonRequest("/api/reports", "GET") as any),
    POSTReports(jsonRequest("/api/reports", "POST", { template_id: "tall-og-trender" }) as any),
    POSTBuyerDraft(jsonRequest("/api/reports/buyer-draft", "POST", { sourceText: "Markedstall" }) as any),
    POSTReportsFromInsights(
      jsonRequest("/api/reports/from-insights", "POST", {
        insightIds: ["insight-1"],
      }) as any,
    ),
    GETReportsInsights(jsonRequest("/api/reports/insights", "GET") as any),
    POSTReportsInsights(
      jsonRequest("/api/reports/insights", "POST", {
        topic: "Marked",
        details: "Detaljer",
      }) as any,
    ),
    DELETEReportsInsights(jsonRequest("/api/reports/insights", "DELETE", { id: "insight-1" }) as any),
    GETSchedule(jsonRequest("/api/schedule", "GET") as any),
    POSTSchedule(
      jsonRequest("/api/schedule", "POST", {
        draft_id: "draft-1",
        platforms: ["facebook"],
        scheduled_at: new Date(Date.now() + 86_400_000).toISOString(),
      }) as any,
    ),
    POSTPublish(
      jsonRequest("/api/publish", "POST", {
        draft_id: "draft-1",
        platforms: ["facebook"],
        content: "Content",
        brand_id: "soleada",
      }) as any,
    ),
  ]);

  for (const response of responses) {
    const body = await response.json();
    assert.equal(response.status, 401);
    assert.equal(body.error, "Admin session required");
  }
});
