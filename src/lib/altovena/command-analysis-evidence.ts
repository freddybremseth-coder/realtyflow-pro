import { createHash } from "node:crypto";

/**
 * Altovena Command: offline, read-only evidence gate.
 *
 * This module validates candidate model output against a preauthorized,
 * server-fetched evidence bundle. It DOES NOT fetch data, call an AI model,
 * write a database record, approve an action or dispatch a Nexus task.
 * Matching an excerpt is only a structural provenance check, NOT factual
 * or semantic verification. Independent human review remains mandatory.
 */
export type TrustedAnalysisScope = Readonly<{
  tenantId: string;
  missionId: string;
  agentId: string;
  goalDigest: string;
  verifiedActorId: string;
  routingDigest: string;
}>;

export type TrustedEvidence = Readonly<{
  id: string;
  tenantId: string;
  sourceRef: string;
  capturedAt: string;
  excerpt: string;
  excerptDigest: string;
}>;

export type VerifiedFinding = Readonly<{
  claim: string;
  evidence: readonly { sourceId: string; quote: string; sourceRef: string }[];
}>;

export type AnalysisReviewPacket = Readonly<{
  status: "awaiting_human_review";
  missionId: string;
  tenantId: string;
  agentId: string;
  routingDigest: string;
  findings: readonly VerifiedFinding[];
  limitations: readonly string[];
  approvedForExecution: false;
  externalActionsPerformed: 0;
  reviewReasons: readonly string[];
}>;

export class AnalysisEvidenceDenied extends Error {
  constructor(readonly reason: string) {
    super("ALTOVENA_ANALYSIS_EVIDENCE_DENIED:" + reason);
    this.name = "AnalysisEvidenceDenied";
  }
}

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const HEX = /^[a-f0-9]{64}$/;
const AGENT = /^[A-Za-z0-9:_-]{1,128}$/;
const SOURCE_ID = /^[A-Za-z0-9:_-]{1,80}$/;
const fail = (reason: string): never => { throw new AnalysisEvidenceDenied(reason); };
const record = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : null;

function onlyKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).every(key => keys.includes(key)) &&
    keys.every(key => Object.prototype.hasOwnProperty.call(value, key));
}
function boundedText(value: unknown, min: number, max: number): value is string {
  return typeof value === "string" && value.trim().length >= min &&
    value.length <= max && !value.includes("\u0000");
}
function requireScope(scope: TrustedAnalysisScope): void {
  if (!scope || !UUID.test(scope.tenantId) || !UUID.test(scope.missionId)
    || !UUID.test(scope.verifiedActorId) || !AGENT.test(scope.agentId)
    || !HEX.test(scope.goalDigest) || !HEX.test(scope.routingDigest)) fail("invalid_trusted_scope");
}
function requireSources(
  sources: readonly TrustedEvidence[], scope: TrustedAnalysisScope, now: string,
): Map<string, TrustedEvidence> {
  if (!Array.isArray(sources) || sources.length < 1 || sources.length > 12)
    fail("source_count_out_of_bounds");
  const deadline = Date.parse(now);
  if (!Number.isFinite(deadline)) fail("invalid_clock");
  const map = new Map<string, TrustedEvidence>();
  for (const source of sources) {
    if (!source || !SOURCE_ID.test(source.id) || map.has(source.id)
      || source.tenantId !== scope.tenantId
      || !boundedText(source.sourceRef, 3, 500)
      || !boundedText(source.excerpt, 12, 4000)
      || !HEX.test(source.excerptDigest)
      || createHash("sha256").update(source.excerpt,"utf8").digest("hex") !== source.excerptDigest)
      fail("unverified_or_foreign_evidence");
    const captured = Date.parse(source.capturedAt);
    if (!Number.isFinite(captured) || captured > deadline) fail("invalid_evidence_capture_time");
    map.set(source.id, source);
  }
  return map;
}

/**
 * Preflight for a trusted evidence bundle, before an AI provider is invoked.
 * Do not interpret this as authentication: caller must already have verified
 * server session, tenant membership and source access.
 */
export function assertTrustedAnalysisEvidence(
  scope: TrustedAnalysisScope,
  sources: readonly TrustedEvidence[],
  now: string,
): void {
  requireScope(scope);
  requireSources(sources, scope, now);
}

/** Rejects invented sources, unsupported quotations and all model-granted permissions. */
export function verifyCommandAnalysisCandidate(input: Readonly<{
  scope: TrustedAnalysisScope;
  sources: readonly TrustedEvidence[];
  candidate: unknown;
  now: string;
}>): AnalysisReviewPacket {
  requireScope(input.scope);
  const sources = requireSources(input.sources, input.scope, input.now);
  const candidate = record(input.candidate);
  if (candidate === null) throw new AnalysisEvidenceDenied("candidate_scope_or_schema_mismatch");
  if (!onlyKeys(candidate, [
    "schemaVersion","mode","tenantId","missionId","agentId","goalDigest",
    "routingDigest","findings","limitations","controls",
  ]) || candidate.schemaVersion !== 1 || candidate.mode !== "ANALYSIS_DRAFT_ONLY"
    || candidate.tenantId !== input.scope.tenantId
    || candidate.missionId !== input.scope.missionId
    || candidate.agentId !== input.scope.agentId
    || candidate.goalDigest !== input.scope.goalDigest
    || candidate.routingDigest !== input.scope.routingDigest) fail("candidate_scope_or_schema_mismatch");
  const controls = record(candidate.controls);
  if (!controls || !onlyKeys(controls, [
    "approvedForExecution","permittedExternalActions","toolsUsed",
  ]) || controls.approvedForExecution !== false
    || controls.permittedExternalActions !== false
    || !Array.isArray(controls.toolsUsed) || controls.toolsUsed.length !== 0)
    fail("candidate_action_permission_spoofing");
  const rawFindings = candidate.findings;
  if (!Array.isArray(rawFindings) || rawFindings.length < 1 || rawFindings.length > 8)
    fail("invalid_finding_count");
  const findings: VerifiedFinding[] = [];
  for (const rawFinding of rawFindings) {
    const finding = record(rawFinding);
    if (!finding || !onlyKeys(finding, ["claim","evidence"])
      || !boundedText(finding.claim, 8, 800)
      || !Array.isArray(finding.evidence)
      || finding.evidence.length < 1 || finding.evidence.length > 3)
      fail("invalid_finding");
    const citations: {sourceId:string;quote:string;sourceRef:string}[] = [];
    const seen = new Set<string>();
    for (const rawCitation of finding.evidence) {
      const citation = record(rawCitation);
      if (!citation || !onlyKeys(citation, ["sourceId","quote"])
        || typeof citation.sourceId !== "string" || seen.has(citation.sourceId)
        || !boundedText(citation.quote, 6, 500))
        fail("invalid_citation");
      const source = sources.get(citation.sourceId);
      if (!source || !source.excerpt.includes(citation.quote))
        fail("citation_not_in_trusted_source");
      seen.add(citation.sourceId);
      citations.push({
        sourceId: citation.sourceId,
        quote: citation.quote,
        sourceRef: source.sourceRef,
      });
    }
    findings.push({ claim: finding.claim.trim(), evidence: citations });
  }
  if (!Array.isArray(candidate.limitations) || candidate.limitations.length > 5
    || candidate.limitations.some((item:unknown) => !boundedText(item, 3, 400)))
    fail("invalid_limitations");

  return {
    status: "awaiting_human_review",
    missionId: input.scope.missionId,
    tenantId: input.scope.tenantId,
    agentId: input.scope.agentId,
    routingDigest: input.scope.routingDigest,
    findings,
    limitations: candidate.limitations.map((item:string) => item.trim()),
    approvedForExecution: false,
    externalActionsPerformed: 0,
    reviewReasons: [
      "human_semantic_source_review_required",
      "independent_reviewer_required",
      "no_nexus_action_authorization",
    ],
  };
}
