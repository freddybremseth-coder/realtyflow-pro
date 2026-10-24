import assert from "node:assert/strict";
import test from "node:test";
import { emailFirstName } from "./email-first-name";

test("capitalizes the customer's first name from CRM input", () => {
  assert.equal(emailFirstName("freddy bremseth"), "Freddy");
  assert.equal(emailFirstName("  øystein hansen "), "Øystein");
  assert.equal(emailFirstName("anna"), "Anna");
});

test("preserves the original spelling and remaining case", () => {
  assert.equal(emailFirstName("McDonald Smith"), "McDonald");
  assert.equal(emailFirstName("jan-Helge Dahl"), "Jan-Helge");
  assert.equal(emailFirstName("Élodie"), "Élodie");
});

test("handles missing names and fallback values", () => {
  assert.equal(emailFirstName(null), "");
  assert.equal(emailFirstName(" "), "");
  assert.equal(emailFirstName(undefined, "kunde"), "Kunde");
});
