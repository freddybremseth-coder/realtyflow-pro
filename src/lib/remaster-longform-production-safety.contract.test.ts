import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(path: string) {
  return readFileSync(path, "utf8");
}

const worker = source("src/services/pipelines/remaster-mix-worker.ts");
const youtube = source("src/services/integrations/remaster-youtube-longform.ts");
const recovery = source("src/app/api/cron/remaster-playlist-recovery/route.ts");
const publicReconcile = source("src/app/api/cron/remaster-youtube-public-reconcile/route.ts");
const vercel = source("vercel.json");

test("autonomous Re-Master long-form uploads are public-only and fail closed", () => {
  assert.match(worker, /return "public" as const/);
  assert.match(worker, /privacyStatus: mixPrivacy\(\)/);
  assert.match(worker, /upload\.privacyStatus !== "public"/);
  assert.match(worker, /YOUTUBE_LONGFORM_NOT_PUBLIC/);
  assert.doesNotMatch(worker, /REMASTER_MIX_YOUTUBE_PRIVACY/);
  assert.match(youtube, /input\.privacyStatus \|\| "public"/);
});

test("completed Re-Master long-form videos can be reconciled and verified public", () => {
  assert.match(youtube, /export async function ensureRemasterLongFormPublic/);
  assert.match(youtube, /privacyStatus: "public"/);
  assert.match(youtube, /if \(after !== "public"\)/);
  assert.match(publicReconcile, /\.eq\("status", "completed"\)/);
  assert.match(publicReconcile, /ensureRemasterLongFormPublic\(videoId\)/);
  assert.match(publicReconcile, /action: "remaster_youtube_public_reconcile"/);
  assert.match(vercel, /\/api\/cron\/remaster-youtube-public-reconcile/);
});

test("playlist recovery performs exactly one explicit YouTube connection preflight per run", () => {
  const calls = recovery.match(/verifyRemasterLongFormYouTubeConnection\(\)/g) || [];
  assert.equal(calls.length, 1);
  assert.match(recovery, /const eligibleJobs =/);
  assert.match(recovery, /connectionPreflightFailed: true/);
  assert.match(recovery, /for \(const job of eligibleJobs\)/);
});
