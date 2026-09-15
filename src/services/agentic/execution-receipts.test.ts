import assert from "node:assert/strict";
import test from "node:test";
import { makeApprovalDecisionPublisher } from "./approval-event-runtime";
import { buildExecutorDeps } from "./executor-runtime";

function fakeSupabase() {
  const inserted: any[] = [];
  return {
    inserted,
    client: {
      from(table: string) {
        if (table === "contacts") {
          return {
            select() {
              return {
                eq(_column: string, value: string) {
                  return {
                    limit: async () => ({
                      data: value === "kunde@example.com" || value === "contact-1"
                        ? [{ id: "contact-1", brand_id: "soleada" }]
                        : [],
                      error: null,
                    }),
                  };
                },
              };
            },
          };
        }
        if (table === "revenue_events") {
          return {
            insert(payload: any) {
              inserted.push(payload);
              return {
                select() {
                  return {
                    single: async () => ({ data: { id: `event-${inserted.length}`, ...payload }, error: null }),
                  };
                },
              };
            },
          };
        }
        throw new Error(`unexpected table ${table}`);
      },
    } as any,
  };
}

test("message approval is message_approved, never automation_executed", async () => {
  const { client, inserted } = fakeSupabase();
  const publish = makeApprovalDecisionPublisher(client);
  await publish({
    approvalId: "approval-1",
    runId: "run-1",
    correlationId: "corr-1",
    outcome: "approved",
    title: "GODKJENT: send oppfølging",
    gatedActionClass: "send_personal",
    subjectType: "message_draft",
    subjectRef: "draft-1",
    customerRef: "kunde@example.com",
    revenueImpactEur: 500000,
  });

  assert.equal(inserted[0]?.event_type, "message_approved");
  assert.equal(inserted[0]?.contact_id, "contact-1");
  assert.equal(inserted[0]?.source_system, "agentic_approval_gateway");
  assert.equal(inserted[0]?.source_id, "approval-1");
  assert.equal(inserted[0]?.revenue_impact_eur, null);
  assert.equal(inserted[0]?.metadata?.estimated_opportunity_eur, 500000);
  assert.equal(inserted[0]?.metadata?.execution_proof, false);
});

test("generic approval is an audit note, not execution proof", async () => {
  const { client, inserted } = fakeSupabase();
  const publish = makeApprovalDecisionPublisher(client);
  await publish({
    approvalId: "approval-social",
    outcome: "approved",
    title: "GODKJENT: publiser",
    gatedActionClass: "publish_social",
    subjectType: "generic_agent_action",
    subjectRef: "publication-1",
  });
  assert.equal(inserted[0]?.event_type, "note");
  assert.equal(inserted[0]?.metadata?.execution_proof, false);
});

test("actual executor writes traceable execution without inventing revenue impact", async () => {
  const { client, inserted } = fakeSupabase();
  const deps = buildExecutorDeps(client);
  await deps.publishEvent({
    approvalId: "approval-2",
    runId: "run-2",
    correlationId: "corr-2",
    outcome: "executed",
    title: "UTFØRT: send oppfølging",
    gatedActionClass: "send_personal",
    subjectType: "message_draft",
    subjectRef: "draft-2",
    customerRef: "kunde@example.com",
    revenueImpactEur: 500000,
  });

  assert.equal(inserted[0]?.event_type, "automation_executed");
  assert.equal(inserted[0]?.contact_id, "contact-1");
  assert.equal(inserted[0]?.brand_id, "soleada");
  assert.equal(inserted[0]?.source_system, "agentic_executor");
  assert.equal(inserted[0]?.source_type, "send_personal");
  assert.equal(inserted[0]?.source_id, "approval-2");
  assert.equal(inserted[0]?.revenue_impact_eur, null);
  assert.equal(inserted[0]?.metadata?.estimated_opportunity_eur, 500000);
  assert.equal(inserted[0]?.metadata?.execution_proof, true);
});

test("portfolio execution remains traceable even without customer identity", async () => {
  const { client, inserted } = fakeSupabase();
  const deps = buildExecutorDeps(client);
  await deps.publishEvent({
    approvalId: "approval-social-2",
    runId: "run-social",
    outcome: "executed",
    title: "UTFØRT: publiser",
    gatedActionClass: "publish_social",
    subjectType: "generic_agent_action",
    subjectRef: "publication-2",
  });

  assert.equal(inserted[0]?.contact_id, null);
  assert.equal(inserted[0]?.source_id, "approval-social-2");
  assert.equal(inserted[0]?.metadata?.contact_resolution, "not_applicable");
  assert.equal(inserted[0]?.metadata?.execution_proof, true);
});
