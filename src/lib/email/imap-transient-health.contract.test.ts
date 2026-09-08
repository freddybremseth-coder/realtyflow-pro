import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const ingest = fs.readFileSync(path.join(process.cwd(), "src/app/api/cron/email-ingest/route.ts"), "utf8");
const reader = fs.readFileSync(path.join(process.cwd(), "src/services/email/imap-reader.ts"), "utf8");

test("email ingest retries transient IMAP connection failures", () => {
  assert.match(ingest, /function isTransientImapError/);
  assert.match(ingest, /connection not available/);
  assert.match(ingest, /fetchRecentEmailsWithRetry/);
  assert.match(ingest, /TRANSIENT_RETRY_DELAY_MS/);
});

test("transient connection failures cannot system-pause auto fetch", () => {
  assert.match(ingest, /const pause = !transient && failures >= FAILURE_PAUSE_THRESHOLD/);
  assert.match(ingest, /auto_fetch_paused_by_system: false/);
});

test("credential or non-transient repeated failures retain pause protection", () => {
  assert.match(ingest, /FAILURE_PAUSE_THRESHOLD = 3/);
  assert.match(ingest, /auto_fetch: false, auto_fetch_paused_by_system: true/);
});

test("IMAP logout is best-effort cleanup and cannot fail a successful fetch", () => {
  assert.match(reader, /async function safeLogout/);
  assert.match(reader, /connection not available\|not connected\|connection closed/);
  assert.match(reader, /await safeLogout\(client\)/);
  assert.doesNotMatch(reader, /finally \{\n    await client\.logout\(\);\n  \}/);
});
