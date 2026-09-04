import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const apiSource = fs.readFileSync(path.join(process.cwd(), "src/app/api/personal-intelligence/me/provenance/route.ts"), "utf8");
const pageSource = fs.readFileSync(path.join(process.cwd(), "src/app/(content)/personal-intelligence/provenance/page.tsx"), "utf8");

describe("Personal Intelligence ME provenance", () => {
  it("is owner scoped and read only", () => {
    expect(apiSource).toMatch(/access\.role !== "OWNER"/);
    expect(apiSource).toMatch(/\.eq\("owner_user_id", ownerUserId\)/);
    expect(apiSource).toMatch(/writesPerformed: 0/);
    expect(apiSource).not.toMatch(/\.insert\(|\.update\(|\.delete\(|\.upsert\(|rpc\(/);
  });

  it("joins claim source provenance without manufacturing evidence", () => {
    expect(apiSource).toMatch(/source_id,source_excerpt/);
    expect(apiSource).toMatch(/from\("sources"\)/);
    expect(apiSource).toMatch(/reliability_class/);
    expect(apiSource).toMatch(/source: claim\.source_id \? sourceById\.get/);
  });

  it("shows missing provenance explicitly", () => {
    expect(pageSource).toMatch(/No source record is attached to this claim/);
    expect(pageSource).toMatch(/Read only · owner scoped/);
    expect(pageSource).not.toMatch(/Promote|Validate|Reject|Correct|Forget|Save memory/i);
  });
});
