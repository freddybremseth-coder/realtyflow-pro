import { describe, expect, it } from "vitest";
import { canonicalBrandWebsite, ensureBrandWebsiteLink } from "./social-website-link";

describe("social website link guard", () => {
  it("appends the canonical Zen website to social copy", () => {
    expect(ensureBrandWebsiteLink({ brandId: "zeneco", channel: "facebook", content: "Ny bolig i Altea" }))
      .toBe("Ny bolig i Altea\n\nhttps://www.zenecohomes.com");
  });

  it("accepts a deep link on the same owned host without duplicating the root", () => {
    const content = "Se boligen: https://zenecohomes.com/properties/abc";
    expect(ensureBrandWebsiteLink({ brandId: "zeneco", channel: "instagram", content })).toBe(content);
  });

  it("uses the owned Re-Master site instead of the legacy YouTube fallback", () => {
    expect(canonicalBrandWebsite("remasterfreddy")).toBe("https://remaster.freddybremseth.com");
  });

  it("resolves Reel Studio aliases", () => {
    expect(canonicalBrandWebsite("art")).toBe("https://art.freddybremseth.com");
    expect(canonicalBrandWebsite("books")).toBe("https://books.freddybremseth.com");
    expect(canonicalBrandWebsite("freddybremseth")).toBe("https://freddybremseth.com");
  });

  it("does not change non-social content", () => {
    expect(ensureBrandWebsiteLink({ brandId: "zeneco", channel: "website", content: "Artikkel" })).toBe("Artikkel");
  });

  it("leaves non-owned tenant brands unchanged when no canonical website is registered", () => {
    expect(ensureBrandWebsiteLink({ brandId: "unknown-brand", channel: "facebook", content: "Hei" }))
      .toBe("Hei");
  });
});
