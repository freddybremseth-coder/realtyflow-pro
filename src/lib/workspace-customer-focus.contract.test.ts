import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const workspace = fs.readFileSync(
  path.join(process.cwd(), "src/app/(realty)/workspace/[brandKey]/page.tsx"),
  "utf8",
);
const tasks = fs.readFileSync(
  path.join(process.cwd(), "src/components/workspaces/zen-joint-tasks.tsx"),
  "utf8",
);

describe("workspace customer focus UX contract", () => {
  it("opens one customer and binds Zen tasks to that exact customer", () => {
    expect(workspace).toContain("selectedCustomerId");
    expect(workspace).toContain('selectedContactId={selectedCustomer.id}');
    expect(workspace).toContain("hideContactSelector");
    expect(tasks).toContain("selectedContactId?: string");
    expect(tasks).toContain("hideContactSelector?: boolean");
  });

  it("keeps customer focus inside scoped workspace APIs", () => {
    expect(workspace).not.toContain('fetch("/api/customers');
    expect(workspace).not.toContain('fetch("/api/revenue');
    expect(tasks).toContain('const endpoint = "/api/workspaces/zeneco/joint-tasks"');
  });

  it("does not expose finance or legacy notes in the focused customer card", () => {
    expect(workspace).not.toContain("commission_amount");
    expect(workspace).not.toContain("pipeline_value");
    expect(workspace).not.toContain("contacts.notes");
  });
});
