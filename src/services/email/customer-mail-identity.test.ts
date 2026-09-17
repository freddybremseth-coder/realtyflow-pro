import test from "node:test";
import assert from "node:assert/strict";
import { normalizeCustomerIdentityEmail } from "./customer-mail-admission";

test("consumer Gmail dot aliases resolve to the same customer identity", () => {
  assert.equal(normalizeCustomerIdentityEmail("Atle.Haga@gmail.com"), "atlehaga@gmail.com");
  assert.equal(normalizeCustomerIdentityEmail("atlehaga@gmail.com"), "atlehaga@gmail.com");
});

test("consumer Gmail plus tags resolve to the base customer identity", () => {
  assert.equal(normalizeCustomerIdentityEmail("atle.haga+spain@gmail.com"), "atlehaga@gmail.com");
  assert.equal(normalizeCustomerIdentityEmail("atle.haga@googlemail.com"), "atlehaga@gmail.com");
});

test("non-Gmail addresses keep dots and plus tags intact", () => {
  assert.equal(normalizeCustomerIdentityEmail("first.last+sales@example.com"), "first.last+sales@example.com");
});
