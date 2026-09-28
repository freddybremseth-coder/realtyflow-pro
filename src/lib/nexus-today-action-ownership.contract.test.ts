import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const today = fs.readFileSync(path.join(process.cwd(), "src/app/(content)/nexus-os/today/page.tsx"), "utf8");
const priority = fs.readFileSync(path.join(process.cwd(), "src/lib/nexus-today-priority.ts"), "utf8");

test("Nexus Today never asks the user to run an automatic marketing canary", () => {
  assert.doesNotMatch(today, /RUN_NEXT_CANARY/);
  assert.doesNotMatch(today, /marketingCanary/);
  assert.doesNotMatch(today, /Kjør .*test/);
  assert.match(today, /RealtyFlow jobber automatisk/);
  assert.match(today, /Dette trenger ingen handling fra deg/);
  assert.match(today, /Køes automatisk/);
});

test("Nexus Today gets user marketing work only from HUMAN_REQUIRED actions", () => {
  assert.match(today, /action\.execution === "HUMAN_REQUIRED"/);
  assert.match(today, /humanMarketingActions/);
  assert.match(today, /Marketing · trenger deg/);
  assert.match(priority, /marketingHumanActions/);
  assert.doesNotMatch(priority, /marketing:quarantine/);
  assert.doesNotMatch(priority, /quarantined:/);
});

test("learning quarantine is presented as automatic data hygiene and not a user task", () => {
  assert.match(today, /målinger er automatisk holdt utenfor læringen/);
  assert.match(today, /Dette er statusinformasjon, ikke oppgaver til deg/);
  assert.doesNotMatch(today, /publiseringer krever kontroll/);
  assert.doesNotMatch(today, /quarantine-køen/);
});
