import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { OPTIONS, POST } from "./route";
import { middleware } from "@/middleware";
import { SEO_AUDIT_TARGETS } from "@/services/agents/seo-audit";

const endpoint = "https://realtyflow.test/api/public/search-discovery";

test("all public portfolio origins pass middleware and receive the real CORS preflight", async () => {
  for (const site of SEO_AUDIT_TARGETS) {
    const request = new NextRequest(endpoint, { method: "OPTIONS", headers: {
      origin: site.base, "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "content-type",
    } });
    const admission = await middleware(request);
    assert.equal(admission.headers.get("x-middleware-next"), "1", site.brandId);
    const response = await OPTIONS(request);
    assert.equal(response.status, 204, site.brandId);
    assert.equal(response.headers.get("access-control-allow-origin"), site.base);
    assert.match(response.headers.get("access-control-allow-methods") || "", /POST/);
  }
});

test("missing and untrusted origins remain denied by collector handlers", async () => {
  for (const origin of ["", "https://evil.test", "https://www.zenecohomes.com.evil.test", "https://care.zenecohomes.com"]) {
    const preflight = await OPTIONS(new NextRequest(endpoint, { method: "OPTIONS", headers: { origin } }));
    assert.equal(preflight.status, 403);
    assert.equal(preflight.headers.get("access-control-allow-origin"), null);
    const response = await POST(new NextRequest(endpoint, { method: "POST", headers: { origin } }));
    assert.equal(response.status, 403);
  }
});
