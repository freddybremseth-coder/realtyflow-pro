/**
 * Read-only contract between an Altovena Command routing proposal and Nexus.
 *
 * This is NOT an execution adapter, approval, task writer or tenant resolver.
 * The schemas deliberately remain separate until a server-verified tenant →
 * brand mapping and an independent reviewed-action protocol exist.
 */
export type CommandNexusHandoffStatus = Readonly<{
  kind: "invalid_proposal" | "routing_only";
  canCreateNexusTask: false;
  canExecute: false;
  agentCount: number;
  message: string;
  blockers: readonly string[];
}>;

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const DIGEST = /^[a-f0-9]{64}$/;
const record = (input: unknown): Record<string, unknown> | null =>
  input != null && typeof input === "object" && !Array.isArray(input)
    ? input as Record<string, unknown> : null;

const invalid = (): CommandNexusHandoffStatus => ({
  kind: "invalid_proposal",
  canCreateNexusTask: false,
  canExecute: false,
  agentCount: 0,
  message: "Planforslaget må kontrolleres. Ingen overføring til Nexus er tillatt.",
  blockers: ["invalid_or_unsafe_routing_proposal"],
});

/**
 * Evaluate stored data defensively: TypeScript types, UI state and user-provided
 * IDs cannot be trusted as execution authorization.
 */
export function inspectCommandNexusHandoff(
  proposal: unknown,
  expectedMissionId: string,
): CommandNexusHandoffStatus {
  const envelope = record(proposal);
  const plan = record(envelope?.plan);
  const controls = record(plan?.controls);
  const agents = plan?.agents;
  const automations = plan?.relatedAutomations;
  if (!envelope || envelope.status !== "proposed" || !plan || !controls
      || !UUID.test(expectedMissionId)
      || plan.schemaVersion !== 1
      || plan.mode !== "ROUTING_PROPOSAL_ONLY"
      || plan.source !== "realtyflow-nexus-agent-fleet"
      || plan.missionId !== expectedMissionId
      || typeof plan.goalDigest !== "string" || !DIGEST.test(plan.goalDigest)
      || controls.requiresHumanReview !== true
      || controls.approvedForExecution !== false
      || controls.permittedExternalActions !== false
      || !Array.isArray(controls.allowedTools) || controls.allowedTools.length !== 0
      || !Array.isArray(agents) || agents.length < 1 || agents.length > 3
      || !Array.isArray(automations) || automations.length > 3) return invalid();

  const ids = new Set<string>();
  for (const candidate of agents) {
    const agent = record(candidate);
    if (!agent || typeof agent.agentId !== "string"
        || !/^[a-zA-Z0-9:_-]{1,128}$/.test(agent.agentId)
        || ids.has(agent.agentId)
        || typeof agent.agentName !== "string" || !agent.agentName.trim()
        || agent.executionStatus !== "not_started"
        || agent.stage !== (ids.size === 0 ? "analyse" : "kvalitetssikring")) return invalid();
    ids.add(agent.agentId);
  }
  for (const candidate of automations) {
    const automation = record(candidate);
    if (!automation || automation.executionStatus !== "not_started"
        || typeof automation.reference !== "string" || !automation.reference.trim()) return invalid();
  }

  return {
    kind: "routing_only",
    canCreateNexusTask: false,
    canExecute: false,
    agentCount: agents.length,
    message: "Nexus-spesialister er foreslått. Ingen analyse eller agentoppgave er startet.",
    blockers: [
      "verified_tenant_to_brand_mapping_missing",
      "independent_analysis_and_evidence_required",
      "action_specific_human_approval_required",
      "separate_worker_dispatch_authorization_required",
    ],
  };
}
