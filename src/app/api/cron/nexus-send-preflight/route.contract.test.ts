import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const source = fs.readFileSync(path.join(process.cwd(), "src/app/api/cron/nexus-send-preflight/route.ts"), "utf8");

test("send preflight is read-only toward the customer and never grants send permission", () => {
  assert.match(source, /runNexusSendPreflight/);
  assert.match(source, /presentation_customer_send_allowed:\s*false/);
  assert.match(source, /send_preflight_revalidate_at_send:\s*true/);
  assert.match(source, /provider_send:\s*false/);
  assert.doesNotMatch(source, /sendBrandEmail/);
  assert.doesNotMatch(source, /sendEmail\s*\(/);
});

test("blocked preflight stays eligible for automatic recheck while READY completes the check", () => {
  assert.match(source, /presentation_send_preflight_required:\s*assessment\.ready\s*\?\s*false\s*:\s*true/);
  assert.match(source, /send_preflight_status:\s*assessment\.status/);
  assert.match(source, /send_preflight_blockers/);
});
