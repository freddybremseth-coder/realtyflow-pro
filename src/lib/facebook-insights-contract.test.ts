import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const source = fs.readFileSync(
  path.join(process.cwd(), "src/services/integrations/facebook-insights.ts"),
  "utf8",
);

describe("Facebook insights compatibility", () => {
  it("does not require shares in the canonical engagement object fetch", () => {
    expect(source).toContain('const fields = "reactions.summary(true),comments.summary(true)"');
    expect(source).not.toContain('const fields = "reactions.summary(true),comments.summary(true),shares"');
  });

  it("fetches shares separately as best-effort enrichment", () => {
    expect(source).toContain('sharesUrl.searchParams.set("fields", "shares")');
    expect(source).toContain("let shares = 0");
    expect(source).toContain("Reactions/comments remain valid even when this post type has no shares field");
  });
});
