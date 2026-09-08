import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const source = fs.readFileSync(path.join(process.cwd(), "src/app/api/customers/[contactId]/sales-assistant-note/route.ts"), "utf8");

test("sales assistant note route requires customer write access", () => {
  assert.match(source, /getRequestAccessContext/);
  assert.match(source, /customers\.write/);
});

test("original note is preserved and AI output becomes an internal timeline interaction", () => {
  assert.match(source, /original_note: body\.data\.note/);
  assert.match(source, /polished_note: analysis\.polishedNote/);
  assert.match(source, /direction: "internal"/);
  assert.match(source, /no_customer_contact: true/);
});

test("follow-up requires at least 90 percent confidence", () => {
  assert.match(source, /analysis\.followupConfidence >= 0\.9/);
  assert.match(source, /updates\.next_followup = followupAt/);
});

test("calendar is best effort after CRM persistence", () => {
  const saveIndex = source.indexOf('from("contacts").update(updates)');
  const calendarIndex = source.indexOf("calendar = await createGoogleFollowupEvent");
  assert.ok(saveIndex > 0);
  assert.ok(calendarIndex > saveIndex);
});

test("route does not change pipeline or send customer communication", () => {
  assert.doesNotMatch(source, /pipeline_status\s*:/);
  assert.doesNotMatch(source, /sendEmail|sendMail|email\.send/);
  assert.match(source, /pipelineChanged: false/);
  assert.match(source, /customerContactSent: false/);
});
