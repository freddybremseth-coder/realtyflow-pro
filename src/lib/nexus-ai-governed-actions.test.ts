import assert from "node:assert/strict";
import test from "node:test";
import {
  buildNexusActionProposals,
  messageRequestsCustomerEmail,
  resolveNexusActionContact,
} from "@/lib/nexus-ai-governed-actions";

const HARALD = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Harald Flagtvedt",
  email: "harald@example.com",
  brand_id: "soleada",
};
const LENE = {
  id: "22222222-2222-4222-8222-222222222222",
  name: "Lene Hansen",
  email: "lene@example.com",
  brand_id: "soleada",
};

test("direct follow-up request creates one approval-required email action for current customer", () => {
  const proposals = buildNexusActionProposals({
    message: "Lag en oppfølging til denne kunden",
    currentContact: HARALD,
    contacts: [HARALD, LENE],
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
    });
    assert.equal(proposals.length, 0);
  }
});

test("advice questions do not silently become write actions", () => {
  assert.equal(messageRequestsCustomerEmail("Hvordan bør jeg følge opp denne kunden?"), false);
  assert.equal(messageRequestsCustomerEmail("Hvor finner jeg e-posthistorikken?"), false);
  assert.equal(buildNexusActionProposals({
    message: "Hvordan bør jeg følge opp denne kunden?",
    currentContact: HARALD,
    contacts: [HARALD],
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
