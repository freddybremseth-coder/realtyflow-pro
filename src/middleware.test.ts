import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import { middleware } from "./middleware";
import { createAdminSession } from "@/lib/admin-auth";

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

test("middleware passes allowlisted Nexus scheduler jobs to route-level token verification", async () => {
  for (const path of [
    "/api/cron/social-inbox-sync",
    "/api/cron/engagement-tracker",
    "/api/cron/marketing-growth-metrics",
    "/api/cron/art-lounge-reel-create",
    "/api/cron/art-lounge-reel-publish",
  ]) {
    const response = await middleware(
      request(path, { "x-nexus-scheduler": "opaque-scheduler-token" }),
    );
    assert.equal(response.status, 200, path);
    assert.equal(response.headers.get("x-middleware-next"), "1", path);
    assert.equal(response.headers.get("location"), null, path);
  }
});

test("middleware does not make Nexus social sync public without scheduler credentials", async () => {
  const response = await middleware(request("/api/cron/social-inbox-sync"));

  assert.equal(response.status, 307);
  assert.equal(
    response.headers.get("location"),
    "https://realtyflow.test/login?next=%2Fapi%2Fcron%2Fsocial-inbox-sync",
  );
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

test("middleware passes Stripe webhooks to route-level signature verification", async () => {
  const response = await middleware(request("/api/saas/stripe"));

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-middleware-next"), "1");
  assert.equal(response.headers.get("location"), null);
});

test("middleware admits Re-Master Reels proxy only with its shared credential", async () => {
  const previous = process.env.REALTYFLOW_MIGRATION_SECRET;
  process.env.REALTYFLOW_MIGRATION_SECRET = "reels-proxy-test-secret";
  try {
    for (const method of ["GET", "POST"]) {
      const accepted = await middleware(new NextRequest(
        "https://realtyflow.test/api/neural-beat/reels",
        {
          method,
          headers: {
            "x-remaster-migration-secret": "reels-proxy-test-secret",
            "x-remaster-admin": "freddy.bremseth@gmail.com",
          },
        },
      ));
      assert.equal(accepted.status, 200, method);
      assert.equal(accepted.headers.get("x-middleware-next"), "1", method);
      assert.equal(accepted.headers.get("location"), null, method);
    }

    for (const credential of [undefined, "incorrect-reels-proxy-secret"]) {
      const denied = await middleware(request("/api/neural-beat/reels", credential
        ? { "x-remaster-migration-secret": credential }
        : undefined));
      assert.equal(denied.status, 307);
      assert.equal(
        denied.headers.get("location"),
        "https://realtyflow.test/login?next=%2Fapi%2Fneural-beat%2Freels",
      );
    }
  } finally {
    if (previous === undefined) delete process.env.REALTYFLOW_MIGRATION_SECRET;
    else process.env.REALTYFLOW_MIGRATION_SECRET = previous;
  }
});

test("workspace-only role is disabled by default and does not enter legacy CRM", async () => {
  delete process.env.REALTYFLOW_WORKSPACE_MEMBERS_ENABLED;
  const cookie = `realtyflow_admin=${await createAdminSession("staff@example.test", "WORKSPACE_MEMBER")}`;
  const denied = await middleware(request("/workspace/pinosoecolife", { cookie }));
  assert.equal(denied.status, 307);
  assert.match(denied.headers.get("location") || "", /\/login\?/);
});

test("when explicitly enabled workspace role can enter only narrow shell and scoped reads", async () => {
  process.env.REALTYFLOW_WORKSPACE_MEMBERS_ENABLED = "true";
  try {
    const cookie = `realtyflow_admin=${await createAdminSession("staff@example.test", "WORKSPACE_MEMBER")}`;
    for (const path of [
      "/workspace", "/workspace/pinosoecolife", "/api/workspaces/available",
      "/api/workspaces/pinosoecolife/capabilities",
      "/api/workspaces/pinosoecolife/contacts", "/api/workspaces/pinosoecolife/properties",
    ]) {
      const admitted = await middleware(request(path, { cookie }));
      assert.equal(admitted.status, 200, path);
    }
    for (const path of [
      "/api/contacts", "/api/access-control", "/api/workspaces/access-plans",
      "/api/workspaces/pinosoecolife/contacts/another",
    ]) {
      const denied = await middleware(request(path, { cookie }));
      assert.equal(denied.status, 403, path);
    }
    const deniedWrite = await middleware(new NextRequest(
      "https://realtyflow.test/api/workspaces/pinosoecolife/properties",
      { method: "POST", headers: { cookie } },
    ));
    assert.equal(deniedWrite.status, 403);
  } finally { delete process.env.REALTYFLOW_WORKSPACE_MEMBERS_ENABLED; }
});
