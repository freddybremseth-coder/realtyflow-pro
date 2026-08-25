import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = readFileSync(resolve(process.cwd(), "src/services/integrations/nexus-social-inbox-sync.ts"), "utf8");

test("Social Inbox sync writes the canonical comment_thread conversation type", () => {
  assert.match(source, /conversation_type:\s*"comment_thread"/);
  assert.doesNotMatch(source, /conversation_type:\s*"comment"\s*[,}]/);
});

test("Social Inbox sync stays read-only and capability-gated", () => {
  assert.match(source, /capabilities\.readComments/);
  assert.match(source, /read_only:\s*true/);
  assert.doesNotMatch(source, /commentReply\s*\(/);
  assert.doesNotMatch(source, /directMessages\s*\(/);
});
