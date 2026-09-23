import test from "node:test";
import assert from "node:assert/strict";
import { checkReferralCollectorPreflight } from "./seo-referral-health";
import { SEO_AUDIT_TARGETS } from "./seo-audit";

test("preflight checks every approved public host without sending a visit or lead", async () => {
  const observed: string[] = [];
  const fetcher = (async (url: string | URL | Request, init?: RequestInit) => {
    assert.equal(String(url), "https://realtyflow.chatgenius.pro/api/public/search-discovery");
    assert.equal(init?.method, "OPTIONS");
    assert.equal(init?.cache, "no-store");
    assert.equal(init?.redirect, "manual");
    const headers = new Headers(init?.headers);
    assert.equal(headers.get("access-control-request-method"), "POST");
    assert.equal(headers.get("access-control-request-headers"), "content-type");
    const origin = headers.get("origin")!;
    observed.push(origin);
    return new Response(null, { status: 204, headers: {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    } });
  }) as typeof fetch;
  const checks = await checkReferralCollectorPreflight(fetcher);
  assert.equal(checks.length, SEO_AUDIT_TARGETS.length);
  assert.deepEqual(new Set(observed), new Set(SEO_AUDIT_TARGETS.map(target => new URL(target.base).origin)));
  assert.ok(checks.every(check => check.status === "pass"));
  assert.equal(new Set(checks.map(check => check.brandId)).size, 8);
});

test("a wildcard or missing POST admission is blocked, a network error stays unknown", async () => {
  const wildcard = await checkReferralCollectorPreflight((async () =>
    new Response(null, { status: 204, headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    } })) as typeof fetch);
  assert.ok(wildcard.every(check => check.status === "blocked"));
  const network = await checkReferralCollectorPreflight((async () => {
    throw new Error("network unavailable");
  }) as typeof fetch);
  assert.ok(network.every(check => check.status === "unknown"));
});
