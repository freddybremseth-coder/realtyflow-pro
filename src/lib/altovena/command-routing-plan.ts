import "server-only";
import { createHash } from "node:crypto";
import { AGENT_FLEET_BINDINGS, WORKER_OWNED_AGENTS } from "@/lib/nexus-agent-fleet-bindings";
import { buildNexusAdvisorSystemRouting } from "@/lib/nexus-advisor-system-routing";

/**
 * Command planning reuses the existing Nexus agent registry and routing logic.
 * This module does NOT instantiate AgentOrchestrator or run AI/tasks/automations.
 */
export function buildAltovenaCommandRoutingPlan(missionId: string, goal: string) {
  const all = [...AGENT_FLEET_BINDINGS, ...WORKER_OWNED_AGENTS];
  const capabilities = all.map(binding => ({
    agentName: binding.displayName,
    role: binding.role,
    expertise: [] as string[],
    availableTasks: [] as string[],
  }));
  const routing = buildNexusAdvisorSystemRouting(goal, capabilities);
  const picked = routing.relevantAgents.slice(0, 3);
  if (picked.length === 0) {
    const fallback = all.find(item => item.id === "ceo")!;
    picked.push({kind: "agent", id: fallback.displayName, label: fallback.displayName,
      owner:"AgentOrchestrator", purpose:fallback.role, availableTasks:[]});
  }
  const agents = picked.map((agent, index) => {
    const binding = all.find(b => b.displayName === agent.id)!;
    return {
      order: index + 1,
      agentId: binding.id,
      agentName: binding.displayName,
      role: binding.role,
      stage: index === 0 ? "analyse" : "kvalitetssikring",
      instruction: "Vurder oppdraget og foreslå et kontrollert utkast. Ingen verktøy eller eksterne handlinger er tillatt.",
      executionStatus: "not_started",
    };
  });

  const goalDigest = createHash("sha256").update(goal.trim(), "utf8").digest("hex");
  return {
    schemaVersion: 1,
    source: "realtyflow-nexus-agent-fleet",
    mode: "ROUTING_PROPOSAL_ONLY",
    missionId,
    goalDigest,
    agents,
    relatedAutomations: routing.relevantAutomations.slice(0, 3).map(row => ({
      name: row.label, owner: row.owner, reference: row.id, executionStatus: "not_started",
    })),
    controls: {
      requiresHumanReview: true,
      approvedForExecution: false,
      permittedExternalActions: false,
      allowedTools: [] as string[],
    },
    note: "Dette er et ruteforslag basert på registrerte Nexus-kapasiteter, ikke analyseresultater fra kjørte agenter.",
  };
}
