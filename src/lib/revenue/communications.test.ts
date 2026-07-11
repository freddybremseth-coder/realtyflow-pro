import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCommunicationWorkspace,
  buildWhatsAppCopy,
  normalizeWhatsAppNumber,
} from "./communications";

const now = new Date("2026-07-11T12:00:00.000Z");

function fixture(overrides: Record<string, any> = {}) {
  const contact = {
    id: "contact-1",
    name: "Harald Flagtvedt",
    email: "harald@example.com",
    phone: "+47 900 00 000",
    brand_id: "soleada",
    interactions: [],
    ...(overrides.contact || {}),
  };
  const profile = {
    id: "profile-1",
    brand: "soleada",
    contact_id: contact.id,
    status: "approved",
    summary: "Harald ser etter bolig i Albir",
    ...(overrides.profile || {}),
  };
  const shortlist = {
    id: "shortlist-1",
    brand: "soleada",
    buyer_profile_id: profile.id,
    status: "approved",
    ...(overrides.shortlist || {}),
  };
  const presentation = {
    id: "presentation-1",
    brand: "soleada",
    buyer_profile_id: profile.id,
    shortlist_id: shortlist.id,
    status: "approved",
    presentation_json: {
      summary: "Tre aktuelle boliger",
      sections: [
        {
          type: "properties",
          items: [
            {
              propertyId: "property-1",
              title: "Leilighet i Albir",
              publicUrl: "https://soleada.no/property/albir-1",
              questionsToVerify: [],
              concerns: [],
            },
          ],
        },
      ],
    },
    ...(overrides.presentation || {}),
  };
  const draft = {
    id: "draft-1",
    brand: "soleada",
    buyer_profile_id: profile.id,
    shortlist_id: shortlist.id,
    presentation_id: presentation.id,
    status: "draft",
    subject: "Aktuelle boliger i Albir",
    body_text: "Hei Harald,\n\nHer er boligene vi har valgt ut.",
    body_html: null,
    language: "nb",
    created_at: "2026-07-10T12:00:00.000Z",
    updated_at: "2026-07-10T12:00:00.000Z",
    ...(overrides.draft || {}),
  };
  return { contact, profile, shortlist, presentation, draft };
}

function workspace(overrides: Record<string, any> = {}) {
  const data = fixture(overrides);
  return buildCommunicationWorkspace({
    contacts: [data.contact],
    profiles: [data.profile],
    shortlists: [data.shortlist],
    presentations: [data.presentation],
    drafts: [data.draft],
    now,
  });
}

test("ready draft requires approved dependency chain, recipient and property links", () => {
  const result = workspace();
  assert.equal(result.summary.total, 1);
  assert.equal(result.summary.readyForApproval, 1);
  assert.equal(result.items[0].approvalReady, true);
  assert.deepEqual(result.items[0].approvalBlockers, []);
  assert.equal(result.items[0].priority, "HIGH");
  assert.match(result.items[0].whatsappCopy, /https:\/\/soleada\.no\/property\/albir-1/);
  assert.equal(result.safety.providerSendAvailable, false);
  assert.equal(result.safety.automaticSending, false);
});

test("draft is blocked when presentation is not approved or a property link is missing", () => {
  const result = workspace({
    presentation: {
      status: "draft",
      presentation_json: {
        sections: [{ type: "properties", items: [{ propertyId: "property-1", title: "Uten lenke" }] }],
      },
    },
  });
  assert.equal(result.items[0].approvalReady, false);
  assert.ok(result.items[0].approvalBlockers.some((value) => value.includes("Presentasjonen")));
  assert.ok(result.items[0].approvalBlockers.some((value) => value.includes("verifisert offentlig lenke")));
  assert.equal(result.summary.blockedDrafts, 1);
});

test("cross-brand contact blocks approval", () => {
  const result = workspace({ contact: { brand_id: "zeneco" } });
  assert.equal(result.items[0].approvalReady, false);
  assert.ok(result.items[0].approvalBlockers.some((value) => value.includes("annet brand")));
});

test("approved content enables manual clients but never a provider send", () => {
  const result = workspace({
    draft: {
      status: "approved",
      approved_at: "2026-07-11T10:00:00.000Z",
      approved_by: "freddy.bremseth@gmail.com",
    },
  });
  const item = result.items[0];
  assert.equal(item.manualEmailReady, true);
  assert.equal(item.manualWhatsAppReady, true);
  assert.equal(result.summary.manualEmailReady, 1);
  assert.equal(result.summary.manualWhatsAppReady, 1);
  assert.equal(result.safety.providerSendAvailable, false);
});

test("manual send logs are read from the customer timeline without changing draft status", () => {
  const result = workspace({
    contact: {
      interactions: [
        {
          action: "communication_manual_send_logged",
          date: "2026-07-11T11:00:00.000Z",
          metadata: { draft_id: "draft-1", channel: "EMAIL" },
        },
      ],
    },
    draft: {
      status: "approved",
      approved_at: "2026-07-11T10:00:00.000Z",
      approved_by: "freddy.bremseth@gmail.com",
    },
  });
  assert.equal(result.items[0].status, "APPROVED");
  assert.equal(result.items[0].manualSend.emailLoggedAt, "2026-07-11T11:00:00.000Z");
  assert.equal(result.summary.manualEmailReady, 0);
  assert.equal(result.summary.manuallyLogged, 1);
});

test("cancelled drafts are terminal in the workspace", () => {
  const result = workspace({ draft: { status: "cancelled", cancelled_at: "2026-07-11T09:00:00.000Z" } });
  assert.equal(result.items[0].status, "CANCELLED");
  assert.equal(result.items[0].approvalReady, false);
  assert.equal(result.items[0].manualEmailReady, false);
  assert.equal(result.items[0].priority, "LOW");
});

test("WhatsApp number normalization accepts international digits only", () => {
  assert.equal(normalizeWhatsAppNumber("+34 612 34 56 78"), "34612345678");
  assert.equal(normalizeWhatsAppNumber("123"), null);
});

test("WhatsApp copy appends verified links once and truncates safely", () => {
  const presentation = {
    sections: [{ type: "properties", items: [{ title: "A", publicUrl: "https://example.com/a" }] }],
  };
  const copy = buildWhatsAppCopy("Hei\n\nSe forslagene.", presentation, 200);
  assert.equal(copy.match(/https:\/\/example\.com\/a/g)?.length, 1);
  const existing = buildWhatsAppCopy("Hei https://example.com/a", presentation, 200);
  assert.equal(existing.match(/https:\/\/example\.com\/a/g)?.length, 1);
});
