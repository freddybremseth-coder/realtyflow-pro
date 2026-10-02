import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { OPTIONS, POST } from "./route";
import { middleware } from "@/middleware";

const endpoint = "https://realtyflow.test/api/public/conversion-event";

test("approved public origins pass middleware and receive conversion CORS preflight", async () => {
  for (const origin of [
    "https://www.chatgenius.pro",
    "https://chatgenius.pro",
    "https://www.donaanna.com",
    "https://donaanna.com",
  ]) {
    const request = new NextRequest(endpoint, {
      method: "OPTIONS",
      headers: {
        origin,
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "content-type",
      },
    });
    const admission = await middleware(request);
    assert.equal(admission.headers.get("x-middleware-next"), "1");
    const response = await OPTIONS(request);
    assert.equal(response.status, 204);
    assert.equal(response.headers.get("access-control-allow-origin"), origin);
  }
});

test("untrusted origins remain denied", async () => {
  for (const origin of ["", "https://evil.test", "https://chatgenius.pro.evil.test"]) {
    const response = await OPTIONS(new NextRequest(endpoint, { method: "OPTIONS", headers: { origin } }));
    assert.equal(response.status, 403);
  }
});

test("invalid conversion payloads are rejected before database access", async () => {
  const response = await POST(new NextRequest(endpoint, {
    method: "POST",
    headers: { origin: "https://www.chatgenius.pro", "content-type": "application/json" },
    body: JSON.stringify({ eventType: "password_capture", target: "email_contact", path: "/" }),
  }));
  assert.equal(response.status, 400);
});

test("conversion target is an allowlisted coarse category, never a raw URL", async () => {
  const response = await POST(new NextRequest(endpoint, {
    method: "POST",
    headers: { origin: "https://www.chatgenius.pro", "content-type": "application/json" },
    body: JSON.stringify({
      eventType: "demo",
      target: "https://example.com/?secret=1",
      path: "/demo/",
    }),
  }));
  assert.equal(response.status, 400);
});


test("Doña Anna accepts only coarse approved targets before database access", async () => {
  const invalid = await POST(new NextRequest(endpoint, {
    method: "POST",
    headers: { origin: "https://www.donaanna.com", "content-type": "application/json" },
    body: JSON.stringify({ eventType: "contact", target: "raw_customer_email", path: "/" }),
  }));
  assert.equal(invalid.status, 400);

  const noDatabase = await POST(new NextRequest(endpoint, {
    method: "POST",
    headers: { origin: "https://www.donaanna.com", "content-type": "application/json" },
    body: JSON.stringify({ eventType: "contact", target: "tasting_interest", path: "/" }),
  }));
  assert.ok([204,503].includes(noDatabase.status));
});
