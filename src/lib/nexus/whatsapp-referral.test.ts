import assert from "node:assert/strict";
import test from "node:test";
import { resolveWhatsAppLeadIdentity } from "./whatsapp-referral";

function inbound(overrides: Partial<any> = {}) {
  return {
    messageId: "wamid-1",
    from: "+4799999999",
    profileName: "Hans Kristian",
    text: "Kunde: Kari Nordmann, tlf +47 912 34 567. Ønsker villa i Altea, budsjett 550000 EUR.",
    brandId: "soleada",
    ...overrides,
  };
}

test("known Soleada referrer resolves customer phone from message instead of sender phone", () => {
  const result = resolveWhatsAppLeadIdentity(inbound());
  assert.equal(result.mode, "REFERRAL_RESOLVED");
  assert.equal(result.message?.from, "+4791234567");
  assert.equal(result.customer?.phone, "+4791234567");
  assert.equal(result.referrer?.name, "Hans Kristian");
  assert.equal(result.message?.text.includes("+4799999999"), false);
});

test("Roar Haug is treated as Soleada referrer by default", () => {
  const result = resolveWhatsAppLeadIdentity(inbound({ profileName: "Roar Haug", text: "Lead: Per Olsen - +34 611 22 33 44 - viewing Benidorm" }));
  assert.equal(result.mode, "REFERRAL_RESOLVED");
  assert.equal(result.message?.from, "+34611223344");
  assert.equal(result.customer?.name, "Per Olsen -");
});

test("known referrer without customer phone never becomes the CRM customer", () => {
  const result = resolveWhatsAppLeadIdentity(inbound({ text: "Kunde: Kari Nordmann. Ser etter bolig i Altea." }));
  assert.equal(result.mode, "REFERRAL_UNRESOLVED");
  assert.equal(result.message, null);
  assert.equal(result.customer?.phone, null);
});

test("ordinary sender remains direct customer", () => {
  const result = resolveWhatsAppLeadIdentity(inbound({ profileName: "Kari Nordmann", from: "+4791234567", text: "I want a villa in Altea" }));
  assert.equal(result.mode, "DIRECT");
  assert.equal(result.message?.from, "+4791234567");
});

test("additional referrer names can be configured without replacing Soleada defaults", () => {
  const result = resolveWhatsAppLeadIdentity(inbound({ profileName: "Soleada Sales Desk" }), { configuredReferrerNames: "Soleada Sales Desk" });
  assert.equal(result.mode, "REFERRAL_RESOLVED");
});
