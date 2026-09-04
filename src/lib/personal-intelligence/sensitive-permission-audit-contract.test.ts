import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const mentorRoute = fs.readFileSync(path.join(process.cwd(), "src/app/api/personal-intelligence/mentor/route.ts"), "utf8");
const auditRoute = fs.readFileSync(path.join(process.cwd(), "src/app/api/personal-intelligence/privacy-audit/route.ts"), "utf8");
const page = fs.readFileSync(path.join(process.cwd(), "src/app/(content)/personal-intelligence/privacy/page.tsx"), "utf8");

test("sensitive and restricted mentor requests require explicit permission", () => {
  assert.match(mentorRoute, /SENSITIVE_SCOPES/);
  assert.match(mentorRoute, /explicitSensitivePermission/);
  assert.match(mentorRoute, /sensitive_context_permission_denied/);
  assert.match(mentorRoute, /sensitive_context_permission_granted/);
});

test("permission audit never stores the mentor message or sensitive content", () => {
  assert.match(mentorRoute, /sensitive_content_recorded: false/);
  assert.doesNotMatch(mentorRoute, /details:\s*\{[^}]*message/s);
  assert.doesNotMatch(mentorRoute, /details:\s*\{[^}]*content/s);
});

test("privacy audit is owner-only and read-only", () => {
  assert.match(auditRoute, /access\.role !== "OWNER"/);
  assert.match(auditRoute, /writesPerformed: 0/);
  assert.doesNotMatch(auditRoute, /\.insert\(|\.update\(|\.delete\(|\.upsert\(/);
});

test("privacy UI explains that sensitive content and hidden reasoning are not exposed", () => {
  assert.match(page, /Sensitive content recorded: no/);
  assert.match(page, /never hidden reasoning/);
});
