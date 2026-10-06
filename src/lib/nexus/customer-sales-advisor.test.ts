import assert from "node:assert/strict";
import test from "node:test";
import { buildCustomerSalesAdvice } from "./customer-sales-advisor";

test("qualified customer with approved profile advances toward matching", () => {
  const advice = buildCustomerSalesAdvice({
    contact: {
      id: "c1",
      pipeline_status: "QUALIFIED",
      email: "buyer@example.com",
      preferred_location: "Altea",
      next_followup: "2026-10-10T10:00:00Z",
      last_reply_classification: "active_interest",
    },
    activeBuyerProfile: {
      id: "p1",
      status: "approved",
      budget_amount: 500000,
    },
    criteria: [
      { key: "location", approval_status: "approved", active: true },
      { key: "property_type", approval_status: "approved", active: true },
      { key: "bedrooms", approval_status: "approved", active: true },
      { key: "other", other_key: "timeline", approval_status: "approved", active: true },
    ],
    communicationDialogue: { sentCount: 2, replyCount: 2, awaitingReply: false, messages: [] },
    now: new Date("2026-10-06T08:00:00Z"),
  });

  assert.equal(advice.stage, "QUALIFIED");
  assert.equal(advice.stageGuidance.readyToAdvance, true);
  assert.equal(advice.stageGuidance.next, "MATCHING");
  assert.match(advice.headline, /MATCHING/);
});

test("commitment ladder distinguishes confirmed criteria from internal assumptions", () => {
  const advice = buildCustomerSalesAdvice({
    contact: {
      id: "c-ladder",
      pipeline_status: "QUALIFIED",
      email: "buyer@example.com",
      preferred_location: "Altea",
      next_followup: "2026-10-10T10:00:00Z",
      last_reply_classification: "active_interest",
    },
    activeBuyerProfile: {
      id: "p-ladder",
      status: "approved",
      budget_amount: 500000,
      summary: "Kunden ønsker bolig nær sjøen.",
    },
    criteria: [
      { key: "location", approval_status: "approved", active: true, customer_confirmed: false },
      { key: "property_type", approval_status: "approved", active: true, customer_confirmed: false },
      { key: "bedrooms", approval_status: "approved", active: true, customer_confirmed: false },
      { key: "other", other_key: "timeline", approval_status: "approved", active: true, customer_confirmed: false },
    ],
    communicationDialogue: { sentCount: 2, replyCount: 2, awaitingReply: false, messages: [] },
    now: new Date("2026-10-06T08:00:00Z"),
  });

  const criteriaStep = advice.commitmentLadder.find((row) => row.id === "CRITERIA");
  assert.equal(criteriaStep?.status, "PARTIAL");
  assert.match(criteriaStep?.evidence || "", /mangler tydelig kundebekreftelse/);
  assert.equal(advice.commitmentLadder.find((row) => row.id === "COMMITMENT")?.status, "CONFIRMED");
});

test("on-hold customer is paused regardless of historic engagement", () => {
  const advice = buildCustomerSalesAdvice({
    contact: {
      id: "c2",
      pipeline_status: "ON_HOLD",
      email: "pause@example.com",
      waiting_reason: "Kunden vil vente",
      waiting_until: "2028-10-06T10:00:00Z",
      last_reply_classification: "follow_up_later",
    },
    activeBuyerProfile: { id: "p2", status: "approved", budget_amount: 800000 },
    criteria: [
      { key: "location", approval_status: "approved", active: true },
      { key: "property_type", approval_status: "approved", active: true },
      { key: "bedrooms", approval_status: "approved", active: true },
    ],
    communicationDialogue: { sentCount: 20, replyCount: 10, awaitingReply: false, messages: [] },
    now: new Date("2026-10-06T08:00:00Z"),
  });

  assert.equal(advice.priority, "PAUSED");
  assert.equal(advice.momentum, "PAUSED");
  assert.equal(advice.nextBestAction.channel, "NONE");
  assert.match(advice.nextBestAction.action, /Vent|vent/i);
});

test("contact stage does not advance without positive buying evidence", () => {
  const advice = buildCustomerSalesAdvice({
    contact: {
      id: "c-contact",
      pipeline_status: "CONTACT",
      email: "contact@example.com",
      next_followup: "2026-10-10T10:00:00Z",
      last_reply_classification: "unclear",
    },
    activeBuyerProfile: null,
    criteria: [{ key: "other", other_key: "timeline", approval_status: "approved", active: true }],
    communicationDialogue: { sentCount: 1, replyCount: 1, awaitingReply: false, messages: [] },
    now: new Date("2026-10-06T08:00:00Z"),
  });

  assert.equal(advice.stageGuidance.readyToAdvance, false);
  assert.ok(advice.stageGuidance.criteria.some((row) => row.id === "intent" && row.met === false));
});

test("awaiting reply does not recommend another automated email", () => {
  const advice = buildCustomerSalesAdvice({
    contact: {
      id: "c3",
      pipeline_status: "QUALIFIED",
      email: "buyer@example.com",
    },
    activeBuyerProfile: { id: "p3", status: "approved", budget_amount: 400000 },
    criteria: [
      { key: "location", approval_status: "approved", active: true },
      { key: "property_type", approval_status: "approved", active: true },
      { key: "bedrooms", approval_status: "approved", active: true },
    ],
    communicationDialogue: {
      sentCount: 3,
      replyCount: 1,
      awaitingReply: true,
      messages: [{ direction: "outbound", created_at: "2026-10-05T10:00:00Z", subject: "Oppfølging" }],
    },
    now: new Date("2026-10-06T08:00:00Z"),
  });

  assert.equal(advice.nextBestAction.channel, "CRM");
  assert.match(advice.nextBestAction.action, /Ikke send en ny automatisk e-post/);
});

test("qualified but incomplete buyer profile recommends discovery before matching", () => {
  const advice = buildCustomerSalesAdvice({
    contact: { id: "c4", pipeline_status: "QUALIFIED", email: "buyer@example.com" },
    activeBuyerProfile: { id: "p4", status: "draft", budget_amount: null },
    criteria: [],
    communicationDialogue: { sentCount: 1, replyCount: 1, awaitingReply: false, messages: [] },
    now: new Date("2026-10-06T08:00:00Z"),
  });

  assert.match(advice.nextBestAction.action, /Buyer Profile|kjøpskriteriene/i);
  assert.ok(advice.discoveryQuestions.length >= 3);
  assert.equal(advice.stageGuidance.readyToAdvance, false);
});

test("manual takeover is visible as a sales signal but does not disappear from CRM", () => {
  const advice = buildCustomerSalesAdvice({
    contact: {
      id: "c5",
      pipeline_status: "VIEWING",
      phone: "+341234",
      next_followup: "2026-10-08T10:00:00Z",
      last_reply_classification: "property_interest",
    },
    activeBuyerProfile: { id: "p5", status: "approved", budget_amount: 650000 },
    criteria: [
      { key: "location", approval_status: "approved", active: true },
      { key: "property_type", approval_status: "approved", active: true },
      { key: "bedrooms", approval_status: "approved", active: true },
      { key: "other", other_key: "timeline", approval_status: "approved", active: true },
    ],
    communicationDialogue: {
      sentCount: 4,
      replyCount: 4,
      manualTakeover: true,
      emailBlocked: true,
      awaitingReply: false,
      messages: [],
    },
    now: new Date("2026-10-06T08:00:00Z"),
  });

  assert.ok(advice.signals.some((signal) => /tatt over/i.test(signal)));
  assert.match(advice.guardrail, /manuell takeover/i);
});
