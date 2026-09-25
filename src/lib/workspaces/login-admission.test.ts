import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { setPlatformSupabaseFactoryForTests } from "@/lib/platform/supabase";
import { admitWorkspaceMemberLogin } from "./login-admission";

const userId = "11111111-1111-4111-8111-111111111111";
const otherUserId = "22222222-2222-4222-8222-222222222222";
let rpcData: unknown = [];
let rpcError: unknown = null;
let calls = 0;
let previousFlag: string | undefined;

test.beforeEach(() => {
  previousFlag = process.env.REALTYFLOW_WORKSPACE_MEMBERS_ENABLED;
  process.env.REALTYFLOW_WORKSPACE_MEMBERS_ENABLED = "true";
  rpcData = [];
  rpcError = null;
  calls = 0;
  setPlatformSupabaseFactoryForTests(() => ({
    rpc: async (name: string, args?: Record<string, unknown>) => {
      calls += 1;
      assert.equal(name, "workspace_user_brand_grants");
      assert.equal(args?.p_email, "staff@example.test");
      return { data: rpcData, error: rpcError };
    },
  } as unknown as SupabaseClient));
});

test.afterEach(() => {
  setPlatformSupabaseFactoryForTests(null);
  if (previousFlag === undefined) delete process.env.REALTYFLOW_WORKSPACE_MEMBERS_ENABLED;
  else process.env.REALTYFLOW_WORKSPACE_MEMBERS_ENABLED = previousFlag;
});

test("feature flag blocks member login before database access", async () => {
  process.env.REALTYFLOW_WORKSPACE_MEMBERS_ENABLED = "false";
  const result = await admitWorkspaceMemberLogin("staff@example.test", userId);
  assert.deepEqual(result, { ok: false, reason: "DISABLED" });
  assert.equal(calls, 0);
});

test("active exact membership matching authenticated UUID admits only its brand shell", async () => {
  rpcData = [{
    brand: { id: "brand-id", brand_key: "pinosoecolife", display_name: "Pinoso EcoLife" },
    grant: {
      brand_id: "brand-id", user_id: userId, email: "staff@example.test",
      status: "active", permissions: ["crm.read", "properties.catalog.read"],
    },
  }, {
    brand: { id: "zen-id", brand_key: "zeneco", display_name: "Zen Eco Homes" },
    grant: {
      brand_id: "zen-id", user_id: userId, email: "staff@example.test",
      status: "active", permissions: ["crm.joint.read"],
    },
  }];
  const result = await admitWorkspaceMemberLogin("Staff@Example.Test", userId);
  assert.deepEqual(result, { ok: true, activeBrands: ["pinosoecolife", "zeneco"] });
  assert.equal(calls, 1);
});

test("profile-only account with no active brand membership cannot log into workspace", async () => {
  rpcData = [];
  const result = await admitWorkspaceMemberLogin("staff@example.test", userId);
  assert.deepEqual(result, { ok: false, reason: "NO_ACTIVE_GRANT" });
});

test("stale grant for another Supabase Auth user fails closed even if email matches", async () => {
  rpcData = [{
    brand: { id: "brand-id", brand_key: "pinosoecolife" },
    grant: {
      brand_id: "brand-id", user_id: otherUserId, email: "staff@example.test",
      status: "active", permissions: ["crm.read"],
    },
  }];
  const result = await admitWorkspaceMemberLogin("staff@example.test", userId);
  assert.deepEqual(result, { ok: false, reason: "IDENTITY_MISMATCH" });
});

test("malformed, inactive, unknown-brand and RPC-error grants fail closed", async () => {
  for (const value of [
    [{ brand: { brand_key: "not-a-brand" }, grant: {
      user_id: userId, email: "staff@example.test", status: "active", permissions: ["crm.read"],
    } }],
    [{ brand: { brand_key: "pinosoecolife" }, grant: {
      user_id: userId, email: "staff@example.test", status: "revoked", permissions: ["crm.read"],
    } }],
    [{ brand: { id: "brand-id", brand_key: "pinosoecolife" }, grant: {
      brand_id: "brand-id", user_id: userId, email: "wrong@example.test",
      status: "active", permissions: ["crm.read"],
    } }],
    [{ brand: { id: "brand-id", brand_key: "pinosoecolife" }, grant: {
      brand_id: "another-brand-id", user_id: userId, email: "staff@example.test",
      status: "active", permissions: ["crm.read"],
    } }],
    [{ brand: { id: "brand-id", brand_key: "pinosoecolife" }, grant: {
      brand_id: "brand-id", user_id: userId, email: "staff@example.test",
      status: "active", permissions: [],
    } }],
    [{ brand: { id: "brand-id", brand_key: "pinosoecolife" }, grant: {
      brand_id: "brand-id", user_id: userId, email: "staff@example.test",
      status: "active", permissions: ["crm.read", "crm.read"],
    } }],
    [{ brand: { id: "brand-id", brand_key: "pinosoecolife" }, grant: {
      brand_id: "brand-id", user_id: userId, email: "staff@example.test",
      status: "active", permissions: ["finance.read"],
    } }],
  ]) {
    rpcData = value;
    const result = await admitWorkspaceMemberLogin("staff@example.test", userId);
    assert.equal(result.ok, false);
  }
  rpcError = { code: "PGRST202", message: "missing RPC" };
  rpcData = null;
  assert.deepEqual(await admitWorkspaceMemberLogin("staff@example.test", userId),
    { ok: false, reason: "UNAVAILABLE" });
});

test("invalid authenticated UUID is rejected before privileged RPC", async () => {
  const result = await admitWorkspaceMemberLogin("staff@example.test", "not-a-uuid");
  assert.deepEqual(result, { ok: false, reason: "IDENTITY_MISMATCH" });
  assert.equal(calls, 0);
});
