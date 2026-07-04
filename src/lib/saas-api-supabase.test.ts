import assert from "node:assert/strict";
import test from "node:test";
import { getSaasSupabase, setSaasSupabaseFactoryForTests } from "./saas-api-supabase";

test.beforeEach(() => {
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  setSaasSupabaseFactoryForTests(null);
});

test.afterEach(() => {
  setSaasSupabaseFactoryForTests(null);
});

test("getSaasSupabase requires a service-role key and does not fall back to anon keys", () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";

  assert.equal(getSaasSupabase(), null);
});

test("getSaasSupabase uses the test factory before reading environment variables", () => {
  const fakeClient = { from: () => ({}) };
  setSaasSupabaseFactoryForTests(() => fakeClient);

  assert.equal(getSaasSupabase(), fakeClient);
});
