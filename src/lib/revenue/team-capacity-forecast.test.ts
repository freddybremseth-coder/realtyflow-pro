import assert from "node:assert/strict";
import test from "node:test";
import { buildTeamWorkload } from "./team-workload";
import { buildTeamCapacityForecast } from "./team-capacity-forecast";

const now = new Date("2026-10-03T10:00:00.000Z");

const profiles: any[] = [
  { email: "busy@example.com", displayName: "Busy Sales", role: "SALES", active: true },
  { email: "light@example.com", displayName: "Light Sales", role: "SALES", active: true },
  { email: "marketing@example.com", displayName: "Marketing", role: "MARKETING", active: true },
];

function assignedContact(id: string, stage: string, dueDate: string, owner = "busy@example.com") {
  return {
    id,
    name: `Contact ${id}`,
    brand_id: "soleada",
    pipeline_status: stage,
    next_followup: dueDate,
    interactions: [{
      action: "team_owner_assigned",
      date: "2026-10-01T08:00:00Z",
      metadata: { owner_email: owner },
    }],
  };
}

test("forecast identifies a balanced person who rises to high load next week", () => {
  const contacts = Array.from({ length: 5 }, (_, index) =>
    assignedContact(`viewing-${index}`, "VIEWING", `2026-10-0${4 + index}`));
  const team = buildTeamWorkload({
    profiles,
    contacts,
    now,
    responsibilityCountsByEmail: { "busy@example.com": 1 },
  });
  const current = team.members.find(member => member.email === "busy@example.com");
  assert.equal(current?.load, "BALANCED");
  assert.equal(current?.capacityScore, 330);

  const forecast = buildTeamCapacityForecast(team, { now, horizonDays: 7 });
  const busy = forecast.members.find(member => member.email === "busy@example.com");
  assert.equal(busy?.forecastLoad, "HIGH");
  assert.equal(busy?.risk, "RISING_HIGH");
  assert.equal((busy?.forecastScore || 0) >= 400, true);
  assert.equal(forecast.summary.risingHigh, 1);
});

test("forecast classifies follow-ups, viewings, closing and planned campaigns", () => {
  const team = buildTeamWorkload({
    profiles,
    now,
    responsibilityCountsByEmail: { "busy@example.com": 1, "marketing@example.com": 1 },
    contacts: [
      assignedContact("followup", "QUALIFIED", "2026-10-04"),
      assignedContact("viewing", "VIEWING", "2026-10-05"),
      assignedContact("closing", "NEGOTIATION", "2026-10-06"),
    ],
    workItems: [{
      id: "campaign",
      title: "Newsletter campaign launch",
      description: "Marketing campaign",
      status: "TO_DO",
      priority: "MEDIUM",
      due_date: "2026-10-07",
      assigned_agent: "marketing@example.com",
      brand_id: "zeneco",
    }],
  });
  const forecast = buildTeamCapacityForecast(team, { now, horizonDays: 7 });
  const salesKinds = new Set(forecast.members.find(member => member.email === "busy@example.com")?.drivers.map(driver => driver.kind));
  const marketingKinds = new Set(forecast.members.find(member => member.email === "marketing@example.com")?.drivers.map(driver => driver.kind));
  assert.equal(salesKinds.has("FOLLOW_UP"), true);
  assert.equal(salesKinds.has("VIEWING"), true);
  assert.equal(salesKinds.has("CLOSING"), true);
  assert.equal(marketingKinds.has("CAMPAIGN"), true);
});

test("forecast ignores work outside the selected horizon", () => {
  const team = buildTeamWorkload({
    profiles,
    now,
    contacts: [
      assignedContact("inside", "QUALIFIED", "2026-10-05"),
      assignedContact("outside", "QUALIFIED", "2026-10-20"),
    ],
  });
  const forecast = buildTeamCapacityForecast(team, { now, horizonDays: 7 });
  const drivers = forecast.members.find(member => member.email === "busy@example.com")?.drivers || [];
  assert.deepEqual(drivers.map(driver => driver.title), ["Contact inside"]);
});

test("preventive suggestions move only safe future work to a lower forecast specialist", () => {
  const contacts = Array.from({ length: 5 }, (_, index) =>
    assignedContact(`viewing-${index}`, "VIEWING", `2026-10-0${4 + index}`));
  contacts.push(assignedContact("negotiation", "NEGOTIATION", "2026-10-05"));

  const team = buildTeamWorkload({
    profiles,
    contacts,
    now,
    responsibilityCountsByEmail: {
      "busy@example.com": 1,
      "light@example.com": 0,
    },
  });
  const forecast = buildTeamCapacityForecast(team, { now, horizonDays: 7, limitPerMember: 2 });
  assert.equal(forecast.suggestions.length > 0, true);
  assert.equal(forecast.suggestions[0]?.fromEmail, "busy@example.com");
  assert.equal(forecast.suggestions[0]?.toEmail, "light@example.com");
  assert.notEqual(forecast.suggestions[0]?.resourceId, "negotiation");
  assert.match(forecast.suggestions[0]?.safety || "", /Owner-godkjenning/);
  assert.equal(forecast.suggestions[0]!.forecastAfter < forecast.suggestions[0]!.forecastBefore, true);
});

test("forecast never proposes critical, overdue, negotiation or won work", () => {
  const team = buildTeamWorkload({
    profiles,
    now,
    responsibilityCountsByEmail: { "busy@example.com": 6 },
    contacts: [
      assignedContact("negotiation", "NEGOTIATION", "2026-10-05"),
      assignedContact("won", "WON", "2026-10-06"),
    ],
    workItems: [
      { id: "critical", title: "Critical future task", status: "TO_DO", priority: "CRITICAL", due_date: "2026-10-05", assigned_agent: "busy@example.com", brand_id: "soleada" },
      { id: "overdue", title: "Overdue task", status: "TO_DO", priority: "MEDIUM", due_date: "2026-10-02", assigned_agent: "busy@example.com", brand_id: "soleada" },
    ],
  });
  const forecast = buildTeamCapacityForecast(team, { now, horizonDays: 7 });
  assert.equal(forecast.members.find(member => member.email === "busy@example.com")?.forecastLoad, "HIGH");
  assert.deepEqual(forecast.suggestions, []);
});
