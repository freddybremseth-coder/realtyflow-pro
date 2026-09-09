import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const routeSource = fs.readFileSync(path.join(process.cwd(), "src/app/api/customers/[contactId]/pipeline/route.ts"), "utf8");
const cardSource = fs.readFileSync(path.join(process.cwd(), "src/components/crm/crm-customer-card.tsx"), "utf8");
const controlSource = fs.readFileSync(path.join(process.cwd(), "src/components/customers/customer-pipeline-control.tsx"), "utf8");

test("customer card exposes the pipeline control outside the update tab", () => {
  assert.match(cardSource, /CustomerPipelineControl/);
  const controlIndex = cardSource.indexOf("<CustomerPipelineControl");
  const navIndex = cardSource.indexOf("<nav className=");
  assert.ok(controlIndex > 0 && navIndex > controlIndex, "pipeline control must be visible above the tab navigation");
});

test("manual pipeline control allows every canonical stage and posts a dedicated movement action", () => {
  assert.match(controlSource, /CUSTOMER_PIPELINE_STATUSES\.map/);
  assert.match(controlSource, /\/pipeline`/);
  assert.match(controlSource, /pipelineStatus: status/);
  assert.match(controlSource, /Notat \/ årsak til flyttingen/);
});

test("manual pipeline movement is audit logged and does not contact the customer", () => {
  assert.match(routeSource, /recordPipelineTransition/);
  assert.match(routeSource, /actorType: "human"/);
  assert.match(routeSource, /type: "pipeline_moved"/);
  assert.match(routeSource, /no_customer_contact: true/);
  assert.match(routeSource, /noCustomerContact: true/);
});

test("reactivating a terminal customer never removes an explicit do-not-contact", () => {
  assert.match(routeSource, /if \(contact\.do_not_contact \|\| String\(contact\.suppression_reason/);
  assert.match(routeSource, /patch\.email_suppressed = true/);
  assert.match(routeSource, /patch\.nurture_status = "stopped"/);
  assert.match(controlSource, /STOPP \/ do-not-contact/);
});

test("terminal manual stages close stale sales tasks across all sales work sources", () => {
  assert.match(routeSource, /\["crm", "portal", "ai_agent", "lead_intelligence"\]/);
  assert.match(routeSource, /status: "CANCELLED"/);
});

test("cancelled work items cannot appear as open tasks on the customer card", () => {
  assert.match(cardSource, /OPEN_TASK_STATUSES = new Set\(\["TO_DO", "IN_PROGRESS", "REVIEW"\]\)/);
  assert.match(cardSource, /OPEN_TASK_STATUSES\.has/);
});
