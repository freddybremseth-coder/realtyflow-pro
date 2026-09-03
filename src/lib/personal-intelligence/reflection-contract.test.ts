import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const runtime = fs.readFileSync(path.join(process.cwd(), "src/lib/personal-intelligence/mentor-runtime.ts"), "utf8");
const route = fs.readFileSync(path.join(process.cwd(), "src/app/api/personal-intelligence/reflect/route.ts"), "utf8");

test("Reflection endpoint remains owner-only and limited to internal/private scopes", () => {
  assert.match(route, /getRequestAccessContext/);
  assert.match(route, /access\.role !== "OWNER"/);
  assert.match(route, /body\.privacyScope === "internal" \? "internal" : "private"/);
  assert.doesNotMatch(route, /explicitSensitivePermission/);
});

test("Reflection reuses Mentor Runtime rather than a parallel AI stack", () => {
  assert.match(route, /runMentorTurn/);
  assert.match(route, /sessionType: "reflection"/);
  assert.match(route, /inputMode: "reflection"/);
  assert.match(route, /reflectionMode: true/);
});

test("raw reflection and mentor response are not persisted as messages", () => {
  assert.match(route, /persistMessages: false/);
  assert.match(route, /rawReflectionStoredInMessages: false/);
  assert.match(route, /mentorResponseStoredInMessages: false/);
  assert.match(runtime, /if \(persistMessages\)/);
  assert.match(runtime, /messages_persisted: persistMessages/);
});

test("Reflection remains evidence-aware without turning tentative patterns into diagnoses", () => {
  assert.match(runtime, /Surface possible patterns only as tentative observations/);
  assert.match(runtime, /never as personality diagnoses/);
  assert.match(runtime, /Do not force an action or productivity outcome/);
  assert.match(runtime, /memoryCandidates = await extractMemoryCandidates\(message\)/);
});

test("Reflection candidates are not persisted automatically", () => {
  assert.match(route, /memoryCandidatesPersistedAutomatically: false/);
  assert.doesNotMatch(route, /memory\/confirm/);
});
