import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  describeImapError,
  isPermanentImapError,
  isTransientImapError,
} from "./imap-error-policy";

const ingest = fs.readFileSync(path.join(process.cwd(), "src/app/api/cron/email-ingest/route.ts"), "utf8");
const reader = fs.readFileSync(path.join(process.cwd(), "src/services/email/imap-reader.ts"), "utf8");

test("email ingest retries transient IMAP connection failures", () => {
  assert.match(ingest, /isTransientImapError/);
  assert.match(ingest, /fetchRecentEmailsWithRetry/);
  assert.match(ingest, /TRANSIENT_RETRY_DELAY_MS/);
});

test("generic IMAP command failures remain safety-pausable when no transient detail exists", () => {
  const error = new Error("Command failed");
  assert.equal(isTransientImapError(error), false);
  assert.equal(isPermanentImapError(error), false);
});

test("Command failed is retryable when the server supplies a transient reason", () => {
  const error = {
    message: "Command failed",
    responseStatus: "NO",
    responseText: "Server busy, try again",
  };
  assert.equal(isTransientImapError(error), true);
  assert.equal(isPermanentImapError(error), false);
});

test("authentication failures remain permanent even when ImapFlow says Command failed", () => {
  const error = {
    message: "Command failed",
    responseStatus: "NO",
    serverResponseCode: "AUTHENTICATIONFAILED",
    response: "Authentication failed: invalid credentials",
    authenticationFailed: true,
  };
  assert.equal(isPermanentImapError(error), true);
  assert.equal(isTransientImapError(error), false);
});

test("structured IMAP diagnostics preserve server details instead of only Command failed", () => {
  const detail = describeImapError({
    message: "Command failed",
    responseStatus: "NO",
    responseText: "Server busy, try again",
    command: "UID FETCH 1:*",
  });
  assert.match(detail, /Command failed/);
  assert.match(detail, /Server busy, try again/);
  assert.match(detail, /UID FETCH 1:\*/);
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
