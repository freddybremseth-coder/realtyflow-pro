import { describe, expect, it } from "vitest";
import { nexusInternalMutationOrigin } from "@/lib/nexus-internal-origin";

describe("nexusInternalMutationOrigin", () => {
  it("prefers the configured canonical RealtyFlow origin", () => {
    expect(
      nexusInternalMutationOrigin(
        "https://realtyflow-pro-git-main-example.vercel.app",
        "https://realtyflow.chatgenius.pro/some/path",
      ),
    ).toBe("https://realtyflow.chatgenius.pro");
  });

  it("does not send internal mutations to a protected Vercel deployment origin", () => {
    expect(
      nexusInternalMutationOrigin("https://realtyflow-pro-git-main-example.vercel.app", ""),
    ).toBe("https://realtyflow.chatgenius.pro");
  });

  it("keeps a normal custom-domain request origin when no configured URL exists", () => {
    expect(
      nexusInternalMutationOrigin("https://app.example.com", ""),
    ).toBe("https://app.example.com");
  });

  it("fails closed to the canonical RealtyFlow origin for an invalid request origin", () => {
    expect(nexusInternalMutationOrigin("not-a-url", "")).toBe("https://realtyflow.chatgenius.pro");
  });
});
