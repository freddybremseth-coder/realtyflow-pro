import assert from "node:assert/strict";
import test from "node:test";
import {
  AUTOMATION_REGISTRY,
  buildAutomationRegistry,
  cronScheduleLabel,
  getConfiguredVercelCrons,
} from "@/lib/automation/registry";

test("automation registry has metadata for every Vercel cron", () => {
  const crons = getConfiguredVercelCrons();

  assert.ok(crons.length > 0);
  for (const cron of crons) {
    assert.ok(AUTOMATION_REGISTRY[cron.path], `Missing metadata for ${cron.path}`);
  }

  const { warnings } = buildAutomationRegistry();
  assert.deepEqual(warnings, []);
});

test("automation registry does not contain stale cron metadata", () => {
  const cronPaths = new Set(getConfiguredVercelCrons().map((cron) => cron.path));

  for (const path of Object.keys(AUTOMATION_REGISTRY)) {
    assert.ok(cronPaths.has(path), `Registry metadata is not backed by vercel.json: ${path}`);
  }
});

test("cron schedule label explains daily and weekly schedules", () => {
  assert.equal(cronScheduleLabel("0 7 * * *"), "Daglig 07:00 UTC");
  assert.equal(cronScheduleLabel("0 10 * * 6"), "Ukentlig lørdag 10:00 UTC");
});

test("automation registry derives health from runs and logs", () => {
  const now = new Date("2026-07-12T12:00:00.000Z");
  const { items, summary } = buildAutomationRegistry(
    [
      {
        status: "success",
        input: { name: "Growth Engine" },
        output: {},
        started_at: "2026-07-12T11:00:00.000Z",
        finished_at: "2026-07-12T11:02:00.000Z",
      },
      {
        status: "error",
        input: { path: "/api/cron/lead-nurture" },
        output: {},
        error: "SMTP disabled",
        started_at: "2026-07-12T07:00:00.000Z",
        finished_at: "2026-07-12T07:01:00.000Z",
      },
    ],
    [
      {
        action: "publishing_autopilot_v1",
        status: "success",
        details: {},
        created_at: "2026-07-12T10:00:00.000Z",
      },
    ],
    now,
  );

  const growth = items.find((item) => item.path === "/api/cron/growth-engine");
  const nurture = items.find((item) => item.path === "/api/cron/lead-nurture");
  const publishing = items.find((item) => item.path === "/api/cron/publishing-autopilot");

  assert.equal(growth?.health, "healthy");
  assert.equal(nurture?.health, "attention");
  assert.equal(nurture?.lastError, "SMTP disabled");
  assert.equal(publishing?.health, "healthy");
  assert.equal(summary.attention, 1);
});

test("Sam daily autopilot maps its own cycle failures without mistaking manual reads for cron runs", () => {
  const { items } = buildAutomationRegistry([], [
    { action: "seo_autopilot_pilot_cycle", status: "error", created_at: "2026-09-25T07:40:00Z",
      details: { error: "Cycle failed" } },
    { action: "seo_gsc_live_read", status: "success", created_at: "2026-09-25T10:00:00Z", details: {} },
  ], new Date("2026-09-25T11:00:00Z"));
  const sam = items.find(item => item.path === "/api/cron/seo-autopilot");
  assert.equal(sam?.lastStatus, "error");
  assert.equal(sam?.health, "attention");
  assert.equal(sam?.lastError, "Cycle failed");
});
