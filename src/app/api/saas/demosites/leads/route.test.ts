import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import { createAdminSession } from "@/lib/admin-auth";
import { setDemoSitesSupabaseFactoryForTests } from "@/lib/demosites-api-supabase";
import { GET, PATCH, POST } from "./route";

async function adminCookie(email = "freddy.bremseth@gmail.com") {
  return `realtyflow_admin=${await createAdminSession(email)}`;
}

function apiRequest(method: string, body?: Record<string, unknown>, cookie?: string) {
  return new NextRequest("https://realtyflow.test/api/saas/demosites/leads", {
    method,
    headers: {
      ...(cookie ? { cookie } : {}),
      ...(body ? { "content-type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

function createPatchSupabaseMock(existingMetadata: Record<string, unknown>) {
  const calls: Record<string, unknown>[] = [];

  const supabase = {
    calls,
    from(table: string) {
      calls.push({ table, method: "from" });
      const state: { action: string; payload: Record<string, unknown> | null } = { action: "select", payload: null };

      const builder = {
        select(selection: string) {
          calls.push({ table, method: "select", selection, action: state.action });
          return builder;
        },
        eq(column: string, value: string) {
          calls.push({ table, method: "eq", column, value, action: state.action });
          return builder;
        },
        maybeSingle() {
          calls.push({ table, method: "maybeSingle" });
          return Promise.resolve({ data: { metadata: existingMetadata }, error: null });
        },
        update(payload: Record<string, unknown>) {
          state.action = "update";
          state.payload = payload;
          calls.push({ table, method: "update", payload });
          return builder;
        },
        insert(payload: Record<string, unknown>) {
          calls.push({ table, method: "insert", payload });
          return Promise.resolve({ data: null, error: null });
        },
        single() {
          calls.push({ table, method: "single", action: state.action });
          return Promise.resolve({
            data: {
              id: "lead-1",
              company_name: "Kontaktet AI AS",
              ...(state.payload || {}),
            },
            error: null,
          });
        },
      };

      return builder;
    },
  };

  return supabase;
}

test.beforeEach(() => {
  process.env.REALTYFLOW_SESSION_SECRET = "demosites-leads-route-test-secret";
  process.env.REALTYFLOW_ADMIN_EMAILS = "freddy.bremseth@gmail.com";
  setDemoSitesSupabaseFactoryForTests(null);
});

test.afterEach(() => {
  setDemoSitesSupabaseFactoryForTests(null);
});

test("DemoSites leads API requires admin session before database access", async () => {
  let called = false;
  setDemoSitesSupabaseFactoryForTests(() => {
    called = true;
    return null;
  });

  const getResponse = await GET(apiRequest("GET") as any);
  const postResponse = await POST(apiRequest("POST", { company_name: "No Auth AS" }) as any);
  const patchResponse = await PATCH(apiRequest("PATCH", { id: "lead-1" }) as any);

  assert.equal(getResponse.status, 401);
  assert.equal(postResponse.status, 401);
  assert.equal(patchResponse.status, 401);
  assert.equal(called, false);
});

test("DemoSites leads PATCH preserves existing metadata namespaces", async () => {
  const supabase = createPatchSupabaseMock({
    crm: { owner: "Freddy" },
    revenue_engine: { note: "Gammel note" },
  });
  setDemoSitesSupabaseFactoryForTests(() => supabase);

  const response = await PATCH(apiRequest(
    "PATCH",
    {
      id: "lead-1",
      lead_status: "contacted",
      outreach_status: "sent",
      metadata: {
        revenue_engine: {
          next_follow_up_at: "2026-07-07",
          note: "Ny oppfølging.",
        },
      },
    },
    await adminCookie(),
  ) as any);
  const body = await response.json();
  const updateCall = supabase.calls.find((call) => call.table === "demo_site_leads" && call.method === "update");
  const metadata = updateCall?.payload && typeof updateCall.payload === "object"
    ? (updateCall.payload as Record<string, unknown>).metadata as Record<string, unknown>
    : {};

  assert.equal(response.status, 200);
  assert.equal(body.lead.id, "lead-1");
  assert.deepEqual(metadata.crm, { owner: "Freddy" });
  assert.deepEqual(metadata.revenue_engine, {
    next_follow_up_at: "2026-07-07",
    note: "Ny oppfølging.",
  });
  assert.equal(
    supabase.calls.some((call) => call.table === "demo_site_lead_events" && call.method === "insert"),
    true,
  );
});
