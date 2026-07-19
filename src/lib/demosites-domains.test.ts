import assert from "node:assert/strict";
import test from "node:test";
import {
  buildFallbackDnsRecords,
  buildSubdomainUrl,
  isReservedSubdomain,
  normalizeCustomerDomain,
} from "./demosites-domains";

test("normalizes customer domains without paths or protocols", () => {
  assert.equal(normalizeCustomerDomain("https://WWW.Bedriften.no/kontakt"), "www.bedriften.no");
  assert.equal(normalizeCustomerDomain("bedriften.no"), "bedriften.no");
});

test("rejects local, wildcard and invalid hosts", () => {
  assert.equal(normalizeCustomerDomain("localhost"), null);
  assert.equal(normalizeCustomerDomain("*.bedriften.no"), null);
  assert.equal(normalizeCustomerDomain("not a domain"), null);
});

test("recommends CNAME for www and A record for apex domains", () => {
  assert.deepEqual(buildFallbackDnsRecords("www.bedriften.no")[0], {
    type: "CNAME",
    name: "www",
    value: "cname.vercel-dns-0.com",
    purpose: "Peker kundedomenet til Vercel",
  });
  assert.equal(buildFallbackDnsRecords("bedriften.no")[0]?.type, "A");
  assert.equal(buildFallbackDnsRecords("bedriften.no")[0]?.name, "@");
});

test("protects operational ChatGenius subdomains", () => {
  assert.equal(isReservedSubdomain("realtyflow"), true);
  assert.equal(isReservedSubdomain("appointment"), true);
  assert.equal(isReservedSubdomain("kunde-eksempel"), false);
  assert.equal(buildSubdomainUrl("kunde-eksempel"), "https://kunde-eksempel.chatgenius.pro");
});
