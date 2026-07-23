import assert from "node:assert/strict";
import test from "node:test";
import { provisionDemoSiteOnHostinger } from "@/lib/demosites-hostinger";

const baseOrder = {
  id: "order-1",
  company_name: "Demo AS",
  customer_email: "kunde@example.com",
  template_slug: "dekk",
  target_subdomain: "demo.example.com",
  preview_url: "https://realtyflow.test/demosites/preview/token",
  editable_fields: {
    hero_title: "Demo AS - få tilbud",
    services: ["Dekkskift", "Hjulhotell", "EU-kontroll"],
    brand_color: "#0ea5e9",
  },
};

test("Hostinger provisioning is skipped safely without API token", async () => {
  let called = false;
  const result = await provisionDemoSiteOnHostinger(baseOrder, {}, (async () => {
    called = true;
    return new Response("{}");
  }) as typeof fetch);

  assert.equal(result.status, "skipped");
  assert.equal(result.provider, "hostinger");
  assert.equal(called, false);
});

test("Hostinger Agency provisioning posts a node-static setup request", async () => {
  const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
  const result = await provisionDemoSiteOnHostinger(
    baseOrder,
    {
      HOSTINGER_API_TOKEN: "hostinger-token",
      HOSTINGER_PROVISIONING_MODE: "agency",
      HOSTINGER_AGENCY_ORDER_ID: "123456",
      HOSTINGER_DATACENTER_CODE: "eu",
    },
    (async (url, init) => {
      calls.push({ url: String(url), body: JSON.parse(String(init?.body || "{}")) });
      return new Response(JSON.stringify({ setup_uuid: "setup-123" }), { status: 200 });
    }) as typeof fetch,
  );

  assert.equal(result.status, "queued");
  assert.equal(result.external_id, "setup-123");
  assert.equal(calls[0].url, "https://developers.hostinger.com/api/agency-hosting/v1/orders/123456/websites/setups");
  assert.equal(calls[0].body.type, "node-static");
  assert.equal((calls[0].body.settings as any).php.version, "8.3");
});

test("Hostinger Horizons provisioning returns the created website URL", async () => {
  const result = await provisionDemoSiteOnHostinger(
    baseOrder,
    {
      HOSTINGER_API_TOKEN: "hostinger-token",
      HOSTINGER_PROVISIONING_MODE: "horizons",
    },
    (async () => new Response(JSON.stringify({ website_url: "https://demo.hostinger.app", website_id: "site-1" }), { status: 200 })) as typeof fetch,
  );

  assert.equal(result.status, "created");
  assert.equal(result.production_url, "https://demo.hostinger.app");
  assert.equal(result.external_id, "site-1");
});
