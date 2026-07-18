import assert from "node:assert/strict";
import test from "node:test";
import { platformCommandSchema } from "@/lib/platform/validation";

test("platform accepts a normalized tenant command", () => {
  const parsed = platformCommandSchema.parse({
    command: "upsert_tenant",
    payload: {
      slug: "Kunde-En",
      name: "Kunde én",
      contactEmail: "Owner@Example.com",
      customerType: "customer",
    },
  });
  assert.equal(parsed.command, "upsert_tenant");
  assert.equal(parsed.payload.slug, "kunde-en");
  assert.equal(parsed.payload.contactEmail, "owner@example.com");
  assert.equal(parsed.payload.defaultCurrency, "EUR");
});

test("platform validates module, entitlement and white-label commands", () => {
  const tenantId = "11111111-1111-4111-8111-111111111111";
  assert.equal(platformCommandSchema.safeParse({
    command: "set_module",
    payload: { tenantId, moduleSlug: "crm", status: "active" },
  }).success, true);
  assert.equal(platformCommandSchema.safeParse({
    command: "set_entitlement",
    payload: { tenantId, entitlementKey: "crm.contacts.limit", value: 2500 },
  }).success, true);
  assert.equal(platformCommandSchema.safeParse({
    command: "upsert_branding",
    payload: { tenantId, appName: "Kunde CRM", primaryColor: "#123456", accentColor: "#abcdef" },
  }).success, true);
  assert.equal(platformCommandSchema.safeParse({
    command: "upsert_domain",
    payload: { tenantId, appSlug: "crm", hostname: "app.kunde.no" },
  }).success, true);
});

test("platform rejects unsafe slugs, colors, domains and unknown commands", () => {
  const tenantId = "11111111-1111-4111-8111-111111111111";
  assert.equal(platformCommandSchema.safeParse({
    command: "upsert_tenant",
    payload: { slug: "../kunde", name: "Kunde" },
  }).success, false);
  assert.equal(platformCommandSchema.safeParse({
    command: "upsert_branding",
    payload: { tenantId, primaryColor: "red", accentColor: "#000000" },
  }).success, false);
  assert.equal(platformCommandSchema.safeParse({
    command: "upsert_domain",
    payload: { tenantId, hostname: "https://kunde.no/path" },
  }).success, false);
  assert.equal(platformCommandSchema.safeParse({ command: "delete_tenant", payload: { tenantId } }).success, false);
});
