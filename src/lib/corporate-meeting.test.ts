import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { buildCorporateMeetingUpdate } from "@/lib/corporate-meeting";

test("ENGAGED prospect can be moved to MEETING by explicit scheduled discovery", () => {
  const result = buildCorporateMeetingUpdate({
    status: "ENGAGED",
    method: "video",
    scheduledAt: "2026-10-01T09:30:00.000Z",
    now: new Date("2026-09-27T12:00:00.000Z"),
    evidence: {},
  });

  assert.equal(result.status, "MEETING");
  assert.equal(result.next_followup, "2026-10-01T09:30:00.000Z");
  assert.equal(result.entry.method, "video");
  assert.equal(result.entry.calendar_invite_sent, false);
  assert.equal(result.entry.automated_message_sent, false);
});

test("research and contacted stages cannot skip ENGAGED into MEETING", () => {
  for (const status of ["RESEARCHED", "CONTACT_READY", "CONTACTED"]) {
    assert.throws(() => buildCorporateMeetingUpdate({
      status,
      method: "phone",
      scheduledAt: "2026-10-01T09:30:00.000Z",
      now: new Date("2026-09-27T12:00:00.000Z"),
    }), /ENGAGED/);
  }
});

test("meeting registration rejects past dates", () => {
  assert.throws(() => buildCorporateMeetingUpdate({
    status: "ENGAGED",
    method: "in_person",
    scheduledAt: "2026-09-20T09:30:00.000Z",
    now: new Date("2026-09-27T12:00:00.000Z"),
  }), /fremtiden/);
});

test("Corporate meeting endpoint remains manual and does not send or enrich", () => {
  const source = fs.readFileSync("src/app/api/corporate-homes/prospects/[id]/meeting/route.ts", "utf8");
  assert.match(source, /requireAdminApi/);
  assert.match(source, /calendar_invite_sent: false/);
  assert.match(source, /message_sent: false/);
  assert.match(source, /personal_enrichment: false/);
  assert.doesNotMatch(source, /sendEmail\s*\(|sendMessage\s*\(|createEvent\s*\(|nodemailer|gmail/i);
});
