import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import { createAdminSession } from "@/lib/admin-auth";
import { DELETE, GET, PATCH, POST } from "./route";
import { setContactsSupabaseFactoryForTests } from "./supabase-client";

async function adminCookie(email = "freddy.bremseth@gmail.com") {
  return `realtyflow_admin=${await createAdminSession(email)}`;
}

function request(method: string, path = "/api/contacts", body?: unknown, headers: Record<string, string> = {}) {
  return new NextRequest(`https://realtyflow.test${path}`, {
    method,
    headers: {
      ...(body === undefined ? {} : { "content-type": "application/json" }),
      ...headers,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

function supabaseMock(result: { data?: unknown; error?: unknown } = { data: [], error: null }) {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  const singleResult = {
    data: {
      id: "contact-1",
      name: "Test Contact",
      pipeline_status: "NEW",
      updated_at: "2026-06-24T00:00:00.000Z",
    },
    error: null,
  };

  const builder: any = {
    select(...args: unknown[]) {
      calls.push({ method: "select", args });
      return builder;
    },
    order(...args: unknown[]) {
      calls.push({ method: "order", args });
      return builder;
    },
    in(...args: unknown[]) {
      calls.push({ method: "in", args });
      return builder;
    },
    upsert(...args: unknown[]) {
      calls.push({ method: "upsert", args });
      return builder;
    },
    update(...args: unknown[]) {
      calls.push({ method: "update", args });
      return builder;
    },
    delete(...args: unknown[]) {
      calls.push({ method: "delete", args });
      return builder;
    },
    eq(...args: unknown[]) {
      calls.push({ method: "eq", args });
      return builder;
    },
    single() {
      calls.push({ method: "single", args: [] });
      return Promise.resolve(singleResult);
    },
    then(resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) {
      return Promise.resolve(result).then(resolve, reject);
    },
  };

  return {
    calls,
    client: {
      from(table: string) {
        calls.push({ method: "from", args: [table] });
        return builder;
      },
    },
  };
}

test.beforeEach(() => {
  process.env.REALTYFLOW_SESSION_SECRET = "contacts-route-test-secret";
  process.env.REALTYFLOW_ADMIN_EMAILS = "freddy.bremseth@gmail.com";
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  setContactsSupabaseFactoryForTests(null);
});

test.afterEach(() => {
  setContactsSupabaseFactoryForTests(null);
});

test("contacts route rejects unauthenticated requests before database access", async () => {
  const mock = supabaseMock();
  setContactsSupabaseFactoryForTests(() => mock.client);

  const responses = await Promise.all([
    GET(request("GET", "/api/contacts?view=pipeline") as any),
    POST(request("POST", "/api/contacts", { name: "New" }) as any),
    PATCH(request("PATCH", "/api/contacts", { id: "contact-1", name: "Updated" }) as any),
    DELETE(request("DELETE", "/api/contacts", { id: "contact-1" }) as any),
  ]);

  for (const response of responses) {
    const body = await response.json();
    assert.equal(response.status, 401);
    assert.equal(body.error.code, "AUTH_REQUIRED");
  }

  assert.equal(mock.calls.length, 0);
});

test("contacts route rejects non-admin session before database access", async () => {
  const mock = supabaseMock();
  setContactsSupabaseFactoryForTests(() => mock.client);

  const response = await GET(
    request("GET", "/api/contacts?view=crm", undefined, { cookie: await adminCookie("agent@example.com") }) as any,
  );
  const body = await response.json();

  assert.equal(response.status, 401);
  assert.equal(body.error.code, "AUTH_REQUIRED");
  assert.equal(mock.calls.length, 0);
});

test("contacts GET is available only after valid admin auth", async () => {
  const mock = supabaseMock({
    data: [{ id: "contact-1", name: "Pipeline Lead", pipeline_status: "NEW" }],
    error: null,
  });
  setContactsSupabaseFactoryForTests(() => mock.client);

  const response = await GET(
    request("GET", "/api/contacts?view=pipeline", undefined, { cookie: await adminCookie() }) as any,
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.contacts[0].name, "Pipeline Lead");
  assert.deepEqual(mock.calls[0], { method: "from", args: ["contacts"] });
  assert.equal(mock.calls.some((call) => call.method === "in"), true);
});

test("contacts mutations require valid admin auth before using service route", async () => {
  const mock = supabaseMock();
  setContactsSupabaseFactoryForTests(() => mock.client);
  const cookie = await adminCookie();

  const created = await POST(request("POST", "/api/contacts", { name: "New" }, { cookie }) as any);
  const patched = await PATCH(request("PATCH", "/api/contacts", { id: "contact-1", name: "Updated" }, { cookie }) as any);
  const deleted = await DELETE(request("DELETE", "/api/contacts", { id: "contact-1" }, { cookie }) as any);

  assert.equal(created.status, 200);
  assert.equal(patched.status, 200);
  assert.equal(deleted.status, 200);
  assert.equal(mock.calls.some((call) => call.method === "upsert"), true);
  assert.equal(mock.calls.some((call) => call.method === "update"), true);
  assert.equal(mock.calls.some((call) => call.method === "delete"), true);
});

test("contacts route fails closed after auth when database is not configured", async () => {
  const response = await GET(
    request("GET", "/api/contacts?view=pipeline", undefined, { cookie: await adminCookie() }) as any,
  );
  const body = await response.json();

  assert.equal(response.status, 500);
  assert.equal(body.error.code, "DATABASE_NOT_CONFIGURED");
});
