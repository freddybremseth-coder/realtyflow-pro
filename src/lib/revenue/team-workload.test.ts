import assert from "node:assert/strict";
import test from "node:test";
import { buildTeamWorkload } from "./team-workload";

const profiles: any[] = [
  { email: "sales@example.com", displayName: "Sara Sales", role: "SALES", active: true, createdAt: null, updatedAt: null, updatedBy: null },
  { email: "closing@example.com", displayName: "Clara Closing", role: "CLOSING", active: true, createdAt: null, updatedAt: null, updatedBy: null },
  { email: "inactive@example.com", displayName: "Inactive", role: "FINANCE", active: false, createdAt: null, updatedAt: null, updatedBy: null },
];

const now = new Date("2026-07-11T12:00:00.000Z");

test("latest contact ownership event wins and keeps audit history", () => {
  const workspace = buildTeamWorkload({
    ownerEmails: ["freddy.bremseth@gmail.com"],
    profiles,
    now,
    contacts: [{
      id: "c1",
      name: "Negotiation Buyer",
      brand_id: "soleada",
      pipeline_status: "NEGOTIATION",
      next_followup: "2026-07-10",
      pipeline_value: 600000,
      interactions: [
        { action: "team_owner_assigned", date: "2026-07-01T10:00:00Z", metadata: { owner_email: "sales@example.com" } },
        { action: "team_owner_assigned", date: "2026-07-05T10:00:00Z", metadata: { owner_email: "closing@example.com" } },
      ],
    }],
  });
  const item = workspace.items[0];
  assert.equal(item.ownerEmail, "closing@example.com");
  assert.equal(item.ownerRole, "CLOSING");
  assert.equal(item.overdue, true);
  assert.equal(item.priority, "CRITICAL");
  assert.deepEqual(item.recommendedRoles, ["CLOSING", "OWNER"]);
});

test("unassign event removes contact owner", () => {
  const workspace = buildTeamWorkload({
    profiles,
    now,
    contacts: [{
      id: "c2",
      name: "Unassigned Lead",
      brand: "zeneco",
      pipeline_status: "QUALIFIED",
      interactions: [
        { action: "team_owner_assigned", date: "2026-07-01", metadata: { owner_email: "sales@example.com" } },
        { action: "team_owner_unassigned", date: "2026-07-02", metadata: {} },
      ],
    }],
  });
  assert.equal(workspace.items[0].ownerEmail, null);
  assert.equal(workspace.summary.unassignedContacts, 1);
});

test("task assignment only counts active exact email profiles", () => {
  const workspace = buildTeamWorkload({
    profiles,
    now,
    workItems: [
      { id: "t1", title: "Prepare closing", status: "TO_DO", priority: "HIGH", due_date: "2026-07-09", assigned_agent: "closing@example.com", brand_id: "soleada" },
      { id: "t2", title: "Generic sales bucket", status: "IN_PROGRESS", assigned_agent: "sales", brand_id: "soleada" },
      { id: "t3", title: "Inactive owner", status: "REVIEW", assigned_agent: "inactive@example.com", brand_id: "soleada" },
      { id: "t4", title: "Done", status: "DONE", assigned_agent: "sales@example.com" },
    ],
  });
  assert.equal(workspace.items.length, 3);
  assert.equal(workspace.items.find((item) => item.resourceId === "t1")?.ownerEmail, "closing@example.com");
  assert.equal(workspace.items.find((item) => item.resourceId === "t2")?.assignmentSource, "UNASSIGNED");
  assert.equal(workspace.items.find((item) => item.resourceId === "t3")?.assignmentSource, "LEGACY");
  assert.equal(workspace.summary.unassignedTasks, 2);
  assert.match(workspace.warnings.join(" "), /1 eksisterende tildelinger/);
});

test("workload summary separates contacts tasks and overload", () => {
  const contacts = Array.from({ length: 5 }, (_, index) => ({
    id: `c${index}`,
    name: `Lead ${index}`,
    brand_id: "soleada",
    pipeline_status: index < 2 ? "NEGOTIATION" : "QUALIFIED",
    next_followup: "2026-07-10",
    interactions: [{ action: "team_owner_assigned", date: "2026-07-01", metadata: { owner_email: "sales@example.com" } }],
  }));
  const workspace = buildTeamWorkload({ profiles, contacts, now });
  const sales = workspace.members.find((member) => member.email === "sales@example.com");
  assert.equal(sales?.contacts, 5);
  assert.equal(sales?.tasks, 0);
  assert.equal(sales?.load, "HIGH");
  assert.equal(workspace.members.some((member) => member.email === "inactive@example.com"), false);
});

test("role recommendation detects finance marketing and keyholding work", () => {
  const workspace = buildTeamWorkload({
    profiles,
    now,
    workItems: [
      { id: "f", title: "Follow up unpaid commission invoice", status: "TO_DO" },
      { id: "m", title: "Review UTM campaign source", status: "TO_DO" },
      { id: "k", title: "Keyholding property inspection", status: "TO_DO", brand_id: "keyholding" },
    ],
  });
  assert.deepEqual(workspace.items.find((item) => item.resourceId === "f")?.recommendedRoles, ["FINANCE", "OWNER"]);
  assert.deepEqual(workspace.items.find((item) => item.resourceId === "m")?.recommendedRoles, ["MARKETING", "OWNER"]);
  assert.deepEqual(workspace.items.find((item) => item.resourceId === "k")?.recommendedRoles, ["KEYHOLDING", "OWNER"]);
});
