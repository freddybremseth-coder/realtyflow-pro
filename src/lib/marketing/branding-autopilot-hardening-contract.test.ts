import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

const migration = fs.readFileSync(
  path.join(process.cwd(), "supabase/migrations/20260906091000_marketing_controlled_auto_cadence_guard.sql"),
  "utf8",
);
const metricsRoute = fs.readFileSync(
  path.join(process.cwd(), "src/app/api/cron/marketing-growth-metrics/route.ts"),
  "utf8",
);

describe("branding autopilot hardening contract", () => {
  it("guards only live controlled-auto publications and leaves manual-review outside the trigger", () => {
    assert.ok(migration.includes("coalesce(new.autonomy_mode, '') <> 'live'"));
    assert.ok(migration.includes("coalesce(plan_mode, '') <> 'controlled_auto'"));
    assert.ok(migration.includes("Manual-review and blocked rows are intentionally outside this guard"));
  });

  it("enforces both channel cadence and exact-source cooldown", () => {
    assert.ok(migration.includes("autopilot_min_interval_hours"));
    assert.ok(migration.includes("CONTROLLED_AUTO_CADENCE_GUARD"));
    assert.ok(migration.includes("autopilot_source_cooldown_days"));
    assert.ok(migration.includes("CONTROLLED_AUTO_SOURCE_COOLDOWN"));
    assert.ok(migration.includes("before insert on public.marketing_publications"));
  });

  it("writes a secret-safe metrics heartbeat with per-channel outcomes", () => {
    assert.ok(metricsRoute.includes('action: "marketing_growth_metrics"'));
    assert.ok(metricsRoute.includes('agent_name: "nexus_marketing_growth_metrics_cron"'));
    assert.ok(metricsRoute.includes("channel_results: channelResults"));
    assert.ok(metricsRoute.includes("observations:"));
    assert.ok(metricsRoute.includes('failedChannels.length > 0 ? "partial" : "success"'));
  });
});
