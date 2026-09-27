import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { decideCorporateInboundTransition } from "@/services/email/corporate-inbound-engagement";

test("a real commercial reply moves CONTACTED to ENGAGED", () => {
  const decision = decideCorporateInboundTransition({
    status: "CONTACTED",
    intent: "question",
    terminalAutoAllowed: false,
  });
  assert.equal(decision.nextStatus, "ENGAGED");
  assert.equal(decision.shouldUpdate, true);
});

test("unclear reply never creates Corporate engagement automatically", () => {
  const decision = decideCorporateInboundTransition({
    status: "CONTACTED",
    intent: "unclear",
    terminalAutoAllowed: false,
  });
  assert.equal(decision.nextStatus, "CONTACTED");
  assert.equal(decision.shouldUpdate, false);
});

test("explicit DNC disqualifies an active Corporate prospect", () => {
  const decision = decideCorporateInboundTransition({
    status: "ENGAGED",
    intent: "do_not_contact",
    terminalAutoAllowed: true,
  });
  assert.equal(decision.nextStatus, "DISQUALIFIED");
  assert.equal(decision.shouldUpdate, true);
});

test("terminal outcome requires governance approval before Corporate disqualification", () => {
  const blocked = decideCorporateInboundTransition({
    status: "CONTACTED",
    intent: "no_longer_buying",
    terminalAutoAllowed: false,
  });
  assert.equal(blocked.nextStatus, "CONTACTED");
  assert.equal(blocked.shouldUpdate, false);

  const allowed = decideCorporateInboundTransition({
    status: "CONTACTED",
    intent: "no_longer_buying",
    terminalAutoAllowed: true,
  });
  assert.equal(allowed.nextStatus, "DISQUALIFIED");
  assert.equal(allowed.shouldUpdate, true);
});

test("higher Corporate stages never regress to ENGAGED", () => {
  const decision = decideCorporateInboundTransition({
    status: "MEETING",
    intent: "active_interest",
    terminalAutoAllowed: true,
  });
  assert.equal(decision.nextStatus, "MEETING");
  assert.equal(decision.shouldUpdate, false);
});

test("research-only prospects cannot skip the explicit manual-contact step", () => {
  const decision = decideCorporateInboundTransition({
    status: "RESEARCHED",
    intent: "active_interest",
    terminalAutoAllowed: true,
  });
  assert.equal(decision.nextStatus, "RESEARCHED");
  assert.equal(decision.shouldUpdate, false);
});

test("Corporate inbound bridge uses exact existing linkage and stores no new personal enrichment", () => {
  const source = fs.readFileSync("src/services/email/corporate-inbound-engagement.ts", "utf8");
  assert.match(source, /converted_contact_id/);
  assert.match(source, /generic_company_contact/);
  assert.match(source, /generic_email/);
  assert.match(source, /matches\.length !== 1/);
  assert.match(source, /personal_data_enriched: false/);
  assert.match(source, /automated_reply_sent: false/);
  assert.doesNotMatch(source, /sendEmail\s*\(|sendMessage\s*\(|nodemailer|gmail/i);
});
