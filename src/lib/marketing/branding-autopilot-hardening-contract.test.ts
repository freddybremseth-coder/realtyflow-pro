import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

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
    expect(migration).toContain("coalesce(new.autonomy_mode, '') <> 'live'");
    expect(migration).toContain("coalesce(plan_mode, '') <> 'controlled_auto'");
    expect(migration).toContain("Manual-review and blocked rows are intentionally outside this guard");
  });

  it("enforces both channel cadence and exact-source cooldown", () => {
    expect(migration).toContain("autopilot_min_interval_hours");
    expect(migration).toContain("CONTROLLED_AUTO_CADENCE_GUARD");
    expect(migration).toContain("autopilot_source_cooldown_days");
    expect(migration).toContain("CONTROLLED_AUTO_SOURCE_COOLDOWN");
    expect(migration).toContain("before insert on public.marketing_publications");
  });

  it("writes a secret-safe metrics heartbeat with per-channel outcomes", () => {
    expect(metricsRoute).toContain('action: "marketing_growth_metrics"');
    expect(metricsRoute).toContain('agent_name: "nexus_marketing_growth_metrics_cron"');
    expect(metricsRoute).toContain("channel_results: channelResults");
    expect(metricsRoute).toContain("observations:");
    expect(metricsRoute).toContain('failedChannels.length > 0 ? "partial" : "success"');
  });
});
