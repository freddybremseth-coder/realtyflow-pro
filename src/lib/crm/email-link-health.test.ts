import assert from "node:assert/strict";
import test from "node:test";
import { assessEmailLink, buildEmailLinkHealth } from "./email-link-health";

const contacts = [
  { id: "soleada-1", name: "Kari", email: "kari@example.com", brand_id: "soleada" },
  { id: "zeneco-1", name: "Ola", email: "ola@example.com", brand_id: "zeneco" },
];

test("existing explicit contact id is linked with high confidence", () => {
  const result = assessEmailLink({ id: "m1", matched_lead_id: "soleada-1" }, contacts);
  assert.equal(result.state, "linked");
  assert.deepEqual(result.contactIds, ["soleada-1"]);
});

test("inbound exact sender email becomes a high-confidence candidate", () => {
  const result = assessEmailLink({ id: "m2", brand_id: "soleada", direction: "inbound", from_address: " KARI@example.com " }, contacts);
  assert.equal(result.state, "exact_candidate");
  assert.equal(result.confidence, "HIGH");
  assert.deepEqual(result.contactIds, ["soleada-1"]);
});

test("outbound exact recipient email becomes a high-confidence candidate", () => {
  const result = assessEmailLink({ id: "m3", brand_id: "zeneco", direction: "outbound", to_addresses: ["ola@example.com"] }, contacts);
  assert.equal(result.state, "exact_candidate");
  assert.deepEqual(result.contactIds, ["zeneco-1"]);
});

test("duplicate email identities stay ambiguous rather than auto-linked", () => {
  const duplicateContacts = [
    ...contacts,
    { id: "soleada-2", name: "Kari 2", email: "kari@example.com", brand_id: "soleada" },
  ];
  const result = assessEmailLink({ id: "m4", brand_id: "soleada", direction: "inbound", from_address: "kari@example.com" }, duplicateContacts);
  assert.equal(result.state, "ambiguous");
  assert.equal(result.confidence, "NONE");
});

test("no exact identity evidence remains unlinked", () => {
  const result = assessEmailLink({ id: "m5", brand_id: "zeneco", direction: "inbound", from_address: "vendor@example.org" }, contacts);
  assert.equal(result.state, "unlinked");
  assert.deepEqual(result.contactIds, []);
});

test("health summary separates safe candidates from unresolved mail", () => {
  const result = buildEmailLinkHealth([
    { id: "linked", matched_customer_id: "soleada-1" },
    { id: "candidate", direction: "inbound", from_address: "ola@example.com" },
    { id: "unknown", direction: "inbound", from_address: "nobody@example.org" },
  ], contacts);
  assert.equal(result.summary.linked, 1);
  assert.equal(result.summary.exactCandidates, 1);
  assert.equal(result.summary.unlinked, 1);
  assert.equal(result.summary.safeCoveragePercent, 67);
});
