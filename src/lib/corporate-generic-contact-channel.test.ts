import assert from "node:assert/strict";
import test from "node:test";
import { isGenericCompanyEmail } from "@/lib/corporate-generic-contact-channel";

test("Generic company contact accepts role-based company addresses", () => {
  assert.equal(isGenericCompanyEmail("info@example.no"), true);
  assert.equal(isGenericCompanyEmail("kontakt@example.no"), true);
  assert.equal(isGenericCompanyEmail("office@example.com"), true);
  assert.equal(isGenericCompanyEmail("kundeservice@example.no"), true);
});

test("Generic company contact rejects likely personal addresses", () => {
  assert.equal(isGenericCompanyEmail("ola.nordmann@example.no"), false);
  assert.equal(isGenericCompanyEmail("freddy@example.no"), false);
  assert.equal(isGenericCompanyEmail("anna.b@example.no"), false);
  assert.equal(isGenericCompanyEmail("ceo@example.no"), false);
});

test("Generic company contact rejects malformed or non-email values", () => {
  assert.equal(isGenericCompanyEmail("info"), false);
  assert.equal(isGenericCompanyEmail("@example.no"), false);
  assert.equal(isGenericCompanyEmail("https://example.no"), false);
});
