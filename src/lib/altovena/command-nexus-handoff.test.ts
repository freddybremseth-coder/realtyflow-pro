import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { inspectCommandNexusHandoff } from "./command-nexus-handoff";

const missionId = "91e2a58e-486c-45d9-a543-cb7c21ac3e4e";
const sha256 = "a".repeat(64);
const safe = () => ({
  status: "proposed",
  plan: {
    schemaVersion: 1,
    source: "realtyflow-nexus-agent-fleet",
    mode: "ROUTING_PROPOSAL_ONLY",
    missionId,
    goalDigest: sha256,
    agents: [{
      agentId: "ceo", agentName: "Nexus advisor", role: "Review",
      stage: "analyse", executionStatus: "not_started",
    }],
    relatedAutomations: [{ reference: "example", executionStatus: "not_started" }],
    controls: {
      requiresHumanReview: true,
      approvedForExecution: false,
      permittedExternalActions: false,
      allowedTools: [],
    },
  },
});
const rejected = (value: unknown, id = missionId) => {
  const result = inspectCommandNexusHandoff(value, id);
  assert.equal(result.kind, "invalid_proposal");
  assert.equal(result.canCreateNexusTask, false);
  assert.equal(result.canExecute, false);
};

test("a valid Command proposal remains an unexecuted plan, not a Nexus task", () => {
  const result = inspectCommandNexusHandoff(safe(), missionId);
  assert.equal(result.kind, "routing_only");
  assert.equal(result.agentCount, 1);
  assert.equal(result.canCreateNexusTask, false);
  assert.equal(result.canExecute, false);
  assert.ok(result.blockers.includes("verified_tenant_to_brand_mapping_missing"));
  assert.ok(result.blockers.includes("action_specific_human_approval_required"));
});

test("tampered approval flags and tool/automation execution are rejected", () => {
  const approved = safe(); approved.plan.controls.approvedForExecution = true;
  rejected(approved);
  const external = safe(); external.plan.controls.permittedExternalActions = true;
  rejected(external);
  const tools = safe(); tools.plan.controls.allowedTools = ["email"];
  rejected(tools);
  const run = safe(); run.plan.agents[0].executionStatus = "started";
  rejected(run);
  const triggered = safe(); triggered.plan.relatedAutomations[0].executionStatus = "started";
  rejected(triggered);
});

test("mission-binding, schema, digest and agent identities fail closed", () => {
  rejected(safe(), "6de6cb26-8ddf-45a4-ab4c-cd2207db55f7");
  rejected(null);
  rejected({ status: "proposed" });
  const wrongSchema = safe(); wrongSchema.plan.schemaVersion = 2; rejected(wrongSchema);
  const wrongDigest = safe(); wrongDigest.plan.goalDigest = "not-a-digest"; rejected(wrongDigest);
  const duplicate = safe();
  duplicate.plan.agents.push({ ...duplicate.plan.agents[0], stage: "kvalitetssikring" });
  rejected(duplicate);
});

test("Command plan RPC is distinct from the Nexus claim/dispatch store", () => {
  const commandMigration = readFileSync(
    "supabase/migrations/20261016211500_altovena_command_routing_plans.sql", "utf8");
  const nexusMigration = readFileSync(
    "supabase/migrations/20261015212600_nexus_execution_task_claim_store.sql", "utf8");
  const commandApi = readFileSync("src/app/api/altovena/command/plan/route.ts", "utf8");
  assert.match(commandMigration, /CHECK \(status='proposed'\)/);
  assert.match(commandMigration, /approvedForExecution/);
  assert.doesNotMatch(commandMigration, /INSERT INTO core\.nexus_execution_tasks/i);
  assert.match(nexusMigration, /core\.nexus_execution_tasks/);
  assert.match(nexusMigration, /core\.nexus_execution_claims/);
  assert.doesNotMatch(commandApi, /createReviewedNexusProposal|claimApprovedNexusTask|inspectNexusClaimBeforeDispatch/);
});
