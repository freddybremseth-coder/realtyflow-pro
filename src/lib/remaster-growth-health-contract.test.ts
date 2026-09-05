import fs from "node:fs";
import path from "node:path";

describe("Re-Master growth health contract", () => {
  const source = fs.readFileSync(path.join(process.cwd(), "src/app/api/remaster/overview/route.ts"), "utf8");

  it("keeps growth health read-only and secret-safe", () => {
    expect(source).toContain('requireAdminApi(request)');
    expect(source).toContain('checkBrandYouTubeHealth("remasterfreddy")');
    expect(source).toContain('REMASTER_GROWTH_AUTOPILOT_ENABLED');
    expect(source).not.toContain('refreshToken:');
    expect(source).not.toContain('SUPABASE_SERVICE_ROLE_KEY:');
  });

  it("exposes canonical operational states and learning guardrails", () => {
    for (const state of ["BLOCKED", "READY_NOT_ENABLED", "LEARNING_GUARDED", "ACTIVE"]) {
      expect(source).toContain(`"${state}"`);
    }
    expect(source).toContain('suppressedActions');
    expect(source).toContain('positiveMetadataTags');
    expect(source).toContain('automaticTitleChanges: false');
    expect(source).toContain('automaticThumbnailChanges: false');
    expect(source).toContain('evidenceRequiredBeforeBias: 2');
    expect(source).toContain('feedbackObservationDays: 7');
  });
});
