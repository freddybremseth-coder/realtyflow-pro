import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import { middleware } from "./middleware";

function request(path: string, headers?: Record<string, string>) {
  return new NextRequest(`https://realtyflow.test${path}`, { headers });
}

test.beforeEach(() => {
  process.env.CRON_SECRET = "cron-secret";
  process.env.REALTYFLOW_SESSION_SECRET = "middleware-test-secret";
  process.env.REALTYFLOW_ADMIN_EMAILS = "freddy.bremseth@gmail.com";
});

test.afterEach(() => {
  delete process.env.CRON_SECRET;
});

test("middleware lets cron requests with supported credentials reach route handlers", async () => {
  const responses = await Promise.all([
    middleware(request("/api/cron/lead-nurture?dry=1", { authorization: "Bearer cron-secret" })),
    middleware(request("/api/cron/lead-nurture?dry=1", { "x-cron-secret": "cron-secret" })),
    middleware(request("/api/cron/lead-nurture?dry=1&key=cron-secret")),
  ]);

  for (const response of responses) {
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("x-middleware-next"), "1");
    assert.equal(response.headers.get("location"), null);
  }
});

test("middleware redirects cron requests without valid cron credentials", async () => {
  const response = await middleware(
    request("/api/cron/lead-nurture?dry=1", { "x-admin-authenticated": "true" }),
  );

  assert.equal(response.status, 307);
  assert.equal(
    response.headers.get("location"),
    "https://realtyflow.test/login?next=%2Fapi%2Fcron%2Flead-nurture%3Fdry%3D1",
  );
});

test("middleware passes Doña Anna integrations to route-level Bearer authentication", async () => {
  const response = await middleware(request("/api/dona-anna/integrations/olivia"));

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-middleware-next"), "1");
  assert.equal(response.headers.get("location"), null);
});
