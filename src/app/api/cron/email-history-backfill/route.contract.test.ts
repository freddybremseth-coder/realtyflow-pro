import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(new URL("./route.ts", import.meta.url), "utf8");

test("history backfill cron uses scheduler auth and runtime safe-mode", () => {
  assert.match(source, /requireNexusSchedulerApi/);
  assert.match(source, /evaluateCronSafeMode/);
  assert.match(source, /email_history_backfill_jobs/);
});

test("history backfill cron logs no-send and exact-link safety", () => {
  assert.match(source, /sends_email:\s*false/);
  assert.match(source, /exact_unique_crm_linking_only:\s*true/);
});
