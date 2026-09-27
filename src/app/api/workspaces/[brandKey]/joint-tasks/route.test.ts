import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";
import { createAdminSession } from "@/lib/admin-auth";
import { setPlatformSupabaseFactoryForTests } from "@/lib/platform/supabase";
import { GET, POST, PATCH } from "./route";

const endpoint = "https://realtyflow.test/api/workspaces/zeneco/joint-tasks";
const staffId = "11111111-1111-4111-8111-111111111111";
const brandId = "22222222-2222-4222-8222-222222222222";
const contactId = "33333333-3333-4333-8333-333333333333";
const otherContactId = "44444444-4444-4444-8444-444444444444";
const taskId = "55555555-5555-4555-8555-555555555555";
const stamp = "2026-09-24T12:00:00Z";
const calls: Array<{ method: string; args: Record<string, unknown> | undefined }> = [];
let permissions: string[] = ["crm.joint.read", "tasks.joint.read", "tasks.joint.write"];
let tasks: Array<Record<string, unknown>> = [];
let writeResult: Record<string, unknown> | null = null;
let restore: () => void = () => undefined;
const req = (path: string, cookie?: string, method = "GET", body?: unknown) =>
  new NextRequest(endpoint + path, { method,
    headers: { ...(cookie ? { cookie } : {}), ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
const memberCookie = () => createAdminSession("staff@example.test", "WORKSPACE_MEMBER")
  .then(token => "realtyflow_admin=" + token);

test.beforeEach(() => {
  const old = {
    secret: process.env.REALTYFLOW_SESSION_SECRET,
    admin: process.env.REALTYFLOW_ADMIN_EMAILS,
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    key: process.env.SUPABASE_SERVICE_ROLE_KEY,
    flag: process.env.REALTYFLOW_WORKSPACE_MEMBERS_ENABLED,
    fetch: globalThis.fetch,
  };
  process.env.REALTYFLOW_SESSION_SECRET = "joint-task-route-tests";
  process.env.REALTYFLOW_ADMIN_EMAILS = "owner@example.test";
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://workspace-test.supabase.test";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "workspace-test-service-key";
  process.env.REALTYFLOW_WORKSPACE_MEMBERS_ENABLED = "true";
  calls.length = 0;
  permissions = ["crm.joint.read", "tasks.joint.read", "tasks.joint.write"];
  tasks = [{ id: taskId, contact_id: contactId, title: "New joint action", status: "open",
    due_on: null, created_at: stamp, updated_at: stamp, created_by_email: "staff@example.test" },
  { id: otherContactId, contact_id: otherContactId, title: "Mismatched customer", status: "open",
    due_on: null, created_at: stamp }];
  writeResult = null;
  setPlatformSupabaseFactoryForTests(() => ({
    rpc: async (method: string, args?: Record<string, unknown>) => {
      calls.push({ method, args });
      if (method === "workspace_brand_grant") return { data: {
        brand: { id: brandId, brand_key: "zeneco" },
        grant: { brand_id: brandId, user_id: staffId, email: "staff@example.test",
          status: "active", permissions },
      }, error: null };
      if (method === "workspace_zeneco_joint_tasks") return {
        data: { tasks, hasMore: false }, error: null,
      };
      if (method === "workspace_zeneco_joint_task_create" ||
          method === "workspace_zeneco_joint_task_complete") return { data: writeResult, error: null };
      throw new Error("Unexpected privileged RPC: " + method);
    },
    auth: { admin: { getUserById: async (id: string) => ({ data: {
      user: { id, email: "staff@example.test" },
    }, error: null }) } },
  } as unknown as SupabaseClient));
  globalThis.fetch = (async (url: RequestInfo | URL) => {
    if (!String(url).includes("/rest/v1/brand_settings")) throw Error("Unexpected external request");
    return new Response(JSON.stringify({
      settings: { profiles: [{ email: "staff@example.test", role: "WORKSPACE_MEMBER", active: true }] },
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;
  restore = () => {
    globalThis.fetch = old.fetch;
    setPlatformSupabaseFactoryForTests(null);
    for (const [key, value] of [
      ["REALTYFLOW_SESSION_SECRET", old.secret], ["REALTYFLOW_ADMIN_EMAILS", old.admin],
      ["NEXT_PUBLIC_SUPABASE_URL", old.url], ["SUPABASE_SERVICE_ROLE_KEY", old.key],
      ["REALTYFLOW_WORKSPACE_MEMBERS_ENABLED", old.flag],
    ] as const) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  };
});
test.afterEach(() => restore());

test("Zen task reads require a signed, independently verified member and project-specific permission", async () => {
  assert.equal((await GET(req("?contactId=" + contactId), { params: { brandKey: "zeneco" } })).status, 401);
  assert.equal((await GET(req("?contactId=" + contactId), { params: { brandKey: "pinosoecolife" } })).status, 404);
  assert.deepEqual(calls, []);
  const cookie = await memberCookie();
  permissions = ["crm.joint.read"];
  assert.equal((await GET(req("?contactId=" + contactId, cookie), { params: { brandKey: "zeneco" } })).status, 403);
  assert.ok(!calls.some(call => call.method === "workspace_zeneco_joint_tasks"));
  permissions = ["crm.joint.read", "tasks.joint.read"];
  const response = await GET(req("?contactId=" + contactId, cookie), { params: { brandKey: "zeneco" } });
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.deepEqual(result.tasks.map((task: { id: string }) => task.id), [taskId]);
  assert.equal(JSON.stringify(result).includes("Mismatched customer"), false);
  assert.equal(calls.find(call => call.method === "workspace_zeneco_joint_tasks")?.args?.p_contact_id, contactId);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
});

test("new joint task creation and completion are independent of general CRM write rights", async () => {
  const cookie = await memberCookie();
  permissions = ["crm.joint.read", "tasks.joint.read"];
  const createBody = { contactId, title: "Arrange first viewing", dueOn: "2026-09-30" };
  const onlyRead = await POST(req("", cookie, "POST", createBody), { params: { brandKey: "zeneco" } });
  assert.equal(onlyRead.status, 403);
  assert.equal(calls.some(call => call.method === "workspace_zeneco_joint_task_create"), false);
  permissions.push("tasks.joint.write");
  writeResult = { id: taskId, contact_id: contactId, title: createBody.title, status: "open",
    due_on: createBody.dueOn, created_at: stamp, created_by_email: "staff@example.test" };
  const created = await POST(req("", cookie, "POST", createBody), { params: { brandKey: "zeneco" } });
  assert.equal(created.status, 201);
  assert.equal((await created.json()).task.title, createBody.title);
  assert.equal(calls.find(call => call.method === "workspace_zeneco_joint_task_create")?.args?.p_contact_id, contactId);
  assert.equal((await POST(req("", cookie, "POST", { ...createBody, brand: "soleada" }),
    { params: { brandKey: "zeneco" } })).status, 400);
  assert.equal((await POST(req("", cookie, "POST", { ...createBody, title: "a\nprivate note" }),
    { params: { brandKey: "zeneco" } })).status, 400);
  assert.equal((await POST(req("", cookie, "POST", { ...createBody, dueOn: "2026-02-30" }),
    { params: { brandKey: "zeneco" } })).status, 400);
  assert.equal((await PATCH(req("", cookie, "PATCH", { contactId, taskId, status: "reopen" }),
    { params: { brandKey: "zeneco" } })).status, 400);
  writeResult = { ...writeResult, status: "done", finished_at: stamp, finished_by_email: "staff@example.test" };
  const finished = await PATCH(req("", cookie, "PATCH", { contactId, taskId, status: "done" }),
    { params: { brandKey: "zeneco" } });
  assert.equal(finished.status, 200);
  assert.equal((await finished.json()).task.status, "done");
  assert.equal(calls.find(call => call.method === "workspace_zeneco_joint_task_complete")?.args?.p_task_id, taskId);
  writeResult = null;
  assert.equal((await PATCH(req("", cookie, "PATCH", { contactId, taskId, status: "done" }),
    { params: { brandKey: "zeneco" } })).status, 404);
});
