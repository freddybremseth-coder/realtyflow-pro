import assert from "node:assert/strict";
import test from "node:test";
import { buildPipelineHealthSnapshot } from "./pipeline-health";

const now = new Date("2026-09-13T10:00:00.000Z");

function contact(id: string, stage: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    name: `Lead ${id}`,
    email: `${id}@example.com`,
    brand_id: "zeneco",
    pipeline_status: stage,
    pipeline_value: 500000,
    updated_at: "2026-09-13T09:00:00.000Z",
    ...extra,
  };
}

function profile(id: string, contactId: string, status = "approved") {
  return { id, contact_id: contactId, status, updated_at: "2026-09-13T09:10:00.000Z" };
}

test("qualified lead without Buyer Profile is a visible blocker", () => {
  const snapshot = buildPipelineHealthSnapshot({ contacts: [contact("c1", "QUALIFIED")], now });
  assert.equal(snapshot.leads[0].reasonCode, "MISSING_BUYER_PROFILE");
  assert.equal(snapshot.summary.blocked, 1);
  assert.equal(snapshot.summary.humanReview, 0);
  assert.equal(snapshot.safety.readOnly, true);
});

test("approved profile without matching output enters Nexus automation queue", () => {
  const snapshot = buildPipelineHealthSnapshot({
    contacts: [contact("c1", "QUALIFIED")],
    buyerProfiles: [profile("p1", "c1")],
    now,
  });
  assert.equal(snapshot.leads[0].reasonCode, "MATCHING_PENDING");
  assert.equal(snapshot.leads[0].owner, "NEXUS");
  assert.equal(snapshot.summary.automationQueue, 1);
});

test("zero property matches becomes a human-visible no-match blocker", () => {
  const snapshot = buildPipelineHealthSnapshot({
    contacts: [contact("c1", "QUALIFIED")],
    buyerProfiles: [profile("p1", "c1")],
    workItems: [{
      id: "w1",
      status: "TO_DO",
      source_id: "c1",
      updated_at: "2026-09-13T09:30:00.000Z",
      metadata: { contact_id: "c1", buyer_profile_id: "p1", property_match_prepared_at: "2026-09-13T09:20:00.000Z", property_match_count: 0 },
    }],
    now,
  });
  assert.equal(snapshot.leads[0].reasonCode, "NO_MATCHES");
  assert.equal(snapshot.summary.blocked, 1);
});

test("unclear customer reply takes precedence and is sent to Freddy review", () => {
  const snapshot = buildPipelineHealthSnapshot({
    contacts: [contact("c1", "CONTACT", { last_reply_classification: "unclear" })],
    workItems: [{
      id: "w1",
      status: "REVIEW",
      source_id: "c1",
      updated_at: "2026-09-13T09:40:00.000Z",
      metadata: { contact_id: "c1", classification: "unclear" },
    }],
    now,
  });
  assert.equal(snapshot.leads[0].reasonCode, "UNCLEAR_REPLY_REVIEW");
  assert.equal(snapshot.leads[0].owner, "FREDDY");
  assert.equal(snapshot.summary.humanReview, 1);
});

test("approved recommendation with ready preflight is ready for controlled send", () => {
  const snapshot = buildPipelineHealthSnapshot({
    contacts: [contact("c1", "MATCHING")],
    buyerProfiles: [profile("p1", "c1")],
    shortlists: [{ id: "s1", buyer_profile_id: "p1", status: "approved", approved_at: "2026-09-13T08:00:00.000Z", updated_at: "2026-09-13T08:00:00.000Z" }],
    presentations: [{ id: "x1", buyer_profile_id: "p1", shortlist_id: "s1", status: "approved", approved_at: "2026-09-13T08:20:00.000Z", updated_at: "2026-09-13T08:20:00.000Z" }],
    messageDrafts: [{ id: "d1", presentation_id: "x1", status: "approved", approved_at: "2026-09-13T08:30:00.000Z", updated_at: "2026-09-13T08:30:00.000Z" }],
    workItems: [{
      id: "w1",
      status: "TO_DO",
      source_id: "c1",
      updated_at: "2026-09-13T09:00:00.000Z",
      metadata: {
        contact_id: "c1",
        buyer_profile_id: "p1",
        presentation_human_approved_at: "2026-09-13T08:25:00.000Z",
        presentation_human_approved_by: "freddy@example.com",
        send_preflight_status: "READY",
        send_preflight_ready: true,
        property_recommendation_auto_send_authorized: true,
      },
    }],
    now,
  });
  assert.equal(snapshot.leads[0].reasonCode, "READY_TO_SEND");
  assert.equal(snapshot.summary.readyToSend, 1);
  assert.equal(snapshot.leads[0].owner, "NEXUS");
});

test("fresh customer reply after sent receipt is escalated for follow-up", () => {
  const snapshot = buildPipelineHealthSnapshot({
    contacts: [contact("c1", "MATCHING", { last_inbound_reply_at: "2026-09-13T09:30:00.000Z", last_reply_classification: "property_interest" })],
    buyerProfiles: [profile("p1", "c1")],
    shortlists: [{ id: "s1", buyer_profile_id: "p1", status: "approved", approved_at: "2026-09-13T08:00:00.000Z", updated_at: "2026-09-13T08:00:00.000Z" }],
    presentations: [{ id: "x1", buyer_profile_id: "p1", status: "approved", approved_at: "2026-09-13T08:10:00.000Z", updated_at: "2026-09-13T08:10:00.000Z" }],
    messageDrafts: [{ id: "d1", presentation_id: "x1", status: "sent", sent_at: "2026-09-13T09:00:00.000Z", updated_at: "2026-09-13T09:00:00.000Z" }],
    sendReceipts: [{ id: "r1", message_draft_id: "d1", status: "sent", sent_at: "2026-09-13T09:00:00.000Z" }],
    now,
  });
  assert.equal(snapshot.leads[0].reasonCode, "CUSTOMER_REPLY_NEEDS_ACTION");
  assert.equal(snapshot.leads[0].hotLead, true);
  assert.equal(snapshot.summary.humanReview, 1);
});

test("brand and pipeline rollups make bottlenecks measurable", () => {
  const snapshot = buildPipelineHealthSnapshot({
    contacts: [
      contact("c1", "QUALIFIED"),
      contact("c2", "CONTACT", { brand_id: "soleada" }),
      contact("c3", "LOST"),
    ],
    now,
  });
  assert.equal(snapshot.summary.activeLeads, 2);
  assert.deepEqual(snapshot.byPipelineStage, [{ stage: "CONTACT", count: 1 }, { stage: "QUALIFIED", count: 1 }]);
  assert.equal(snapshot.byBrand.find((row) => row.brand === "zeneco")?.activeLeads, 1);
  assert.equal(snapshot.byBrand.find((row) => row.brand === "soleada")?.activeLeads, 1);
  assert.equal(snapshot.bottlenecks.some((row) => row.code === "MISSING_BUYER_PROFILE" && row.count === 1), true);
});
