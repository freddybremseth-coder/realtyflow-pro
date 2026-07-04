import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import { POST as POSTPropertyPdfSend } from "./property-pdf/send/route";
import { POST as POSTMultiPropertyPdfSend } from "./property-pdf/multi/send/route";
import { POST as POSTReportSend } from "./reports/send/route";
import { POST as POSTPublishPortal } from "./reports/publish-portal/route";

function jsonRequest(path: string, body: Record<string, unknown>) {
  return new NextRequest(`https://realtyflow.test${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

test.beforeEach(() => {
  process.env.REALTYFLOW_SESSION_SECRET = "outbound-actions-test-secret";
  process.env.REALTYFLOW_ADMIN_EMAILS = "freddy.bremseth@gmail.com";
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  delete process.env.RESEND_API_KEY;
});

test("outbound send and publish actions require admin session before integrations", async () => {
  const responses = await Promise.all([
    POSTReportSend(jsonRequest("/api/reports/send", { reportId: "report-1" }) as any),
    POSTPublishPortal(jsonRequest("/api/reports/publish-portal", { reportId: "report-1" }) as any),
    POSTPropertyPdfSend(
      jsonRequest("/api/property-pdf/send", {
        propertyId: "property-1",
        brandId: "soleada",
        to: "customer@example.com",
      }) as any,
    ),
    POSTMultiPropertyPdfSend(
      jsonRequest("/api/property-pdf/multi/send", {
        propertyIds: ["property-1", "property-2"],
        brandId: "soleada",
        to: "customer@example.com",
      }) as any,
    ),
  ]);

  for (const response of responses) {
    const body = await response.json();
    assert.equal(response.status, 401);
    assert.equal(body.error, "Admin session required");
  }
});
