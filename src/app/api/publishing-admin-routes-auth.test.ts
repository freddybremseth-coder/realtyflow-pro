import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import { GET as GETAdvisorPlaybooks, POST as POSTAdvisorPlaybooks } from "./advisor-playbooks/route";
import { POST as POSTAdvisorContentDraft } from "./advisor-playbooks/content-draft/route";
import { POST as POSTAdvisorGenerate } from "./advisor-playbooks/generate/route";
import { GET as GETAgents, POST as POSTAgents } from "./agents/route";
import { GET as GETAgentCommandHistory } from "./agents/command/history/route";
import { POST as POSTAgentCommand } from "./agents/command/route";
import { POST as POSTMarketingKit } from "./marketing-kit/route";
import { POST as POSTMarketingKitDrafts } from "./marketing-kit/drafts/route";
import { GET as GETPublishingAutopilotResults } from "./publishing/autopilot-results/route";
import { GET as GETPublishingBookEngine, POST as POSTPublishingBookEngine } from "./publishing/book-engine/route";
import { GET as GETPublishingBookExport } from "./publishing/book-engine/export/route";
import { GET as GETPublishingBookExportFile } from "./publishing/book-engine/export-file/route";
import { POST as POSTPublishingBookUploadSource } from "./publishing/book-engine/upload-source/route";
import { POST as POSTPublishingBookWorkshop } from "./publishing/book-engine/workshop/route";
import { GET as GETPublishingBooks, PATCH as PATCHPublishingBooks, POST as POSTPublishingBooks } from "./publishing/books/route";
import { GET as GETPublishingHardMode, POST as POSTPublishingHardMode } from "./publishing/hard-mode/route";
import { GET as GETPublishingImpact } from "./publishing/impact/route";
import { POST as POSTPublishingImport } from "./publishing/import/route";
import { GET as GETPublishingMarketWatch } from "./publishing/market-watch/route";
import { GET as GETPublishingRecommendations, POST as POSTPublishingRecommendations } from "./publishing/recommendations/route";

function jsonRequest(path: string, method: string, body?: Record<string, unknown>) {
  return new NextRequest(`https://realtyflow.test${path}`, {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
}

test.beforeEach(() => {
  process.env.REALTYFLOW_SESSION_SECRET = "publishing-admin-routes-test-secret";
  process.env.REALTYFLOW_ADMIN_EMAILS = "freddy.bremseth@gmail.com";
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.GEMINI_API_KEY;
  delete process.env.OPENAI_API_KEY;
});

test("publishing, agent, advisor, and marketing admin routes require admin before DB, AI, or file access", async () => {
  const responses = await Promise.all([
    GETAgents(jsonRequest("/api/agents", "GET") as any),
    POSTAgents(jsonRequest("/api/agents", "POST", { agent: "marketing", command: "Lag kampanje" }) as any),
    POSTAgentCommand(jsonRequest("/api/agents/command", "POST", { message: "Sjekk CRM" }) as any),
    GETAgentCommandHistory(jsonRequest("/api/agents/command/history", "GET") as any),

    POSTMarketingKit(jsonRequest("/api/marketing-kit", "POST", { property: { title: "Villa" } }) as any),
    POSTMarketingKitDrafts(
      jsonRequest("/api/marketing-kit/drafts", "POST", {
        drafts: [{ title: "Post", description: "Copy" }],
        property_id: "property-1",
      }) as any,
    ),

    GETAdvisorPlaybooks(jsonRequest("/api/advisor-playbooks", "GET") as any),
    POSTAdvisorPlaybooks(jsonRequest("/api/advisor-playbooks", "POST", { title: "Playbook" }) as any),
    POSTAdvisorContentDraft(
      jsonRequest("/api/advisor-playbooks/content-draft", "POST", {
        playbook: { title: "Playbook", customer_message: "Message" },
      }) as any,
    ),
    POSTAdvisorGenerate(
      jsonRequest("/api/advisor-playbooks/generate", "POST", {
        context: { title: "Marked", summary: "Oppsummering" },
      }) as any,
    ),

    GETPublishingImpact(jsonRequest("/api/publishing/impact", "GET") as any),
    GETPublishingMarketWatch(jsonRequest("/api/publishing/market-watch", "GET") as any),
    GETPublishingAutopilotResults(jsonRequest("/api/publishing/autopilot-results", "GET") as any),
    GETPublishingHardMode(jsonRequest("/api/publishing/hard-mode", "GET") as any),
    POSTPublishingHardMode(jsonRequest("/api/publishing/hard-mode", "POST", { enabled: true }) as any),
    GETPublishingBooks(jsonRequest("/api/publishing/books", "GET") as any),
    POSTPublishingBooks(jsonRequest("/api/publishing/books", "POST", { title: "Book" }) as any),
    PATCHPublishingBooks(jsonRequest("/api/publishing/books", "PATCH", { id: "book-1", title: "Book" }) as any),
    GETPublishingRecommendations(jsonRequest("/api/publishing/recommendations", "GET") as any),
    POSTPublishingRecommendations(jsonRequest("/api/publishing/recommendations", "POST", { id: "front-seed" }) as any),
    POSTPublishingImport(jsonRequest("/api/publishing/import", "POST") as any),

    GETPublishingBookEngine(jsonRequest("/api/publishing/book-engine", "GET") as any),
    POSTPublishingBookEngine(jsonRequest("/api/publishing/book-engine", "POST", { title: "Book" }) as any),
    GETPublishingBookExport(jsonRequest("/api/publishing/book-engine/export?id=project-1", "GET") as any),
    GETPublishingBookExportFile(jsonRequest("/api/publishing/book-engine/export-file?id=project-1", "GET") as any),
    POSTPublishingBookUploadSource(jsonRequest("/api/publishing/book-engine/upload-source", "POST") as any),
    POSTPublishingBookWorkshop(jsonRequest("/api/publishing/book-engine/workshop", "POST", { theme: "Mediterranean" }) as any),
  ]);

  for (const response of responses) {
    const body = await response.json();
    assert.equal(response.status, 401);
    assert.equal(body.error, "Admin session required");
  }
});
