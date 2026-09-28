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
let runtimeEnabled = true;
let runtimeError: unknown = null;

test.beforeEach(() => {
  rpcData = [];
  rpcError = null;
  calls = 0;
  runtimeEnabled = true;
  runtimeError = null;
  setPlatformSupabaseFactoryForTests(() => ({
    from: (table: string) => {
      assert.equal(table, "brand_settings");
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => runtimeError
              ? { data: null, error: runtimeError }
              : { data: { settings: { enabled: runtimeEnabled }, updated_at: null }, error: null },
          }),
        }),
      };
    },
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
});

test("database runtime switch blocks member login before grant lookup", async () => {
  runtimeEnabled = false;
  const result = await admitWorkspaceMemberLogin("staff@example.test", userId);
  assert.deepEqual(result, { ok: false, reason: "DISABLED" });
  assert.equal(calls, 0);
});

test("unavailable runtime switch fails closed before grant lookup", async () => {
  runtimeError = { message: "runtime unavailable" };
  const result = await admitWorkspaceMemberLogin("staff@example.test", userId);
  assert.deepEqual(result, { ok: false, reason: "UNAVAILABLE" });
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

test("marketing-only read/draft membership admits the scoped workspace shell", async () => {
  rpcData = [{
    brand: { id: "brand-id", brand_key: "pinosoecolife", display_name: "Pinoso EcoLife" },
    grant: {
      brand_id: "brand-id", user_id: userId, email: "staff@example.test",
      status: "active", permissions: ["marketing.read", "marketing.draft"],
    },
  }];
  const result = await admitWorkspaceMemberLogin("staff@example.test", userId);
  assert.deepEqual(result, { ok: true, activeBrands: ["pinosoecolife"] });
});

test("social publish membership admits only with complete marketing read draft publish scope", async () => {
  rpcData = [{
    brand: { id: "brand-id", brand_key: "pinosoecolife", display_name: "Pinoso EcoLife" },
    grant: {
      brand_id: "brand-id", user_id: userId, email: "staff@example.test",
      status: "active", permissions: ["marketing.read", "marketing.draft", "marketing.publish"],
    },
  }];
  const result = await admitWorkspaceMemberLogin("staff@example.test", userId);
  assert.deepEqual(result, { ok: true, activeBrands: ["pinosoecolife"] });
});

test("content-only membership admits when read, edit and publish dependencies are complete", async () => {
  rpcData = [{
    brand: { id: "brand-id", brand_key: "pinosoecolife", display_name: "Pinoso EcoLife" },
    grant: {
      brand_id: "brand-id", user_id: userId, email: "staff@example.test",
      status: "active", permissions: ["content.read", "content.edit", "content.publish"],
    },
  }];
  const result = await admitWorkspaceMemberLogin("staff@example.test", userId);
  assert.deepEqual(result, { ok: true, activeBrands: ["pinosoecolife"] });
});

test("email-only membership admits only with complete read draft send dependencies", async () => {
  rpcData = [{
    brand: { id: "brand-id", brand_key: "pinosoecolife", display_name: "Pinoso EcoLife" },
    grant: {
      brand_id: "brand-id", user_id: userId, email: "staff@example.test",
      status: "active", permissions: ["email.read", "email.draft", "email.send"],
    },
  }];
  const result = await admitWorkspaceMemberLogin("staff@example.test", userId);
  assert.deepEqual(result, { ok: true, activeBrands: ["pinosoecolife"] });
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

test("malformed, inactive, invalid-brand and RPC-error grants fail closed", async () => {
  for (const value of [
    [{ brand: { brand_key: "BAD BRAND" }, grant: {
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
    [{ brand: { id: "brand-id", brand_key: "pinosoecolife" }, grant: {
      brand_id: "brand-id", user_id: userId, email: "staff@example.test",
      status: "active", permissions: ["crm.joint.read"],
    } }],
    [{ brand: { id: "brand-id", brand_key: "pinosoecolife" }, grant: {
      brand_id: "brand-id", user_id: userId, email: "staff@example.test",
      status: "active", permissions: ["marketing.read", "marketing.publish"],
    } }],
    [{ brand: { id: "brand-id", brand_key: "pinosoecolife" }, grant: {
      brand_id: "brand-id", user_id: userId, email: "staff@example.test",
      status: "active", permissions: ["marketing.publish"],
    } }],
    [{ brand: { id: "brand-id", brand_key: "pinosoecolife" }, grant: {
      brand_id: "brand-id", user_id: userId, email: "staff@example.test",
      status: "active", permissions: ["content.edit"],
    } }],
    [{ brand: { id: "brand-id", brand_key: "pinosoecolife" }, grant: {
      brand_id: "brand-id", user_id: userId, email: "staff@example.test",
      status: "active", permissions: ["content.read", "content.publish"],
    } }],
    [{ brand: { id: "brand-id", brand_key: "pinosoecolife" }, grant: {
      brand_id: "brand-id", user_id: userId, email: "staff@example.test",
      status: "active", permissions: ["email.draft"],
    } }],
    [{ brand: { id: "brand-id", brand_key: "pinosoecolife" }, grant: {
      brand_id: "brand-id", user_id: userId, email: "staff@example.test",
      status: "active", permissions: ["email.read", "email.send"],
    } }],
    [{ brand: { id: "zen-id", brand_key: "zeneco" }, grant: {
      brand_id: "zen-id", user_id: userId, email: "staff@example.test",
      status: "active", permissions: ["crm.read"],
    } }],
    [{ brand: { id: "zen-id", brand_key: "zeneco" }, grant: {
      brand_id: "zen-id", user_id: userId, email: "staff@example.test",
      status: "active", permissions: ["tasks.joint.write"],
    } }],
    [{ brand: { id: "zen-id", brand_key: "zeneco" }, grant: {
      brand_id: "zen-id", user_id: userId, email: "staff@example.test",
      status: "active", permissions: ["crm.joint.read", "tasks.joint.write"],
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
