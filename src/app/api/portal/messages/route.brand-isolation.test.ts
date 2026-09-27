import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import { GET, POST } from "./route";

const api = "https://portal-brand-isolation.test";
const portalEmail = "shared@example.test";
const zenId = "22222222-2222-4222-8222-222222222222";
const otherId = "33333333-3333-4333-8333-333333333333";
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { "Content-Type": "application/json" },
});

test("Zen portal bearer never exposes other-brand messages or links a foreign contact with same email", async () => {
  const previous = {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    key: process.env.SUPABASE_SERVICE_ROLE_KEY,
    fetch: globalThis.fetch,
  };
  process.env.NEXT_PUBLIC_SUPABASE_URL = api;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "portal-test-service-role-not-real";
  const calls: Array<{ pathname: string; url: URL; method: string; body: Record<string, unknown> | null }> = [];
  let candidate: Record<string, unknown> = {
    id: otherId, name: "Unrelated other-brand client",
    email: portalEmail, brand_id: "soleada", brand: "soleada",
  };
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    const method = String(init?.method || (input instanceof Request ? input.method : "GET")).toUpperCase();
    const rawBody = init?.body && typeof init.body === "string" ? init.body :
      input instanceof Request ? await input.clone().text().catch(() => "") : "";
    const body = rawBody ? JSON.parse(rawBody) as Record<string, unknown> : null;
    calls.push({ pathname: url.pathname, url, method, body });
    if (url.pathname === "/auth/v1/user") return json({
      user: { id: "11111111-1111-4111-8111-111111111111", email: portalEmail,
        aud: "authenticated", role: "authenticated" },
    });
    if (url.pathname === "/rest/v1/portal_messages" && method === "GET") return json([
      { id: "zen-message", brand_id: "zeneco", email: portalEmail, body: "Own Zen message" },
      { id: "private-other-brand", brand_id: "soleada", email: portalEmail, body: "PRIVATE OTHER BRAND" },
      { id: "private-other-user", brand_id: "zeneco", email: "different@example.test", body: "PRIVATE OTHER EMAIL" },
    ]);
    if (url.pathname === "/rest/v1/contacts" && method === "GET") return json([candidate]);
    if (url.pathname === "/rest/v1/portal_messages" && method === "POST") {
      return json({ id: "44444444-4444-4444-8444-444444444444",
        ...body, created_at: "2026-09-24T12:00:00Z" }, 201);
    }
    if (url.pathname === "/rest/v1/revenue_events") {
      return json({ code: "PGRST205", message: "Could not find table revenue_events in schema cache" }, 404);
    }
    if (url.pathname === "/rest/v1/work_items") return json([{
      id: "55555555-5555-4555-8555-555555555555", ...body,
    }], 201);
    throw Error("Unexpected test-only Supabase call: " + url.pathname);
  }) as typeof fetch;
  try {
    const headers = { Authorization: "Bearer portal-customer-token" };
    const getResponse = await GET(new NextRequest(api + "/api/portal/messages", { headers }));
    assert.equal(getResponse.status, 200);
    const getBody = await getResponse.json();
    assert.deepEqual(getBody.messages.map((message: { id: string }) => message.id), ["zen-message"]);
    assert.ok(calls.some(call => call.pathname === "/rest/v1/portal_messages" &&
      call.url.searchParams.get("brand_id") === "eq.zeneco" &&
      call.url.searchParams.get("email") === "eq." + portalEmail));

    const post = () => POST(new NextRequest(api + "/api/portal/messages", {
      method: "POST", headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ body: "New customer-originated message" }),
    }));
    const foreign = await post();
    assert.equal(foreign.status, 201);
    assert.equal((await foreign.json()).message.contact_id, null);
    assert.equal(calls.filter(call => call.pathname === "/rest/v1/work_items").length, 0,
      "No work item may be linked to the other brand contact");
    assert.ok(calls.some(call => call.pathname === "/rest/v1/contacts" &&
      call.url.searchParams.get("brand_id") === "eq.zeneco" &&
      call.url.searchParams.get("brand") === "eq.zeneco" &&
      call.url.searchParams.get("email") === "eq." + portalEmail));

    candidate = { id: zenId, name: "Exact Zen customer", email: portalEmail,
      brand_id: "zeneco", brand: "zeneco" };
    const zenPost = await post();
    assert.equal(zenPost.status, 201);
    assert.equal((await zenPost.json()).message.contact_id, zenId);
    assert.equal(calls.filter(call => call.pathname === "/rest/v1/work_items").length, 1);
    assert.equal(calls.findLast(call => call.pathname === "/rest/v1/work_items")?.body?.brand_id, "zeneco");
  } finally {
    globalThis.fetch = previous.fetch;
    if (previous.url === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = previous.url;
    if (previous.key === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = previous.key;
  }
});
