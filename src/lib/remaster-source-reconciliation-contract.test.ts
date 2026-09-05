import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const route = fs.readFileSync(path.join(process.cwd(), "src/app/api/cron/remaster-source-sync/route.ts"), "utf8");
const vercel = fs.readFileSync(path.join(process.cwd(), "vercel.json"), "utf8");
const service = fs.readFileSync(path.join(process.cwd(), "src/services/growth/remaster-source-reconciliation.ts"), "utf8");

describe("Re-Master source reconciliation contract", () => {
  it("requires scheduler auth and safe mode", () => {
    expect(route).toContain("requireNexusSchedulerApi(request)");
    expect(route).toContain('evaluateCronSafeMode("/api/cron/remaster-source-sync")');
  });

  it("is scheduled hourly before the next marketing autopilot cycle", () => {
    expect(vercel).toContain('{ "path": "/api/cron/remaster-source-sync", "schedule": "40 * * * *" }');
  });

  it("only reconciles songs into the canonical marketing source queue", () => {
    expect(service).toContain('.from("songs")');
    expect(service).toContain('.from("marketing_source_queue")');
    expect(service).toContain('onConflict: "brand_id,source_type,source_id"');
    expect(service).not.toContain('videos.insert');
    expect(service).not.toContain('youtube.videos.insert');
  });
});
