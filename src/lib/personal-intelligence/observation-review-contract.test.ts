import { describe, expect, it } from "vitest";
import fs from "node:fs";

const route = fs.readFileSync("src/app/api/personal-intelligence/observations/review/route.ts", "utf8");
const page = fs.readFileSync("src/app/(content)/personal-intelligence/observations/page.tsx", "utf8");

describe("Personal Intelligence observation review", () => {
  it("is owner-only and owner scoped", () => {
    expect(route).toMatch(/access\.role !== "OWNER"/);
    expect(route).toMatch(/eq\("owner_user_id", ctx\.ownerUserId\)/);
    expect(route).toMatch(/eq\("subject_entity_id", ctx\.subjectEntityId\)/);
  });

  it("allows only explicit candidate validation or rejection", () => {
    expect(route).toMatch(/body\?\.status === "validated"/);
    expect(route).toMatch(/body\?\.status === "rejected"/);
    expect(route).toMatch(/current\.status !== "candidate"/);
    expect(route).not.toMatch(/status:\s*"promoted"/);
  });

  it("audits review and rolls back if audit fails", () => {
    expect(route).toMatch(/event_type:\s*"observation_reviewed"/);
    expect(route).toMatch(/promotion_to_claim:\s*false/);
    expect(route).toMatch(/update\(\{ status: "candidate" \}\)/);
  });

  it("keeps observations epistemically separate from claims", () => {
    expect(route).toMatch(/observationsAreNotFacts:\s*true/);
    expect(route).toMatch(/promotionAvailable:\s*false/);
    expect(page).toMatch(/Observations are not facts/);
    expect(page).toMatch(/not .*canonical claim/i);
  });
});
