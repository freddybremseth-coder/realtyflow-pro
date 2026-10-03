import assert from "node:assert/strict";
import test from "node:test";
import { buildTeamWorkload } from "./team-workload";
import { buildTeamCapacityTrend } from "./team-capacity-trend";

const now = new Date("2026-10-03T10:00:00.000Z");
const profiles: any[] = [
  { email: "sales@example.com", displayName: "Sales", role: "SALES", active: true },
  { email: "backup@example.com", displayName: "Backup", role: "SALES", active: true },
  { email: "marketing@example.com", displayName: "Marketing", role: "MARKETING", active: true },
];

function task(id: string, due: string, owner = "sales@example.com", title = "Sales follow-up", priority = "MEDIUM") {
  return {
    id, title, description: title, status: "TO_DO", priority, due_date: due,
    assigned_agent: owner, brand_id: "soleada",
  };
}

test("classifies high load across three or more weeks as persistent", () => {
  const workItems: any[] = [];
  for (let week = 0; week < 4; week += 1) {
    const day = 5 + week * 7;
    for (let i = 0; i < 9; i += 1) {
      workItems.push(task(`w${week}-${i}`, `2026-10-${String(day).padStart(2,"0")}`));
    }
  }
  const team = buildTeamWorkload({
    profiles, workItems, now,
    responsibilityCountsByEmail: { "sales@example.com": 1 },
  });
  const trend = buildTeamCapacityTrend(team, { now, horizonDays: 30 });
  const sales = trend.members.find(member => member.email === "sales@example.com");
  assert.equal(sales?.pattern, "PERSISTENT_HIGH");
  assert.equal((sales?.highWeeks || 0) >= 3, true);
  assert.equal(sales?.intervention, "AUTOMATE");
});

test("six fixed responsibility areas prefer role rebalance over automation", () => {
  const team = buildTeamWorkload({
    profiles, now,
    responsibilityCountsByEmail: { "sales@example.com": 6 },
  });
  const trend = buildTeamCapacityTrend(team, { now, horizonDays: 30 });
  const sales = trend.members.find(member => member.email === "sales@example.com");
  assert.equal(sales?.pattern, "PERSISTENT_HIGH");
  assert.equal(sales?.intervention, "ROLE_REBALANCE");
  assert.match(sales?.rationale || "", /6 faste ansvarsområder/);
});

test("persistent pressure with no spare same-role capacity becomes staffing review", () => {
  const onlySales: any[] = [{ email: "sales@example.com", displayName: "Sales", role: "SALES", active: true }];
  const workItems: any[] = [];
  for (let week = 0; week < 4; week += 1) {
    const day = 5 + week * 7;
    for (let i = 0; i < 6; i += 1) {
      workItems.push(task(`high-${week}-${i}`, `2026-10-${String(day).padStart(2,"0")}`, "sales@example.com", "Viewing prep", "HIGH"));
    }
  }
  const team = buildTeamWorkload({ profiles: onlySales, workItems, now });
  const trend = buildTeamCapacityTrend(team, { now, horizonDays: 30 });
  const sales = trend.members.find(member => member.email === "sales@example.com");
  assert.equal(sales?.pattern, "PERSISTENT_HIGH");
  assert.equal(sales?.intervention, "STAFFING_REVIEW");
});

test("one isolated high week is classified as a spike rather than structural pressure", () => {
  const workItems = Array.from({ length: 9 }, (_, i) =>
    task(`spike-${i}`, "2026-10-06", "sales@example.com", "Viewing prep", "HIGH"));
  const team = buildTeamWorkload({ profiles, workItems, now });
  const trend = buildTeamCapacityTrend(team, { now, horizonDays: 30 });
  const sales = trend.members.find(member => member.email === "sales@example.com");
  assert.equal(sales?.pattern, "SPIKE");
  assert.notEqual(sales?.intervention, "STAFFING_REVIEW");
  assert.notEqual(sales?.intervention, "ROLE_REBALANCE");
});

test("rising weekly scores are detected before persistent high", () => {
  const workItems: any[] = [];
  const counts = [2,4,6,8];
  counts.forEach((count, week) => {
    const day = 5 + week * 7;
    for (let i = 0; i < count; i += 1) {
      workItems.push(task(`rise-${week}-${i}`, `2026-10-${String(day).padStart(2,"0")}`));
    }
  });
  const team = buildTeamWorkload({ profiles, workItems, now });
  const trend = buildTeamCapacityTrend(team, { now, horizonDays: 30 });
  const sales = trend.members.find(member => member.email === "sales@example.com");
  assert.equal(sales?.pattern, "RISING");
  assert.equal(sales?.intervention, "REDISTRIBUTE");
});
