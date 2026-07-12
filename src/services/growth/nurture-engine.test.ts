import assert from "node:assert/strict";
import test from "node:test";
import { buildNurtureRevenueEventInput } from "@/services/growth/nurture-engine";
import type { NurtureSequence, NurtureStep } from "@/services/growth/nurture-sequences";

const sequence: NurtureSequence = {
  id: "zeneco-buyer-v1",
  brandId: "zeneco",
  brandName: "Zen Eco Homes",
  advisor: "Freddy Bremseth",
  bookingUrl: "https://appointment.chatgenius.pro/zeneco",
  mode: "welcome",
  eligibleStatuses: ["NEW", "CONTACT", ""],
  steps: [],
};

const reactivationSequence: NurtureSequence = {
  ...sequence,
  id: "soleada-reactivation-v1",
  brandId: "soleada",
  brandName: "Soleada.no",
  mode: "reactivation",
  sendBrandId: "zeneco",
};

const step: NurtureStep = {
  id: "welcome",
  dayOffset: 0,
  channel: "email",
  subject: "Takk, {name}",
  text: "Hei {name}",
};

test("buildNurtureRevenueEventInput creates a deduped automation event", () => {
  const event = buildNurtureRevenueEventInput({
    contact: {
      id: "contact-123",
      email: "buyer@example.com",
      source: "zenecohomes-public",
      pipeline_status: "NEW",
      property_interest: "Costa Blanca",
    },
    sequence,
    step,
    brandId: "zeneco",
    subject: "Takk, Anna – ett råd før du ser på boliger",
    bodyPreview: "Hei Anna, takk for at du tok kontakt.",
    sentAt: "2026-07-12T12:00:00.000Z",
    previousPipelineStatus: "NEW",
  });

  assert.equal(event.eventType, "nurture_step_sent");
  assert.equal(event.title, "Nurture sendt: Takk, Anna – ett råd før du ser på boliger");
  assert.equal(event.contactId, "contact-123");
  assert.equal(event.brandId, "zeneco");
  assert.equal(event.sourceSystem, "lead_nurture");
  assert.equal(event.sourceType, "welcome");
  assert.equal(event.sourceId, "zeneco-buyer-v1:welcome");
  assert.equal(event.actorType, "automation");
  assert.equal(event.confidenceScore, 72);
  assert.equal(event.occurredAt, "2026-07-12T12:00:00.000Z");
  assert.equal(event.dedupeKey, "lead_nurture:contact-123:zeneco-buyer-v1:welcome");
  assert.equal(event.createdBy, "services/growth/nurture-engine");
  assert.deepEqual(event.metadata, {
    email: "buyer@example.com",
    source: "zenecohomes-public",
    property_interest: "Costa Blanca",
    sequence_id: "zeneco-buyer-v1",
    step_id: "welcome",
    sequence_mode: "welcome",
    channel: "email",
    subject: "Takk, Anna – ett råd før du ser på boliger",
    body_preview: "Hei Anna, takk for at du tok kontakt.",
    dry_run: false,
    send_brand_id: "zeneco",
    previous_pipeline_status: "NEW",
  });
});

test("buildNurtureRevenueEventInput marks reactivation sends with stronger confidence", () => {
  const event = buildNurtureRevenueEventInput({
    contact: { id: "contact-456", email: "old@example.com" },
    sequence: reactivationSequence,
    step: { ...step, id: "reconnect" },
    brandId: "soleada",
    subject: "Er du fortsatt på jakt etter bolig i Spania?",
    bodyPreview: "Vi var i kontakt via Soleada.no.",
    sentAt: "2026-07-12T13:00:00.000Z",
  });

  assert.equal(event.sourceType, "reactivation");
  assert.equal(event.confidenceScore, 78);
  assert.equal(event.dedupeKey, "lead_nurture:contact-456:soleada-reactivation-v1:reconnect");
  assert.equal((event.metadata as Record<string, unknown>).send_brand_id, "zeneco");
});
