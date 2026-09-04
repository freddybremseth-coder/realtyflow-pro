import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const route = fs.readFileSync(path.join(process.cwd(), "src/app/api/personal-intelligence/observations/promote/route.ts"), "utf8");
const page = fs.readFileSync(path.join(process.cwd(), "src/app/(content)/personal-intelligence/observations/page.tsx"), "utf8");

describe("Personal Intelligence observation promotion", () => {
  it("requires owner access and a validated observation", () => {
    expect(route).toMatch(/access\.role !== "OWNER"/);
    expect(route).toMatch(/observation\.status !== "validated"/);
  });

  it("requires explicit structured owner confirmation", () => {
    expect(route).toMatch(/observationId, predicate and valueText are required/);
    expect(route).toMatch(/ALLOWED_CLAIM_TYPES/);
    expect(route).toContain('"fact", "preference", "belief", "interest"');
    expect(route).not.toMatch(/personality|identity_trait|identity_claim/i);
    expect(page).toMatch(/Confirm canonical claim/);
    expect(page).toMatch(/Predicate/);
    expect(page).toMatch(/Claim value/);
  });

  it("reuses canonical provenance and marks the observation promoted only after confirmation", () => {
    expect(route).toMatch(/createConfirmedClaim/);
    expect(route).toMatch(/direct owner confirmation|explicitOwnerConfirmation/i);
    expect(route).toMatch(/status: "promoted"/);
    expect(route).toMatch(/observation_promoted_to_claim/);
  });

  it("rolls claim source and observation state back when the boundary fails", () => {
    expect(route).toMatch(/cleanupClaim/);
    expect(route).toMatch(/from\("claims"\)\.delete/);
    expect(route).toMatch(/from\("sources"\)\.delete/);
    expect(route).toMatch(/status: "validated"/);
    expect(route).toMatch(/audit failed/i);
  });

  it("does not auto-promote from candidate observations", () => {
    expect(page).toMatch(/item\.status === "validated"/);
    expect(page).toMatch(/Promote to canonical claim/);
    expect(page).not.toMatch(/useEffect\([^)]*promote/);
  });
});
