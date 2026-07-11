import assert from "node:assert/strict";
import test from "node:test";
import { approvalSummary, buildApprovalQueue } from "./approvals";

const NOW = new Date("2026-07-11T12:00:00.000Z");

function input(overrides: Partial<Parameters<typeof buildApprovalQueue>[0]> = {}) {
  return {
    contacts: [{ id: "c1", name: "Harald Buyer", email: "harald@example.com" }],
    profiles: [{ id: "p1", contact_id: "c1", brand: "soleada", status: "approved", summary: "Albir apartment", created_at: "2026-07-01T12:00:00.000Z" }],
    shortlists: [{ id: "s1", buyer_profile_id: "p1", brand: "soleada", status: "approved", title: "Albir shortlist", created_at: "2026-07-02T12:00:00.000Z" }],
    presentations: [{ id: "pr1", buyer_profile_id: "p1", shortlist_id: "s1", brand: "soleada", status: "approved", title: "Harald presentation", created_at: "2026-07-03T12:00:00.000Z" }],
    messageDrafts: [{ id: "d1", buyer_profile_id: "p1", shortlist_id: "s1", presentation_id: "pr1", brand: "soleada", status: "draft", subject: "Boligforslag i Albir", created_at: "2026-07-04T12:00:00.000Z" }],
    ...overrides,
  };
}

test("marks message draft ready only when its approval chain is approved", () => {
  const items = buildApprovalQueue(input(), NOW);
  assert.equal(items.length, 1);
  assert.equal(items[0].type, "message_draft");
  assert.equal(items[0].ready, true);
  assert.equal(items[0].customerName, "Harald Buyer");
  assert.equal(items[0].brandId, "soleada");
});

test("blocks presentation until shortlist is approved", () => {
  const data = input({
    shortlists: [{ id: "s1", buyer_profile_id: "p1", brand: "soleada", status: "draft", title: "Albir shortlist", created_at: "2026-07-02T12:00:00.000Z" }],
    presentations: [{ id: "pr1", buyer_profile_id: "p1", shortlist_id: "s1", brand: "soleada", status: "draft", title: "Harald presentation", created_at: "2026-07-03T12:00:00.000Z" }],
    messageDrafts: [],
  });
  const items = buildApprovalQueue(data, NOW);
  const presentation = items.find((item) => item.type === "presentation");
  assert.ok(presentation);
  assert.equal(presentation.ready, false);
  assert.match(presentation.blocker || "", /Shortlisten/);
});

test("draft buyer profile is ready and sorted before blocked downstream items", () => {
  const data = input({
    profiles: [{ id: "p1", contact_id: "c1", brand: "soleada", status: "draft", summary: "Albir apartment", created_at: "2026-07-01T12:00:00.000Z" }],
    shortlists: [{ id: "s1", buyer_profile_id: "p1", brand: "soleada", status: "draft", title: "Albir shortlist", created_at: "2026-07-02T12:00:00.000Z" }],
    presentations: [],
    messageDrafts: [],
  });
  const items = buildApprovalQueue(data, NOW);
  assert.equal(items[0].type, "buyer_profile");
  assert.equal(items[0].ready, true);
  assert.equal(items[1].ready, false);
});

test("summary counts ready and blocked work", () => {
  const data = input({
    profiles: [{ id: "p1", contact_id: "c1", brand: "soleada", status: "draft", summary: "Albir apartment", created_at: "2026-07-01T12:00:00.000Z" }],
    shortlists: [{ id: "s1", buyer_profile_id: "p1", brand: "soleada", status: "draft", created_at: "2026-07-02T12:00:00.000Z" }],
    presentations: [],
    messageDrafts: [],
  });
  const summary = approvalSummary(buildApprovalQueue(data, NOW));
  assert.deepEqual(summary, { pending: 2, ready: 1, blocked: 1, profiles: 1, shortlists: 1, presentations: 0, messageDrafts: 0 });
});
