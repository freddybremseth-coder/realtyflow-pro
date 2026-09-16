import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";

const route = fs.readFileSync(path.join(process.cwd(), "src/app/api/cron/email-auto-draft/route.ts"), "utf8");
const migration = fs.readFileSync(path.join(process.cwd(), "supabase/migrations/20260916205500_add_email_draft_retry_state.sql"), "utf8");

test("auto-draft queue excludes quarantined and not-yet-due retries", () => {
  assert.match(route, /\.is\("ai_draft_quarantined_at", null\)/);
  assert.match(route, /ai_draft_retry_after\.is\.null/);
  assert.match(route, /ai_draft_retry_after\.lte/);
  assert.match(route, /MAX_DRAFT_ATTEMPTS = 5/);
});

test("auto-draft failures get durable retry state and eventual quarantine", () => {
  assert.match(route, /ai_draft_attempt_count/);
  assert.match(route, /ai_draft_last_attempt_at/);
  assert.match(route, /ai_draft_last_error/);
  assert.match(route, /ai_draft_quarantined_at/);
  assert.match(route, /status:quarantined \? "quarantined" : "retry_scheduled"/);
  assert.match(route, /has_draft_reply: false/);
});

test("retry schema is represented in migration history", () => {
  for (const column of [
    "ai_draft_attempt_count",
    "ai_draft_last_attempt_at",
    "ai_draft_retry_after",
    "ai_draft_last_error",
    "ai_draft_quarantined_at",
  ]) {
    assert.match(migration, new RegExp(column));
  }
  assert.match(migration, /idx_email_messages_ai_draft_retry/);
});
