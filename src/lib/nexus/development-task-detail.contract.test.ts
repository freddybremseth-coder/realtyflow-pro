import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
const detail = fs.readFileSync("src/app/api/nexus/development-tasks/[taskId]/route.ts", "utf8");
const list = fs.readFileSync("src/app/api/nexus/development-tasks/route.ts", "utf8");
const chat = fs.readFileSync("src/components/chatbot/chat-widget.tsx", "utf8");
test("development tasks require authenticated owner and scoped record lookup", () => {
  assert.match(detail, /getRequestAccessContext/);
  assert.match(detail, /access\.role !== "OWNER"/);
  assert.match(detail, /access\.source !== "owner-session"/);
  assert.match(detail, /\.eq\("requested_by", access\.email\)/);
  assert.match(detail, /execution_enabled: false/);
  assert.match(list, /\.eq\("requested_by", auth\.email\)/);
});
test("the existing Nexus chat resumes from a server-confirmed task", () => {
  assert.match(chat, /api\/nexus\/development-tasks\/\$\{encodeURIComponent\(task\.id\)\}/);
  assert.match(chat, /details\.task/);
  assert.match(chat, /Lagre som utviklingsoppgave/);
});
