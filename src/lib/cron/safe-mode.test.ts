import assert from "node:assert/strict";
import test from "node:test";
import { evaluateCronSafeMode } from "./safe-mode";

test.beforeEach(() => {
  delete process.env.CRON_SAFE_MODE;
  delete process.env.CRON_SAFE_MODE_ALLOW_PATHS;
  delete process.env.CRON_SAFE_MODE_DISABLE_HEALTHCHECK;
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
});

test.afterEach(() => {
  delete process.env.CRON_SAFE_MODE;
  delete process.env.CRON_SAFE_MODE_ALLOW_PATHS;
  delete process.env.CRON_SAFE_MODE_DISABLE_HEALTHCHECK;
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
});

test("cron safe mode healthcheck does not use anon keys as server credentials", async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";

  const result = await evaluateCronSafeMode("/api/cron/example");

  assert.deepEqual(result, { skip: false, mode: "off" });
});

test("cron safe mode manual switch skips non-allowlisted cron paths", async () => {
  process.env.CRON_SAFE_MODE = "true";
  process.env.CRON_SAFE_MODE_ALLOW_PATHS = "/api/cron/allowed";

  assert.deepEqual(await evaluateCronSafeMode("/api/cron/allowed"), { skip: false, mode: "off" });
  assert.deepEqual(await evaluateCronSafeMode("/api/cron/blocked"), {
    skip: true,
    mode: "manual",
    reason: "CRON_SAFE_MODE is enabled",
  });
});
