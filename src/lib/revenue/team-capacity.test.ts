import assert from "node:assert/strict";
import test from "node:test";
import { buildTeamWorkload } from "./team-workload";
import { buildTeamCapacitySuggestions, responsibilityLoadByEmail } from "./team-capacity";

const now = new Date("2026-10-03T10:00:00.000Z");

const profiles: any[] = [
  { email: "busy@example.com", displayName: "Busy Sales", role: "SALES", active: true },
  { email: "light@example.com", displayName: "Light Sales", role: "SALES", active: true },
  { email: "closing@example.com", displayName: "Closing", role: "CLOSING", active: true },
];

test("responsibility load counts only active, non-expired users and active memberships", () => {
  const counts = responsibilityLoadByEmail({
    now,
    users: [
      { user_id: "u1", email: "busy@example.com", status: "active", access_expires_at: null },
      { user_id: "u2", email: "expired@example.com", status: "active", access_expires_at: "2026-10-02T00:00:00Z" },
      { user_id: "u3", email: "disabled@example.com", status: "disabled", access_expires_at: null },
    ],
    memberships: [
      { user_id: "u1", brand_id: "b1", status: "active" },
      { user_id: "u1", brand_id: "b2", status: "revoked" },
      { user_id: "u2", brand_id: "b1", status: "active" },
      { user_id: "u3", brand_id: "b1", status: "active" },
    ],
    responsibilities: [
      { user_id: "u1", brand_id: "b1", responsibilities: ["new-leads","newsletter","nexus-review"] },
      { user_id: "u1", brand_id: "b2", responsibilities: ["seo-content"] },
      { user_id: "u2", brand_id: "b1", responsibilities: ["new-leads"] },
      { user_id: "u3", brand_id: "b1", responsibilities: ["new-leads"] },
    ],
  });
  assert.deepEqual(counts, { "busy@example.com": 3 });
});

test("responsibility areas contribute to capacity even without many assigned cases", () => {
  const workspace = buildTeamWorkload({
    profiles,
    now,
    responsibilityCountsByEmail: { "busy@example.com": 6 },
  });
  const busy = workspace.members.find(member => member.email === "busy@example.com");
  assert.equal(busy?.responsibilityAreas, 6);
  assert.equal(busy?.capacityScore, 180);
  assert.equal(busy?.load, "HIGH");
});

test("safe rebalancing prefers non-critical task and lighter eligible teammate", () => {
  const workItems = Array.from({ length: 8 }, (_, index) => ({
    id: `task-${index}`,
    title: `Sales follow-up ${index}`,
    status: "TO_DO",
    priority: index === 0 ? "CRITICAL" : index === 1 ? "HIGH" : "MEDIUM",
    due_date: index === 2 ? "2026-10-02" : "2026-10-10",
    assigned_agent: "busy@example.com",
    brand_id: "soleada",
  }));
  const workspace = buildTeamWorkload({
    profiles,
    workItems,
    now,
    responsibilityCountsByEmail: {
      "busy@example.com": 4,
      "light@example.com": 1,
    },
  });
  const suggestions = buildTeamCapacitySuggestions(workspace);
  assert.equal(suggestions.length > 0, true);
  assert.equal(suggestions[0].fromEmail, "busy@example.com");
  assert.equal(suggestions[0].toEmail, "light@example.com");
  assert.notEqual(suggestions[0].resourceId, "task-0");
  assert.notEqual(suggestions[0].resourceId, "task-2");
  assert.match(suggestions[0].safety, /Owner-godkjenning/);
});

test("rebalancing never proposes negotiation, won, overdue or critical work", () => {
  const contacts = [
    {
      id: "neg",
      name: "Negotiation",
      pipeline_status: "NEGOTIATION",
      brand_id: "soleada",
      interactions: [{ action: "team_owner_assigned", date: "2026-10-01", metadata: { owner_email: "busy@example.com" } }],
    },
    {
      id: "won",
      name: "Won",
      pipeline_status: "WON",
      brand_id: "soleada",
      interactions: [{ action: "team_owner_assigned", date: "2026-10-01", metadata: { owner_email: "busy@example.com" } }],
    },
  ];
  const workItems = [
    { id: "critical", title: "Critical", status: "TO_DO", priority: "CRITICAL", assigned_agent: "busy@example.com", brand_id: "soleada" },
    { id: "overdue", title: "Overdue", status: "TO_DO", priority: "MEDIUM", due_date: "2026-10-02", assigned_agent: "busy@example.com", brand_id: "soleada" },
  ];
  const workspace = buildTeamWorkload({
    profiles,
    contacts,
    workItems,
    now,
    responsibilityCountsByEmail: { "busy@example.com": 6 },
  });
  assert.equal(workspace.members.find(member => member.email === "busy@example.com")?.load, "HIGH");
  assert.deepEqual(buildTeamCapacitySuggestions(workspace), []);
});


test("matching specialist is preferred over Owner fallback", () => {
  const workItems = Array.from({ length: 8 }, (_, index) => ({
    id: `owner-fallback-${index}`,
    title: `Sales queue ${index}`,
    status: "TO_DO",
    priority: "MEDIUM",
    due_date: "2026-10-10",
    assigned_agent: "busy@example.com",
    brand_id: "soleada",
  }));
  const workspace = buildTeamWorkload({
    profiles,
    ownerEmails: ["owner@example.com"],
    workItems,
    now,
    responsibilityCountsByEmail: {
      "busy@example.com": 4,
      "light@example.com": 1,
    },
  });
  const suggestions = buildTeamCapacitySuggestions(workspace);
  assert.equal(suggestions[0]?.toEmail, "light@example.com");
});

test("Owner remains fallback when no matching specialist is available", () => {
  const onlyBusy: any[] = [
    { email: "busy@example.com", displayName: "Busy Sales", role: "SALES", active: true },
    { email: "closing@example.com", displayName: "Closing", role: "CLOSING", active: true },
  ];
  const workItems = Array.from({ length: 8 }, (_, index) => ({
    id: `owner-only-${index}`,
    title: `Sales queue ${index}`,
    status: "TO_DO",
    priority: "MEDIUM",
    due_date: "2026-10-10",
    assigned_agent: "busy@example.com",
    brand_id: "soleada",
  }));
  const workspace = buildTeamWorkload({
    profiles: onlyBusy,
    ownerEmails: ["owner@example.com"],
    workItems,
    now,
    responsibilityCountsByEmail: { "busy@example.com": 4 },
  });
  const suggestions = buildTeamCapacitySuggestions(workspace);
  assert.equal(suggestions[0]?.toEmail, "owner@example.com");
});
