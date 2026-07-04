import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import { setSaasSupabaseFactoryForTests } from "@/lib/saas-api-supabase";
import { DELETE as DELETESaas, GET as GETSaas, POST as POSTSaas } from "./route";
import { GET as GETBuild, POST as POSTBuild } from "./build/route";
import { GET as GETBuildTasks, PATCH as PATCHBuildTasks } from "./build-tasks/route";
import { GET as GETOpportunities, PATCH as PATCHOpportunities, POST as POSTOpportunities } from "./opportunities/route";

function jsonRequest(path: string, method: string, body?: Record<string, unknown>) {
  return new NextRequest(`https://realtyflow.test${path}`, {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
}

test.beforeEach(() => {
  process.env.REALTYFLOW_SESSION_SECRET = "saas-internal-routes-test-secret";
  process.env.REALTYFLOW_ADMIN_EMAILS = "freddy.bremseth@gmail.com";
  setSaasSupabaseFactoryForTests(null);
});

test.afterEach(() => {
  setSaasSupabaseFactoryForTests(null);
});

test("SaaS internal routes require admin before service-role database access", async () => {
  let called = false;
  setSaasSupabaseFactoryForTests(() => {
    called = true;
    return null;
  });

  const responses = await Promise.all([
    GETSaas(jsonRequest("/api/saas", "GET") as any),
    POSTSaas(jsonRequest("/api/saas", "POST", { slug: "demo", name: "Demo" }) as any),
    DELETESaas(jsonRequest("/api/saas", "DELETE", { id: "app-1" }) as any),
    GETBuild(jsonRequest("/api/saas/build", "GET") as any),
    POSTBuild(jsonRequest("/api/saas/build", "POST", { slug: "demo", title: "Demo" }) as any),
    GETBuildTasks(jsonRequest("/api/saas/build-tasks", "GET") as any),
    PATCHBuildTasks(jsonRequest("/api/saas/build-tasks", "PATCH", { id: "task-1", status: "building" }) as any),
    GETOpportunities(jsonRequest("/api/saas/opportunities", "GET") as any),
    POSTOpportunities(jsonRequest("/api/saas/opportunities", "POST", { action: "discover" }) as any),
    PATCHOpportunities(jsonRequest("/api/saas/opportunities", "PATCH", { id: "opp-1", status: "approved" }) as any),
  ]);

  for (const response of responses) {
    const body = await response.json();
    assert.equal(response.status, 401);
    assert.equal(body.error, "Admin session required");
  }
  assert.equal(called, false);
});
