import assert from "node:assert/strict";
import test from "node:test";
import { makeManualReviewMarketingSupabase } from "@/services/marketing/manual-review-campaign";

test("manual-review policy view forces copilot without mutating stored growth plan", async () => {
  const stored = {
    autonomy_mode: "controlled_auto",
    metadata: { autopilot_channels: ["instagram"], facebook_activation: "canary_pending" },
  };
  const calls: Array<{ table: string; op: string; args: unknown[] }> = [];
  const supabase: any = {
    from(table: string) {
      const query: any = {
        select(...args: unknown[]) { calls.push({ table, op: "select", args }); return query; },
        eq(...args: unknown[]) { calls.push({ table, op: "eq", args }); return query; },
        async maybeSingle() { return { data: stored, error: null }; },
      };
      return query;
    },
  };

  const governed = makeManualReviewMarketingSupabase(supabase);
  const { data, error } = await governed
    .from("marketing_brand_growth_plans")
    .select("autonomy_mode, metadata")
    .eq("brand_id", "zeneco")
    .maybeSingle();

  assert.equal(error, null);
  assert.equal(data.autonomy_mode, "copilot");
  assert.deepEqual(data.metadata.autopilot_channels, []);
  assert.deepEqual(data.metadata.autopilot_scope, []);
  assert.equal(data.metadata.facebook_activation, "canary_pending");
  assert.equal(stored.autonomy_mode, "controlled_auto");
  assert.deepEqual(stored.metadata.autopilot_channels, ["instagram"]);
  assert.ok(calls.some((call) => call.op === "eq" && call.args[0] === "brand_id" && call.args[1] === "zeneco"));
});

test("manual-review policy view follows immutable PostgREST builder returns", async () => {
  const stored = {
    autonomy_mode: "controlled_auto",
    metadata: { autopilot_channels: ["instagram", "facebook"] },
  };
  const calls: string[] = [];
  const filteredBuilder = {
    async maybeSingle() {
      calls.push("maybeSingle");
      return { data: stored, error: null };
    },
  };
  const selectedBuilder = {
    eq(column: string, value: string) {
      calls.push(`eq:${column}:${value}`);
      return filteredBuilder;
    },
  };
  const fromBuilder = {
    select(columns: string) {
      calls.push(`select:${columns}`);
      return selectedBuilder;
    },
  };
  const supabase: any = {
    from(table: string) {
      assert.equal(table, "marketing_brand_growth_plans");
      calls.push(`from:${table}`);
      return fromBuilder;
    },
  };

  const governed = makeManualReviewMarketingSupabase(supabase);
  const result = await governed
    .from("marketing_brand_growth_plans")
    .select("autonomy_mode, metadata")
    .eq("brand_id", "zeneco")
    .maybeSingle();

  assert.deepEqual(calls, [
    "from:marketing_brand_growth_plans",
    "select:autonomy_mode, metadata",
    "eq:brand_id:zeneco",
    "maybeSingle",
  ]);
  assert.equal(result.error, null);
  assert.equal(result.data.autonomy_mode, "copilot");
  assert.deepEqual(result.data.metadata.autopilot_channels, []);
  assert.deepEqual(result.data.metadata.autopilot_scope, []);
  assert.deepEqual(stored.metadata.autopilot_channels, ["instagram", "facebook"]);
});

test("manual-review policy view leaves all non-policy tables untouched", () => {
  const marker: any = { select: () => marker };
  const supabase: any = { from: (table: string) => table === "properties" ? marker : {} };
  const governed = makeManualReviewMarketingSupabase(supabase);
  assert.equal(governed.from("properties"), marker);
});
