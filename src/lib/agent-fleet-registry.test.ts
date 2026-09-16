import assert from "node:assert/strict";
import test from "node:test";
import { AGENT_FLEET, resolveAgentFleetId, resolveAutomationAgentId } from "./agent-fleet-registry";

test("agent fleet contains unique ids including Email AI", () => {
  const ids = AGENT_FLEET.map((agent) => agent.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.includes("email"));
  assert.equal(AGENT_FLEET.find((agent) => agent.id === "email")?.displayName, "Elena Email AI");
});

test("durable automations map to their conceptual agent owners", () => {
  assert.equal(resolveAutomationAgentId("email_auto_draft"), "email");
  assert.equal(resolveAutomationAgentId("nexus_property_match_prep"), "sales");
  assert.equal(resolveAutomationAgentId("remaster_growth_loop"), "youtube");
  assert.equal(resolveAutomationAgentId("Nexus Mission Autopilot"), "ceo");
  assert.equal(resolveAutomationAgentId("Nexus Opportunity Sync"), "multi-domain");
});

test("agent display names and aliases resolve back to stable ids", () => {
  assert.equal(resolveAgentFleetId("Elena Email AI"), "email");
  assert.equal(resolveAgentFleetId("Jordan Sales Master"), "sales");
  assert.equal(resolveAgentFleetId("sofia scheduler"), "scheduling");
});
