import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const routePath = fileURLToPath(new URL("../../app/api/os/status/route.ts", import.meta.url));

async function source() {
  return readFile(routePath, "utf8");
}

test("OS status evaluates WhatsApp readiness canonically", async () => {
  const text = await source();
  assert.match(text, /assessWhatsAppReadiness/);
  assert.match(text, /whatsappReadiness = assessWhatsAppReadiness\(process\.env\)/);
});

test("blocked WhatsApp inbound becomes a high operational attention signal", async () => {
  const text = await source();
  assert.match(text, /id: "whatsapp:inbound-blocked"/);
  assert.match(text, /severity: "high"/);
  assert.match(text, /score: 96/);
  assert.match(text, /WhatsApp lead capture is blocked/);
});

test("partial inbound-ready state remains a low alert rather than blocking sales attention", async () => {
  const text = await source();
  assert.match(text, /id: "whatsapp:inbound-ready-autoreply-off"/);
  assert.match(text, /severity: "low"/);
  assert.match(text, /score: 42/);
  assert.match(text, /Automatic replies remain intentionally disabled/);
});

test("OS status exposes readiness metadata without secret values", async () => {
  const text = await source();
  assert.match(text, /missingRequired: whatsappReadiness\.missingRequired/);
  assert.match(text, /missingOptional: whatsappReadiness\.missingOptional/);
  assert.doesNotMatch(text, /WHATSAPP_ACCESS_TOKEN\s*:/);
  assert.doesNotMatch(text, /WHATSAPP_META_APP_SECRET\s*:/);
});
