import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const route = fs.readFileSync(path.join(process.cwd(), "src/app/api/cron/remaster-health-monitor/route.ts"), "utf8");
const sourceSync = fs.readFileSync(path.join(process.cwd(), "src/app/api/cron/remaster-source-sync/route.ts"), "utf8");
const vercel = fs.readFileSync(path.join(process.cwd(), "vercel.json"), "utf8");

describe("Re-Master health monitor contract", () => {
  it("uses scheduler auth and safe mode", () => {
    expect(route).toContain("requireNexusSchedulerApi");
    expect(route).toContain('evaluateCronSafeMode("/api/cron/remaster-health-monitor")');
  });

  it("checks exact Re-Master runtime evidence", () => {
    expect(route).toContain('checkBrandYouTubeHealth("remasterfreddy")');
    expect(route).toContain('marketing_source_queue');
    expect(route).toContain('marketing_autopilot_run_requests');
    expect(route).toContain('growth_actions');
    expect(route).toContain('remaster_source_sync');
  });

  it("feeds only health state into the existing automation attention path", () => {
    expect(route).toContain('action: "remaster_health_monitor"');
    expect(route).toContain('status: assessment.state === "healthy" ? "success" : assessment.state');
    expect(sourceSync).toContain('action: "remaster_source_sync"');
  });

  it("runs after source sync and before the next hourly marketing slot", () => {
    expect(vercel).toContain('{ "path": "/api/cron/remaster-source-sync", "schedule": "40 * * * *" }');
    expect(vercel).toContain('{ "path": "/api/cron/remaster-health-monitor", "schedule": "50 * * * *" }');
  });
});
