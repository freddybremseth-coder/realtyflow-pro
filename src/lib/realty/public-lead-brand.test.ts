import assert from "node:assert/strict";
import test from "node:test";
import { resolvePublicLeadBrand } from "./public-lead-brand";

test("accepts allowlisted real-estate brands", () => {
  assert.equal(resolvePublicLeadBrand("soleada", "website"), "soleada");
  assert.equal(resolvePublicLeadBrand("pinoso-eco-life", "website"), "pinosoecolife");
  assert.equal(resolvePublicLeadBrand("zenecohomes", "website"), "zeneco");
});

test("infers brand from source when explicit brand is absent", () => {
  assert.equal(resolvePublicLeadBrand(null, "soleada-contact-form"), "soleada");
  assert.equal(resolvePublicLeadBrand(undefined, "pinosoecolife-property"), "pinosoecolife");
});

test("rejects unrelated brands and falls back to Zen Eco Homes", () => {
  assert.equal(resolvePublicLeadBrand("chatgenius", "unknown"), "zeneco");
  assert.equal(resolvePublicLeadBrand("neuralbeat", "unknown"), "zeneco");
});
