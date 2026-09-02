import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const route = fs.readFileSync(path.join(process.cwd(), "src/app/api/publishing/book-engine/autopilot/route.ts"), "utf8");
const workflow = fs.readFileSync(path.join(process.cwd(), "src/workflows/book-production-autopilot.ts"), "utf8");
const studio = fs.readFileSync(path.join(process.cwd(), "src/app/(business)/publishing/forfatterstudio/page.tsx"), "utf8");
const intake = fs.readFileSync(path.join(process.cwd(), "src/app/(business)/publishing/forfatterstudio/learning-intake/page.tsx"), "utf8");

test("admin route deduplicates active project runs before starting Workflow", () => {
  assert.match(route, /requireAdminApi\(request\)/);
  assert.match(route, /\.in\("status", \["queued", "running"\]\)/);
  assert.match(route, /start\(bookProductionAutopilot/);
  assert.match(route, /workflow_run_id: workflowRun\.runId/);
});

test("workflow calls every guarded Book Engine action in controlled order", () => {
  const seo = workflow.indexOf('"generate_seo"');
  const author = workflow.indexOf('"generate_author"');
  const continuation = workflow.indexOf('"continue"');
  assert.ok(seo > 0 && author > seo && continuation > author);
  assert.match(workflow, /BOOK_PRODUCTION_MAX_CHAPTER_PASSES/);
  assert.match(workflow, /await finishBookProductionStep\(input, "completed"\)/);
  assert.match(workflow, /await finishBookProductionStep\(input, "failed", message\)/);
  assert.doesNotMatch(workflow, /approve_for_distribution|publish_to|distribution_job/);
});

test("Forfatterstudio and learning intake start the durable route", () => {
  assert.match(studio, /\/api\/publishing\/book-engine\/autopilot/);
  assert.match(intake, /\/api\/publishing\/book-engine\/autopilot/);
  assert.match(studio, /Du kan lukke siden/);
  assert.match(intake, /this page may be closed/);
});
