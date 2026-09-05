import assert from "node:assert/strict";
import test from "node:test";
import { assessWhatsAppReadiness } from "@/lib/nexus/whatsapp-readiness";

test("blocks inbound when required webhook configuration is missing", () => {
  const result = assessWhatsAppReadiness({});
  assert.equal(result.status, "BLOCKED");
  assert.equal(result.inboundReady, false);
  assert.deepEqual(result.missingRequired.sort(), ["app_secret", "phone_brand_map", "verify_token"].sort());
});

test("allows inbound-only operation while auto reply is disabled", () => {
  const result = assessWhatsAppReadiness({
    WHATSAPP_WEBHOOK_VERIFY_TOKEN: "verify",
    WHATSAPP_META_APP_SECRET: "secret",
    WHATSAPP_PHONE_BRAND_MAP: JSON.stringify({ "123": "soleada" }),
    WHATSAPP_AUTOREPLY_ENABLED: "false",
  });
  assert.equal(result.status, "PARTIAL");
  assert.equal(result.inboundReady, true);
  assert.equal(result.outboundReady, false);
  assert.deepEqual(result.missingRequired, []);
});

test("blocks when auto reply is enabled without outbound credentials", () => {
  const result = assessWhatsAppReadiness({
    WHATSAPP_WEBHOOK_VERIFY_TOKEN: "verify",
    WHATSAPP_META_APP_SECRET: "secret",
    WHATSAPP_PHONE_BRAND_MAP: JSON.stringify({ "123": "soleada" }),
    WHATSAPP_AUTOREPLY_ENABLED: "true",
  });
  assert.equal(result.status, "BLOCKED");
  assert.equal(result.inboundReady, true);
  assert.equal(result.outboundReady, false);
  assert.deepEqual(result.missingRequired.sort(), ["access_token", "graph_version"].sort());
});

test("reports ready when inbound and enabled outbound requirements are complete", () => {
  const result = assessWhatsAppReadiness({
    WHATSAPP_WEBHOOK_VERIFY_TOKEN: "verify",
    WHATSAPP_META_APP_SECRET: "secret",
    WHATSAPP_PHONE_BRAND_MAP: JSON.stringify({ "123": "soleada" }),
    WHATSAPP_AUTOREPLY_ENABLED: "true",
    WHATSAPP_ACCESS_TOKEN: "token",
    WHATSAPP_GRAPH_VERSION: "vXX.X",
  });
  assert.equal(result.status, "READY");
  assert.equal(result.inboundReady, true);
  assert.equal(result.outboundReady, true);
  assert.deepEqual(result.missingRequired, []);
});

test("invalid brand map blocks inbound readiness", () => {
  const result = assessWhatsAppReadiness({
    WHATSAPP_WEBHOOK_VERIFY_TOKEN: "verify",
    WHATSAPP_META_APP_SECRET: "secret",
    WHATSAPP_PHONE_BRAND_MAP: "not-json",
  });
  assert.equal(result.inboundReady, false);
  assert.ok(result.missingRequired.includes("phone_brand_map"));
});
