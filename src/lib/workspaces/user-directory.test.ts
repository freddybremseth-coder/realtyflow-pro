import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { setPlatformSupabaseFactoryForTests } from "@/lib/platform/supabase";
import { resolveWorkspaceLogin, verifyWorkspaceDirectorySession } from "./user-directory";

const userId = "11111111-1111-4111-8111-111111111111";
let directory: unknown;
let authEmail = "staff@example.test";
let rpcError: any = null;

test.beforeEach(() => {
  directory = {
    user_id: userId, username: "staff", email: "staff@example.test",
    display_name: "Staff User", status: "active",
  };
  authEmail = "staff@example.test";
  rpcError = null;
  setPlatformSupabaseFactoryForTests(() => ({
    rpc: async (name: string, args?: Record<string, unknown>) => {
      assert.equal(name, "workspace_login_directory");
      assert.ok(["staff", "staff@example.test"].includes(String(args?.p_login)));
      return { data: directory, error: rpcError };
    },
    auth: { admin: { getUserById: async (id: string) => ({
      data: { user: { id, email: authEmail } }, error: null,
    }) } },
  } as unknown as SupabaseClient));
});

test.afterEach(() => setPlatformSupabaseFactoryForTests(null));

test("custom username resolves to canonical Auth email without password handling", async () => {
  const result = await resolveWorkspaceLogin(" Staff ");
  assert.equal(result.error, null);
  assert.deepEqual(result.user, {
    userId, username: "staff", email: "staff@example.test",
    displayName: "Staff User", status: "active",
  });
});

test("directory session revalidation requires active directory plus matching Auth identity", async () => {
  assert.equal((await verifyWorkspaceDirectorySession("staff@example.test")).user?.userId, userId);
  authEmail = "other@example.test";
  assert.equal((await verifyWorkspaceDirectorySession("staff@example.test")).user, null);
  authEmail = "staff@example.test";
  directory = { ...(directory as any), status: "disabled" };
  assert.equal((await verifyWorkspaceDirectorySession("staff@example.test")).user, null);
});

test("malformed directory and RPC errors fail closed", async () => {
  directory = { user_id: "bad", username: "staff", email: "staff@example.test",
    display_name: "Staff", status: "active" };
  assert.ok((await resolveWorkspaceLogin("staff")).error);
  rpcError = { message: "unavailable" };
  assert.equal((await resolveWorkspaceLogin("staff")).user, null);
});
