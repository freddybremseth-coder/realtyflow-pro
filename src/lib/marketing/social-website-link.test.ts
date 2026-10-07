import assert from "node:assert/strict";
import test from "node:test";
import { canonicalBrandWebsite, ensureBrandWebsiteLink } from "./social-website-link";
test("appends the canonical Zen website to social copy", () => {
  assert.equal(
    ensureBrandWebsiteLink({ brandId: "zeneco", channel: "facebook", content: "Ny bolig i Altea" }),
    "Ny bolig i Altea\n\nhttps://www.zenecohomes.com",
  );
});

test("Instagram strips raw links instead of appending or preserving dead caption URLs", () => {
  const content = "Se boligen: https://zenecohomes.com/properties/abc";
  assert.equal(ensureBrandWebsiteLink({ brandId: "zeneco", channel: "instagram", content }), "Se boligen");
});

test("Instagram removes link-in-bio language while keeping useful engagement copy", () => {
  const content = "Lagre denne posten til senere.\nLenke i bio: https://zenecohomes.com/guide/test\nSend oss en melding hvis du vil vite mer.";
  assert.equal(
    ensureBrandWebsiteLink({ brandId: "zeneco", channel: "instagram", content }),
    "Lagre denne posten til senere.\nSend oss en melding hvis du vil vite mer.",
  );
});

test("uses the owned Re-Master site instead of the legacy YouTube fallback", () => {
  assert.equal(canonicalBrandWebsite("remasterfreddy"), "https://remaster.freddybremseth.com");
});

test("resolves Reel Studio aliases", () => {
  assert.equal(canonicalBrandWebsite("art"), "https://art.freddybremseth.com");
  assert.equal(canonicalBrandWebsite("books"), "https://books.freddybremseth.com");
  assert.equal(canonicalBrandWebsite("freddybremseth"), "https://freddybremseth.com");
});

test("does not change non-social content", () => {
  assert.equal(ensureBrandWebsiteLink({ brandId: "zeneco", channel: "website", content: "Artikkel" }), "Artikkel");
});

test("leaves non-owned tenant brands unchanged when no canonical website is registered", () => {
  assert.equal(ensureBrandWebsiteLink({ brandId: "unknown-brand", channel: "facebook", content: "Hei" }), "Hei");
});
