import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import { createAdminSession } from "@/lib/admin-auth";
import { setDemoSitesSupabaseFactoryForTests } from "@/lib/demosites-api-supabase";
import { DELETE, GET, PATCH, POST } from "./route";

async function adminCookie(email = "freddy.bremseth@gmail.com") {
  return `realtyflow_admin=${await createAdminSession(email)}`;
}

function deleteRequest(id?: string, cookie?: string) {
  const url = new URL("https://realtyflow.test/api/saas/demosites");
  if (id !== undefined) url.searchParams.set("id", id);
  return new NextRequest(url, {
    method: "DELETE",
    headers: cookie ? { cookie } : {},
  });
}

function jsonRequest(method: string, body?: Record<string, unknown>, cookie?: string) {
  return new NextRequest("https://realtyflow.test/api/saas/demosites", {
    method,
    headers: {
      ...(body ? { "content-type": "application/json" } : {}),
      ...(cookie ? { cookie } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

function createDeleteSupabaseMock(existingOrder: Record<string, unknown> | null) {
  const calls: Record<string, unknown>[] = [];

  const supabase = {
    calls,
    from(table: string) {
      calls.push({ table, method: "from" });

      if (table === "demo_site_imports") {
        return {
          update(payload: Record<string, unknown>) {
            calls.push({ table, method: "update", payload });
            return {
              eq(column: string, value: string) {
                calls.push({ table, method: "eq", column, value });
                return Promise.resolve({ data: null, error: null });
              },
            };
          },
        };
      }

      const state = { action: "select", selection: "" };
      const builder = {
        select(selection: string) {
          state.selection = selection;
          calls.push({ table, method: "select", selection });
          return builder;
        },
        eq(column: string, value: string) {
          calls.push({ table, method: "eq", column, value, action: state.action });
          return builder;
        },
        maybeSingle() {
          calls.push({ table, method: "maybeSingle" });
          if (table === "saas_apps") return Promise.resolve({ data: { id: "app-1" }, error: null });
          return Promise.resolve({ data: existingOrder, error: null });
        },
        delete() {
          state.action = "delete";
          calls.push({ table, method: "delete" });
          return builder;
        },
        single() {
          calls.push({ table, method: "single", action: state.action });
          return Promise.resolve({ data: { id: existingOrder?.id }, error: null });
        },
        order(column: string, options?: Record<string, unknown>) {
          calls.push({ table, method: "order", column, options });
          return Promise.resolve({ data: [], error: null });
        },
        update(payload: Record<string, unknown>) {
          state.action = "update";
          calls.push({ table, method: "update", payload });
          return builder;
        },
      };

      return builder;
    },
  };

  return supabase;
}

test.beforeEach(() => {
  process.env.REALTYFLOW_SESSION_SECRET = "demosites-route-test-secret";
  process.env.REALTYFLOW_ADMIN_EMAILS = "freddy.bremseth@gmail.com";
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  setDemoSitesSupabaseFactoryForTests(null);
});

test.afterEach(() => {
  setDemoSitesSupabaseFactoryForTests(null);
});

test("DemoSites DELETE requires an admin session before database access", async () => {
  let called = false;
  setDemoSitesSupabaseFactoryForTests(() => {
    called = true;
    return null;
  });

  const response = await DELETE(deleteRequest("order_123") as any);
  const body = await response.json();

  assert.equal(response.status, 401);
  assert.equal(body.error, "Admin session required");
  assert.equal(called, false);
});

test("DemoSites admin collection routes require an admin session before database access", async () => {
  let called = false;
  setDemoSitesSupabaseFactoryForTests(() => {
    called = true;
    return null;
  });

  const responses = await Promise.all([
    GET(jsonRequest("GET") as any),
    POST(jsonRequest("POST", { company_name: "Demo AS", customer_name: "Demo", customer_email: "demo@example.no" }) as any),
    PATCH(jsonRequest("PATCH", { id: "order_123", status: "approved" }) as any),
    DELETE(deleteRequest("order_123") as any),
  ]);

  for (const response of responses) {
    const body = await response.json();
    assert.equal(response.status, 401);
    assert.equal(body.error, "Admin session required");
  }
  assert.equal(called, false);
});

test("DemoSites DELETE validates id before database access", async () => {
  let called = false;
  setDemoSitesSupabaseFactoryForTests(() => {
    called = true;
    return null;
  });

  const missing = await DELETE(deleteRequest(undefined, await adminCookie()) as any);
  const invalid = await DELETE(deleteRequest("not a safe id", await adminCookie()) as any);

  assert.equal(missing.status, 400);
  assert.equal(invalid.status, 400);
  assert.equal(called, false);
});

test("DemoSites DELETE returns not found without deleting", async () => {
  const supabase = createDeleteSupabaseMock(null);
  setDemoSitesSupabaseFactoryForTests(() => supabase);

  const response = await DELETE(deleteRequest("order_404", await adminCookie()) as any);
  const body = await response.json();

  assert.equal(response.status, 404);
  assert.equal(body.error, "DemoSites order not found");
  assert.equal(supabase.calls.some((call) => call.table === "demo_site_orders" && call.method === "delete"), false);
});

test("DemoSites DELETE removes one order and keeps import history rows", async () => {
  const supabase = createDeleteSupabaseMock({
    id: "order_123",
    order_number: "DS-1",
    company_name: "Demo AS",
    status: "in_setup",
  });
  setDemoSitesSupabaseFactoryForTests(() => supabase);

  const response = await DELETE(deleteRequest("order_123", await adminCookie()) as any);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.deleted, true);
  assert.equal(body.order.id, "order_123");
  assert.equal(
    supabase.calls.some((call) => call.table === "demo_site_orders" && call.method === "delete"),
    true,
  );
  assert.equal(
    supabase.calls.some((call) => call.table === "demo_site_imports" && call.method === "eq" && call.column === "created_order_id"),
    true,
  );
  assert.equal(
    supabase.calls.some((call) => call.table === "demo_site_imports" && call.method === "eq" && call.column === "applied_order_id"),
    true,
  );
});
