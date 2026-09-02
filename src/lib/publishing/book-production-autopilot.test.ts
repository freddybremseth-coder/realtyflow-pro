import assert from "node:assert/strict";
import test from "node:test";
import {
  needsAuthorStart,
  needsBookBible,
  needsMoreChapters,
  resolveBookAutopilotOrigin,
  snapshotBookProduction,
} from "./book-production-autopilot";

test("production snapshots enforce bible, author and chapter order", () => {
  const draft = snapshotBookProduction({ id: "project-1", status: "draft" });
  assert.equal(needsBookBible(draft), true);
  assert.equal(needsAuthorStart(draft), true);

  const authorReady = snapshotBookProduction({
    id: "project-1",
    status: "generated",
    metadata_plan: { generation_state: "author_ready", production_bible: { locked: true } },
    outline_plan: { toc: [{ title: "One" }, { title: "Two" }] },
    chapter_drafts: [{ chapter_title: "One" }],
  });
  assert.equal(needsBookBible(authorReady), false);
  assert.equal(needsAuthorStart(authorReady), false);
  assert.equal(needsMoreChapters(authorReady), true);
});

test("ready_for_export is the controlled autopilot boundary", () => {
  const ready = snapshotBookProduction({
    id: "project-1",
    status: "ready_for_export",
    metadata_plan: { production_bible: { locked: true } },
    outline_plan: { toc: [{ title: "One" }] },
    chapter_drafts: [{ chapter_title: "One" }],
  });
  assert.equal(ready.readyForExport, true);
  assert.equal(needsBookBible(ready), false);
  assert.equal(needsAuthorStart(ready), false);
  assert.equal(needsMoreChapters(ready), false);
});

test("internal workflow callbacks only use configured, Vercel or local development origins", () => {
  assert.equal(
    resolveBookAutopilotOrigin("https://realtyflow.chatgenius.pro", { NODE_ENV: "production" } as NodeJS.ProcessEnv),
    "https://realtyflow.chatgenius.pro",
  );
  assert.equal(
    resolveBookAutopilotOrigin("https://realtyflow-git-test.vercel.app", { NODE_ENV: "production" } as NodeJS.ProcessEnv),
    "https://realtyflow-git-test.vercel.app",
  );
  assert.throws(
    () => resolveBookAutopilotOrigin("https://attacker.example", { NODE_ENV: "production" } as NodeJS.ProcessEnv),
    /not allowed/,
  );
});
