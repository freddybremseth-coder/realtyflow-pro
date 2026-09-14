import assert from "node:assert/strict";
import test from "node:test";
import {
  buildNexusActionProposals,
  messageRequestsCustomerEmail,
  messageRequestsFollowupSchedule,
  parseFollowupDate,
  resolveNexusActionContact,
} from "@/lib/nexus-ai-governed-actions";

const HARALD = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Harald Flagtvedt",
  email: "harald@example.com",
  brand_id: "soleada",
  pipeline_status: "QUALIFIED",
};
const LENE = {
  id: "22222222-2222-4222-8222-222222222222",
  name: "Lene Hansen",
  email: "lene@example.com",
  brand_id: "soleada",
  pipeline_status: "NEW",
};
const NOW = new Date("2026-09-14T12:00:00.000Z");

test("direct follow-up request creates one approval-required email action for current customer", () => {
  const proposals = buildNexusActionProposals({
    message: "Lag en oppfølging til denne kunden",
    currentContact: HARALD,
    contacts: [HARALD, LENE],
    now: NOW,
  });
  assert.equal(proposals.length, 1);
  assert.equal(proposals[0].type, "prepare_customer_email");
  assert.equal(proposals[0].contactId, HARALD.id);
  assert.equal(proposals[0].requiresApproval, true);
  assert.equal(proposals[0].endpoint, "/api/nexus/actions");
  assert.match(proposals[0].id, /^nexus_action_[a-f0-9]{24}$/);
  assert.equal(messageRequestsCustomerEmail("Følg opp Harald med en e-post"), true);
});

test("explicit unique customer name wins over current page context", () => {
  const contact = resolveNexusActionContact({
    message: "Skriv mail til Harald",
    currentContact: LENE,
    contacts: [HARALD, LENE],
  });
  assert.equal(contact?.id, HARALD.id);
});

test("unresolved explicit target never falls back to the open customer page", () => {
  const contact = resolveNexusActionContact({
    message: "Skriv mail til Knut",
    currentContact: LENE,
    contacts: [HARALD, LENE],
  });
  assert.equal(contact, null);
});

test("suppressed and do-not-contact customers never get a proposed send action", () => {
  for (const blocked of [
    { ...HARALD, email_suppressed: true },
    { ...HARALD, do_not_contact: true },
    { ...HARALD, email: null },
  ]) {
    const proposals = buildNexusActionProposals({
      message: "Lag oppfølging til Harald",
      currentContact: blocked,
      contacts: [blocked],
      now: NOW,
    });
    assert.equal(proposals.length, 0);
  }
});

test("advice questions do not silently become write actions", () => {
  assert.equal(messageRequestsCustomerEmail("Hvordan bør jeg følge opp denne kunden?"), false);
  assert.equal(messageRequestsCustomerEmail("Hvor finner jeg e-posthistorikken?"), false);
  assert.equal(messageRequestsFollowupSchedule("Hvordan bør jeg planlegge oppfølging?"), false);
  assert.equal(buildNexusActionProposals({
    message: "Hvordan bør jeg følge opp denne kunden?",
    currentContact: HARALD,
    contacts: [HARALD],
    now: NOW,
  }).length, 0);
});

test("ambiguous customer name fails closed instead of choosing one", () => {
  const secondHarald = {
    id: "33333333-3333-4333-8333-333333333333",
    name: "Harald Olsen",
    email: "harald.olsen@example.com",
  };
  const contact = resolveNexusActionContact({
    message: "Skriv e-post til Harald",
    contacts: [HARALD, secondHarald],
  });
  assert.equal(contact, null);
});

test("follow-up date parser handles deterministic relative and absolute dates", () => {
  assert.equal(parseFollowupDate("Planlegg oppfølging i morgen", NOW), "2026-09-15T09:00:00.000Z");
  assert.equal(parseFollowupDate("Planlegg oppfølging om 3 dager", NOW), "2026-09-17T09:00:00.000Z");
  assert.equal(parseFollowupDate("Planlegg oppfølging om 2 uker", NOW), "2026-09-28T09:00:00.000Z");
  assert.equal(parseFollowupDate("Planlegg oppfølging neste fredag", NOW), "2026-09-18T09:00:00.000Z");
  assert.equal(parseFollowupDate("Planlegg oppfølging 20.09.2026", NOW), "2026-09-20T09:00:00.000Z");
  assert.equal(parseFollowupDate("Planlegg oppfølging 20 september", NOW), "2026-09-20T09:00:00.000Z");
  assert.equal(parseFollowupDate("Planlegg oppfølging senere", NOW), null);
  assert.equal(
    parseFollowupDate("Planlegg oppfølging om 3 dager", new Date("2026-09-29T12:00:00.000Z")),
    "2026-10-02T09:00:00.000Z",
  );
});

test("explicit schedule request creates a no-send internal CRM action", () => {
  const proposals = buildNexusActionProposals({
    message: "Planlegg oppfølging med Harald i morgen",
    currentContact: LENE,
    contacts: [HARALD, LENE],
    now: NOW,
  });
  assert.equal(proposals.length, 1);
  assert.equal(proposals[0].type, "schedule_customer_followup");
  assert.equal(proposals[0].contactId, HARALD.id);
  assert.equal(proposals[0].scheduledFor, "2026-09-15T09:00:00.000Z");
  assert.equal(proposals[0].requiresApproval, false);
  assert.match(proposals[0].description, /Ingen melding sendes/);
  assert.match(proposals[0].id, /^nexus_action_[a-f0-9]{24}$/);
});

test("follow-up scheduling can work without email but remains contact-safe", () => {
  const noEmail = { ...HARALD, email: null };
  const proposals = buildNexusActionProposals({
    message: "Sett oppfølging med Harald om 3 dager",
    currentContact: noEmail,
    contacts: [noEmail],
    now: NOW,
  });
  assert.equal(proposals.length, 1);
  assert.equal(proposals[0].type, "schedule_customer_followup");

  for (const blocked of [
    { ...noEmail, email_suppressed: true },
    { ...noEmail, do_not_contact: true },
  ]) {
    assert.equal(buildNexusActionProposals({
      message: "Sett oppfølging med Harald om 3 dager",
      currentContact: blocked,
      contacts: [blocked],
      now: NOW,
    }).length, 0);
  }
});

test("terminal customers and unresolved explicit targets do not get scheduled", () => {
  for (const terminal of ["WON", "LOST"]) {
    const contact = { ...HARALD, pipeline_status: terminal };
    assert.equal(buildNexusActionProposals({
      message: "Planlegg oppfølging med Harald i morgen",
      currentContact: contact,
      contacts: [contact],
      now: NOW,
    }).length, 0);
  }

  for (const message of [
    "Planlegg oppfølging til Knut i morgen",
    "Planlegg oppfølging med Knut i morgen",
  ]) {
    assert.equal(buildNexusActionProposals({
      message,
      currentContact: LENE,
      contacts: [HARALD, LENE],
      now: NOW,
    }).length, 0);
  }
});
