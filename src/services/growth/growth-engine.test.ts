import assert from "node:assert/strict";
import test from "node:test";
import { AutonomousGrowthEngine } from "@/services/growth/growth-engine";

function createSupabaseStub() {
  const insertCalls: Array<{ table: string; rows: unknown }> = [];

  const from = (table: string) => {
    const builder = {
      select: () => builder,
      eq: () => builder,
      gte: () => builder,
      order: () => Promise.resolve({ data: [], error: null }),
      insert: (rows: unknown) => {
        insertCalls.push({ table, rows });
        return Promise.resolve({ error: null });
      },
    };
    return builder;
  };

  return {
    insertCalls,
    client: { from },
  };
}

test("runCycle persists generated actions once when Supabase is configured", async () => {
  const previousAnthropicKey = process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;

  try {
    const supabase = createSupabaseStub();
    const engine = new AutonomousGrowthEngine(supabase.client as never);

    const actions = await engine.runCycle(["soleada"]);

    assert.ok(actions.length > 0);
    assert.equal(supabase.insertCalls.length, 1);
    assert.equal(supabase.insertCalls[0].table, "growth_actions");
    assert.deepEqual(supabase.insertCalls[0].rows, actions);
  } finally {
    if (previousAnthropicKey === undefined) {
      delete process.env.ANTHROPIC_API_KEY;
    } else {
      process.env.ANTHROPIC_API_KEY = previousAnthropicKey;
    }
  }
});

test("runCycle supports read-only generation with persist false", async () => {
  const previousAnthropicKey = process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;

  try {
    const supabase = createSupabaseStub();
    const engine = new AutonomousGrowthEngine(supabase.client as never);

    const actions = await engine.runCycle(["soleada"], { persist: false });

    assert.ok(actions.length > 0);
    assert.equal(supabase.insertCalls.length, 0);
  } finally {
    if (previousAnthropicKey === undefined) {
      delete process.env.ANTHROPIC_API_KEY;
    } else {
      process.env.ANTHROPIC_API_KEY = previousAnthropicKey;
    }
  }
});

test("getStrategyForBrand does not persist actions while building a preview plan", async () => {
  const previousAnthropicKey = process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;

  try {
    const supabase = createSupabaseStub();
    const engine = new AutonomousGrowthEngine(supabase.client as never);

    const strategy = await engine.getStrategyForBrand("soleada");

    assert.equal(strategy.brand, "soleada");
    assert.ok(strategy.weekly_action_plan.length > 0);
    assert.equal(supabase.insertCalls.length, 0);
  } finally {
    if (previousAnthropicKey === undefined) {
      delete process.env.ANTHROPIC_API_KEY;
    } else {
      process.env.ANTHROPIC_API_KEY = previousAnthropicKey;
    }
  }
});
