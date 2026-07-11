import assert from "node:assert/strict";
import test from "node:test";
import { buildExecutionWorkspace } from "./execution";

const NOW = new Date("2026-07-11T10:00:00.000Z");

function contact(overrides: Record<string, unknown> = {}) {
  return {
    id: "c1",
    name: "Harald Buyer",
    email: "harald@example.com",
    phone: "+47 900 00 000",
    brand_id: "soleada",
    pipeline_status: "NEGOTIATION",
    pipeline_value: 600000,
    next_followup: "2026-07-10",
    updated_at: "2026-07-09T10:00:00.000Z",
    interactions: [],
    ...overrides,
  };
}

function workItem(overrides: Record<string, unknown> = {}) {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    title: "Ring kunde",
    description: "Avklar neste steg",
    status: "TO_DO",
    priority: "HIGH",
    due_date: "2026-07-11",
    source_type: "crm",
    source_id: "c1",
    brand_id: "soleada",
    ai_score: 80,
    metadata: { contact_id: "c1" },
    ...overrides,
  };
}

test("prioritizes overdue negotiation as critical closing work", () => {
  const result = buildExecutionWorkspace({ contacts: [contact()], workItems: [], now: NOW });
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].kind, "CLOSING");
  assert.equal(result.items[0].urgency, "OVERDUE");
  assert.equal(result.items[0].priority, "CRITICAL");
  assert.equal(result.items[0].workspaceHref, "/closing");
  assert.equal(result.safety.automaticCalendarCreation, false);
});

test("deduplicates an open CRM task into the contact execution item", () => {
  const result = buildExecutionWorkspace({ contacts: [contact()], workItems: [workItem()], now: NOW });
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].contactId, "c1");
  assert.equal(result.items[0].workItemId, "11111111-1111-4111-8111-111111111111");
  assert.equal(result.items[0].canCreateTask, false);
  assert.equal(result.items[0].canCompleteTask, true);
});

test("includes independent work items and preserves their due date", () => {
  const task = workItem({
    id: "22222222-2222-4222-8222-222222222222",
    source_type: "manual",
    source_id: "internal-1",
    metadata: {},
    due_date: "2026-07-12",
  });
  const result = buildExecutionWorkspace({ contacts: [], workItems: [task], now: NOW });
  assert.equal(result.items[0].kind, "WORK_ITEM");
  assert.equal(result.items[0].urgency, "THIS_WEEK");
  assert.equal(result.items[0].dueDate, "2026-07-12");
  assert.equal(result.items[0].canCompleteTask, true);
});

test("advanced contacts without a date are surfaced as unscheduled", () => {
  const result = buildExecutionWorkspace({
    contacts: [contact({ pipeline_status: "VIEWING", next_followup: null })],
    workItems: [],
    now: NOW,
  });
  assert.equal(result.items[0].kind, "VIEWING");
  assert.equal(result.items[0].urgency, "UNSCHEDULED");
  assert.equal(result.summary.unscheduled, 1);
});

test("won and keyholding contacts route to their specialist workspaces", () => {
  const result = buildExecutionWorkspace({
    contacts: [
      contact({ id: "won", pipeline_status: "WON", next_followup: "2026-07-11" }),
      contact({ id: "key", brand_id: "keyholding", pipeline_status: "CONTACT", next_followup: "2026-07-12" }),
    ],
    workItems: [],
    now: NOW,
  });
  const won = result.items.find((item) => item.contactId === "won");
  const key = result.items.find((item) => item.contactId === "key");
  assert.equal(won?.kind, "AFTER_SALES");
  assert.equal(won?.workspaceHref, "/after-sales");
  assert.equal(key?.kind, "KEYHOLDING");
  assert.equal(key?.workspaceHref, "/service-revenue");
});

test("builds a seven-day execution summary without creating actions", () => {
  const result = buildExecutionWorkspace({
    contacts: [contact({ next_followup: "2026-07-11" })],
    workItems: [],
    warnings: ["calendar optional"],
    now: NOW,
  });
  assert.equal(result.days.length, 7);
  assert.equal(result.days[0].date, "2026-07-11");
  assert.equal(result.days[0].count, 1);
  assert.deepEqual(result.warnings, ["calendar optional"]);
  assert.equal(result.safety.automaticTaskCreation, false);
  assert.equal(result.safety.automaticCustomerContact, false);
});
