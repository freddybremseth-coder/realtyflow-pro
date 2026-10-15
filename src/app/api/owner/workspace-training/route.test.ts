import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";
import { createAdminSession } from "@/lib/admin-auth";
import { setPlatformSupabaseFactoryForTests } from "@/lib/platform/supabase";
import { editableTrainingContent, trainingBaseForBrand } from "@/lib/workspaces/training-overrides";
import { GET, POST } from "./route";

const calls: string[] = [];
function fakeDb() {
  return {
    from(table: string) {
      calls.push("table:" + table);
      assert.equal(table, "workspace_training_overrides");
      const builder: any = {
        select: () => builder,
        eq: (name: string, value: string) => {
          calls.push("filter:" + name + "=" + value);
          return builder;
        },
        delete: () => { calls.push("delete"); return builder; },
        upsert: (value: any) => {
          calls.push("upsert:" + value.brand_key + ":" + value.article_id);
          return Promise.resolve({ data: null, error: null });
        },
        then: (resolve: any) => resolve({ data: [], error: null }),
      };
      return builder;
    },
    rpc: async (name: string) => {
      calls.push("rpc:" + name);
      return { data: { users: [] }, error: null };
    },
  } as unknown as SupabaseClient;
}
const request = (method: "GET" | "POST", cookie?: string, body?: unknown) =>
  new NextRequest("https://realtyflow.test/api/owner/workspace-training?brandKey=zeneco", {
    method,
    headers: {
      ...(cookie ? { cookie } : {}),
      ...(body ? { "content-type": "application/json", origin: "https://realtyflow.test" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

test.beforeEach(() => {
  calls.length = 0;
  process.env.REALTYFLOW_SESSION_SECRET = "owner-training-test-secret";
  process.env.REALTYFLOW_ADMIN_EMAILS = "owner@example.test";
  setPlatformSupabaseFactoryForTests(() => fakeDb());
});
test.afterEach(() => setPlatformSupabaseFactoryForTests(null));

test("training owner endpoint denies unauthenticated reads and writes before DB access", async () => {
  const response = await GET(request("GET") as any);
  assert.equal(response.status, 401);
  const write = await POST(request("POST", undefined, { action: "reset", brandKey: "zeneco", articleId: "how-we-work" }) as any);
  assert.equal(write.status, 401);
  assert.deepEqual(calls, []);
});

test("owner sees available original guides without mutating content", async () => {
  const cookie = "realtyflow_admin=" + await createAdminSession("owner@example.test");
  const response = await GET(request("GET", cookie) as any);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.brandKey, "zeneco");
  assert.ok(body.articles.some((article: any) => article.id === "how-we-work"));
  assert.equal(calls.includes("delete"), false);
  assert.equal(calls.some(value => value.startsWith("upsert:")), false);
});

test("owner can save and reset a specific brand training article; rejects other brands", async () => {
  const cookie = "realtyflow_admin=" + await createAdminSession("owner@example.test");
  const article = trainingBaseForBrand("zeneco").find(article => article.id === "how-we-work");
  assert.ok(article);
  const content = { ...editableTrainingContent(article), title: "New approved explanation" };
  let response = await POST(request("POST", cookie,
    { action: "save", brandKey: "zeneco", articleId: article.id, content }) as any);
  assert.equal(response.status, 200);
  assert.ok(calls.includes("upsert:zeneco:how-we-work"));

  response = await POST(request("POST", cookie,
    { action: "save", brandKey: "soleada", articleId: article.id, content }) as any);
  assert.equal(response.status, 400);
  assert.equal(calls.filter(value => value.startsWith("upsert:")).length, 1);

  response = await POST(request("POST", cookie,
    { action: "reset", brandKey: "zeneco", articleId: article.id }) as any);
  assert.equal(response.status, 200);
  assert.ok(calls.includes("delete"));
  assert.ok(calls.includes("filter:article_id=how-we-work"));
});

test("malformed training cannot overwrite the packaged original", async () => {
  const cookie = "realtyflow_admin=" + await createAdminSession("owner@example.test");
  const response = await POST(request("POST", cookie, {
    action: "save", brandKey: "zeneco", articleId: "how-we-work",
    content: { title: "", shortTitle: "", summary: "", sections: [] },
  }) as any);
  assert.equal(response.status, 400);
  assert.deepEqual(calls, []);
});
