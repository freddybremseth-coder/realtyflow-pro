import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const page = fs.readFileSync(path.join(process.cwd(), "src/app/(content)/personal-intelligence/page.tsx"), "utf8");
const nexusLayout = fs.readFileSync(path.join(process.cwd(), "src/app/(content)/nexus-os/layout.tsx"), "utf8");

test("private alpha uses owner-only bootstrap, TODAY and mentor routes", () => {
  assert.match(page, /\/api\/personal-intelligence\/bootstrap/);
  assert.match(page, /\/api\/personal-intelligence\/today/);
  assert.match(page, /\/api\/personal-intelligence\/mentor/);
  assert.match(page, /credentials: "same-origin"/);
  assert.match(page, /subjectEntityId: subject\.id/);
});

test("Think Deeper never enables sensitive or restricted scopes in Alpha UI", () => {
  assert.match(page, /Think Deeper/);
  assert.match(page, /useState<"internal" \| "private">\("private"\)/);
  assert.doesNotMatch(page, /setPrivacyScope\("sensitive"\)/);
  assert.doesNotMatch(page, /setPrivacyScope\("restricted"\)/);
});

test("TODAY shows one thing, learning and continuation from server snapshot", () => {
  assert.match(page, /ONE THING/);
  assert.match(page, /WORTH KNOWING/);
  assert.match(page, /CONTINUE/);
  assert.match(page, /today\?\.oneThing/);
  assert.match(page, /today\?\.learning/);
});

test("context transparency exposes returned context rather than hidden reasoning", () => {
  assert.match(page, /Hvorfor dette\?/);
  assert.match(page, /contextSummary\.claimsUsed/);
  assert.match(page, /contextSummary\.goalsUsed/);
  assert.match(page, /Privacy scope/);
});

test("memory candidates require explicit remember/private/drop choice", () => {
  assert.match(page, /\/api\/personal-intelligence\/memory\/confirm/);
  assert.match(page, /candidate\.persistence === "CONFIRM" \|\| candidate\.persistence === "AUTO"/);
  assert.match(page, /Husk/);
  assert.match(page, /Privat/);
  assert.match(page, /Dropp/);
});

test("Nexus links to Mentor while Personal Intelligence remains a separate route", () => {
  assert.match(nexusLayout, /href: "\/personal-intelligence", label: "Mentor"/);
  assert.match(page, /Personal Intelligence/);
});
