import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const page = fs.readFileSync(path.join(process.cwd(), "src/app/(content)/personal-intelligence/page.tsx"), "utf8");
const nexusLayout = fs.readFileSync(path.join(process.cwd(), "src/app/(content)/nexus-os/layout.tsx"), "utf8");

test("private alpha bootstraps the canonical subject and uses the owner-only mentor route", () => {
  assert.match(page, /\/api\/personal-intelligence\/bootstrap/);
  assert.match(page, /\/api\/personal-intelligence\/mentor/);
  assert.match(page, /subjectEntityId: subject\.id/);
  assert.match(page, /credentials: "same-origin"/);
});

test("Think Deeper changes reasoning depth without exposing sensitive scopes in the alpha UI", () => {
  assert.match(page, /Think Deeper/);
  assert.match(page, /thinkDeeper,/);
  assert.match(page, /useState<"internal" \| "private">\("private"\)/);
  assert.doesNotMatch(page, /setPrivacyScope\("sensitive"\)/);
  assert.doesNotMatch(page, /setPrivacyScope\("restricted"\)/);
});

test("context transparency shows only returned claims and goals, not hidden reasoning", () => {
  assert.match(page, /Hvorfor dette\?/);
  assert.match(page, /contextSummary\.claimsUsed/);
  assert.match(page, /contextSummary\.goalsUsed/);
  assert.match(page, /Privacy scope tillot/);
});

test("memory candidates require an explicit UI choice before persistence", () => {
  assert.match(page, /\/api\/personal-intelligence\/memory\/confirm/);
  assert.match(page, /Husk/);
  assert.match(page, /Privat/);
  assert.match(page, /Dropp/);
  assert.match(page, /candidate\.persistence === "CONFIRM" \|\| candidate\.persistence === "AUTO"/);
});

test("Nexus navigation exposes the private mentor without moving Personal Intelligence into Nexus ownership", () => {
  assert.match(nexusLayout, /href: "\/personal-intelligence", label: "Mentor"/);
  assert.match(page, /Personal Intelligence/);
});
