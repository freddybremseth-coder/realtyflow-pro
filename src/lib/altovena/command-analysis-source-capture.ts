import { createHash } from "node:crypto";
import type { TrustedAnalysisScope, TrustedEvidence } from "./command-analysis-evidence";

/**
 * A SOURCE CAPTURE CONTRACT, not a connected source-ingestion service.
 *
 * Caller must supply independently authenticated, server-owned source handlers.
 * No HTTP URLs, model calls, database changes or source attestation writes.
 * Never expose these handlers to browser input or infer authorization from
 * user-controlled metadata. Review/recheck at the actual model-run boundary.
 */
export type SourceReadGrant = Readonly<{
  tenantId: string;
  missionId: string;
  actorId: string;
  sourceId: string;
  sourceRef: string;
  revision: string;
  capability: "read_analysis";
  expiresAt: string;
}>;

export type RetrievedSourceSnapshot = Readonly<{
  tenantId: string;
  missionId: string;
  sourceId: string;
  sourceRef: string;
  revision: string;
  capturedAt: string;
  excerpt: string;
}>;

export interface AnalysisSourceConnector {
  /** Verify real identity, tenant/source membership and current source ACL. */
  authorize(input: Readonly<{
    tenantId: string; missionId: string; actorId: string; sourceId: string;
  }>): Promise<SourceReadGrant | null>;

  /** Server-side read using a granted source handle; no caller-controlled URL. */
  read(grant: SourceReadGrant): Promise<RetrievedSourceSnapshot | null>;

  /** Second live ACL check after the read; fail closed if revoked or changed. */
  revalidate(grant: SourceReadGrant): Promise<boolean>;
}

export class SourceCaptureDenied extends Error {
  constructor(readonly reason: string) {
    super("ALTOVENA_SOURCE_CAPTURE_DENIED:" + reason);
    this.name = "SourceCaptureDenied";
  }
}

export type CapturedAnalysisBundle = Readonly<{
  status: "source_capture_only";
  sources: readonly TrustedEvidence[];
  // Matches the existing private provider admission contract exactly.
  evidenceDigest: string;
  // Extra digest for revision-aware provenance; cannot replace evidenceDigest
  // in legacy permits without an explicit versioned migration.
  provenanceDigest: string;
  externalActionsPerformed: 0;
  modelCalls: 0;
}>;

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const HEX = /^[a-f0-9]{64}$/;
const AGENT = /^[A-Za-z0-9:_-]{1,128}$/;
const ID = /^[A-Za-z0-9:_-]{1,80}$/;
const REF = /^[a-z][a-z0-9_-]{1,25}:[A-Za-z0-9_./:-]{3,240}$/;
const REVISION = /^[A-Za-z0-9._:-]{1,120}$/;
const sha = (value: string) => createHash("sha256").update(value, "utf8").digest("hex");
const deny = (reason: string): never => { throw new SourceCaptureDenied(reason); };
function checkedTime(value: string): number {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) {
    return NaN;
  }
  return Date.parse(value);
}
function validSourceRef(value: string): boolean {
  return typeof value === "string" && REF.test(value) &&
    !value.includes("..") && !value.includes("//") && !value.includes("@");
}

/**
 * Capture 1..4 current tenant-authorized snapshots for later manual review.
 * Inputs contain opaque source IDs, NOT arbitrary URLs. All callbacks are
 * trusted dependencies; tests use mocks, live connectors are NOT present.
 */
export async function captureCommandAnalysisSources(input: Readonly<{
  scope: TrustedAnalysisScope;
  sourceIds: readonly string[];
  now: string;
  connector: AnalysisSourceConnector;
}>): Promise<CapturedAnalysisBundle> {
  const { scope, sourceIds, connector } = input;
  const now = checkedTime(input.now);
  if (!Number.isFinite(now)) deny("invalid_clock");
  if (!scope || !UUID.test(scope.tenantId) || !UUID.test(scope.missionId)
      || !UUID.test(scope.verifiedActorId) || !AGENT.test(scope.agentId)
      || !HEX.test(scope.goalDigest) || !HEX.test(scope.routingDigest)) {
    deny("invalid_verified_scope");
  }
  if (!connector || typeof connector.authorize !== "function" ||
      typeof connector.read !== "function" ||
      typeof connector.revalidate !== "function") deny("missing_trusted_connector");
  if (!Array.isArray(sourceIds) || sourceIds.length < 1 || sourceIds.length > 4
      || sourceIds.some(id => typeof id !== "string" || !ID.test(id))
      || new Set(sourceIds).size !== sourceIds.length) deny("invalid_source_ids");

  // Canonical ordering makes the existing provider evidence digest stable.
  const ordered = [...sourceIds].sort();
  const sources: TrustedEvidence[] = [];
  const revisions: Array<Record<string,string>> = [];
  let totalBytes = 0;
  for (const sourceId of ordered) {
    let grant: SourceReadGrant | null, snapshot: RetrievedSourceSnapshot | null, stillAllowed: boolean;
    try {
      grant = await connector.authorize({
        sourceId, tenantId:scope.tenantId,
        missionId:scope.missionId, actorId:scope.verifiedActorId,
      });
    } catch { return deny("source_authorization_unavailable"); }
    const until = checkedTime(grant?.expiresAt ?? "");
    if (!grant || grant.capability !== "read_analysis" ||
      grant.tenantId !== scope.tenantId || grant.missionId !== scope.missionId ||
      grant.actorId !== scope.verifiedActorId || grant.sourceId !== sourceId ||
      !validSourceRef(grant.sourceRef) || !REVISION.test(grant.revision) ||
      !Number.isFinite(until) || until <= now || until > now + 15*60_000) {
      deny("source_access_denied");
    }
    try { snapshot = await connector.read(grant); }
    catch { return deny("source_read_failed"); }
    const at = checkedTime(snapshot?.capturedAt ?? "");
    if (!snapshot || snapshot.sourceId !== sourceId ||
      snapshot.tenantId !== scope.tenantId ||
      snapshot.missionId !== scope.missionId ||
      snapshot.sourceRef !== grant.sourceRef ||
      snapshot.revision !== grant.revision ||
      !Number.isFinite(at) || at > now || at < now - 15*60_000 ||
      at >= until || typeof snapshot.excerpt !== "string" ||
      snapshot.excerpt.length < 12 || snapshot.excerpt.length > 1100 ||
      snapshot.excerpt.includes("\u0000")) {
      deny("stale_or_mismatched_snapshot");
    }
    const bytes = Buffer.byteLength(snapshot.excerpt,"utf8");
    totalBytes += bytes;
    if (bytes > 1250 || totalBytes > 2600) deny("evidence_size_limit");
    try { stillAllowed = await connector.revalidate(grant); }
    catch { return deny("source_revalidation_failed"); }
    if (stillAllowed !== true) deny("source_access_revoked");

    const excerptDigest = sha(snapshot.excerpt);
    sources.push({
      id:sourceId, tenantId:scope.tenantId, sourceRef:grant.sourceRef,
      capturedAt:snapshot.capturedAt, excerpt:snapshot.excerpt, excerptDigest,
    });
    revisions.push({
      sourceId, tenantId:scope.tenantId, revision:grant.revision,
      sourceRef:grant.sourceRef, capturedAt:snapshot.capturedAt, excerptDigest,
    });
  }
  return {
    status:"source_capture_only",
    sources,
    evidenceDigest:sha(JSON.stringify(sources.map(s=>({
      sourceId:s.id,digest:s.excerptDigest,tenantId:s.tenantId,
    })))),
    provenanceDigest:sha(JSON.stringify(revisions)),
    externalActionsPerformed:0,
    modelCalls:0,
  };
}
