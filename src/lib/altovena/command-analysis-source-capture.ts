import { createHash } from "node:crypto";
import type { TrustedEvidence } from "./command-analysis-evidence";

/**
 * No URL fetching or model calls. Every source is resolved through a
 * caller-supplied trusted, tenant-authorized connector. A user/model-supplied
 * source URL or excerpt can never enter this API.
 *
 * Source text remains UNTRUSTED instructions even after authenticity checks.
 */
export type SourceCaptureScope = Readonly<{
  tenantId: string;
  missionId: string;
  verifiedActorId: string;
}>;
export type AuthorizedSourceMaterial = Readonly<{
  id: string;
  tenantId: string;
  missionId: string;
  authorizedActorId: string;
  sourceRef: string;
  excerpt: string;
  capturedAt: string;
  access: "authorized_for_this_mission";
}>;
export interface AuthorizedSourceConnector {
  readForMission(input: Readonly<{
    scope: SourceCaptureScope;
    sourceId: string;
  }>): Promise<AuthorizedSourceMaterial | null>;
  /** Recheck live source access after all reads and before snapshot storage. */
  revalidateForMission(input: Readonly<{
    scope: SourceCaptureScope;
    sourceId: string;
    sourceRef: string;
    excerptDigest: string;
    capturedAt: string;
  }>): Promise<boolean>;
}
export interface PrivateEvidenceSnapshotStore {
  /** Atomic, default-deny insert: never silently replace a stored snapshot. */
  save(input: Readonly<{
    scope: SourceCaptureScope;
    evidenceDigest: string;
    snapshots: readonly TrustedEvidence[];
  }>): Promise<Readonly<{ kind: "stored"; evidenceDigest: string; sourceCount: number }>>;
}

export class SourceCaptureDenied extends Error {
  constructor(readonly reason: string) {
    super("ALTOVENA_SOURCE_CAPTURE_DENIED:" + reason);
    this.name = "SourceCaptureDenied";
  }
}
function fail(reason: string): never { throw new SourceCaptureDenied(reason); }
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const SOURCE = /^[a-z0-9_-]{3,64}$/;
const INTERNAL_REF = /^internal:[a-z0-9/_:.-]{3,200}$/;

export function digestVerifiedSourceBundle(
  scope: Pick<SourceCaptureScope, "tenantId" | "missionId">,
  sources: readonly Pick<TrustedEvidence, "id" | "excerptDigest">[],
): string {
  if (!UUID.test(scope.tenantId) || !UUID.test(scope.missionId) ||
      !Array.isArray(sources) || sources.length < 1 || sources.length > 12)
    return fail("invalid_bundle_identity");
  const sorted = [...sources].sort((a,b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  if (sorted.some((s,i)=>!SOURCE.test(s.id) ||
      !/^[a-f0-9]{64}$/.test(s.excerptDigest) ||
      (i>0 && s.id === sorted[i-1].id))) fail("invalid_bundle_manifest");
  const manifest = ["altovena-source-bundle-v1",scope.tenantId,scope.missionId,
    ...sorted.map(s=>s.id+":"+s.excerptDigest)].join("\n");
  return createHash("sha256").update(manifest,"utf8").digest("hex");
}

export async function captureAuthorizedCommandSources(input: Readonly<{
  scope: SourceCaptureScope;
  sourceIds: readonly string[];
  connector: AuthorizedSourceConnector;
  store: PrivateEvidenceSnapshotStore;
  now: string;
}>): Promise<Readonly<{
  evidenceDigest: string;
  sourceCount: number;
  snapshots: readonly TrustedEvidence[];
  status: "stored_for_independent_review";
}>> {
  if (!input || !input.connector || !input.store ||
    !UUID.test(input.scope?.tenantId ?? "") ||
    !UUID.test(input.scope?.missionId ?? "") ||
    !UUID.test(input.scope?.verifiedActorId ?? "")) fail("invalid_capture_scope");
  if (!Array.isArray(input.sourceIds) ||
    input.sourceIds.length < 1 || input.sourceIds.length > 12 ||
    new Set(input.sourceIds).size !== input.sourceIds.length ||
    input.sourceIds.some(id=>!SOURCE.test(id))) fail("invalid_source_ids");
  const now = Date.parse(input.now);
  if (!Number.isFinite(now)) fail("invalid_capture_clock");
  const snapshots:TrustedEvidence[] = [];
  let bytes = 0;
  for (const sourceId of input.sourceIds) {
    // Mandatory authorized resolution; no generic fetch(), arbitrary host,
    // model-generated URL or free-text source injection.
    const value=await input.connector.readForMission({
      scope:input.scope,sourceId,
    });
    if (value === null) throw new SourceCaptureDenied("unauthorized_or_invalid_source");
    if (value.access!=="authorized_for_this_mission" ||
      value.id!==sourceId || value.tenantId!==input.scope.tenantId ||
      value.missionId!==input.scope.missionId ||
      value.authorizedActorId!==input.scope.verifiedActorId ||
      !INTERNAL_REF.test(value.sourceRef) ||
      typeof value.excerpt!=="string" ||
      value.excerpt.trim().length < 12 || value.excerpt.length > 4000 ||
      value.excerpt.includes("\0")) fail("unauthorized_or_invalid_source");
    const captured = Date.parse(value.capturedAt);
    if (!Number.isFinite(captured) || captured>now ||
        now-captured>15*60_000 ||
        new Date(captured).toISOString()!==value.capturedAt)
      fail("stale_or_invalid_source_capture");
    bytes+=Buffer.byteLength(value.excerpt,"utf8");
    if(bytes>16000)fail("total_source_size_exceeded");
    snapshots.push(Object.freeze({
      id:value.id,tenantId:value.tenantId,sourceRef:value.sourceRef,
      capturedAt:value.capturedAt,excerpt:value.excerpt,
      excerptDigest:createHash("sha256").update(value.excerpt,"utf8").digest("hex"),
    }));
  }
  // Permission may expire or be revoked during multi-source capture.
  // Reject the entire bundle rather than persist any unauthorized snapshot.
  if (typeof input.connector.revalidateForMission !== "function")
    fail("source_revalidation_required");
  for (const snapshot of snapshots) {
    let authorized:boolean;
    try {
      authorized=await input.connector.revalidateForMission({
        scope:input.scope,sourceId:snapshot.id,
        sourceRef:snapshot.sourceRef,
        excerptDigest:snapshot.excerptDigest,capturedAt:snapshot.capturedAt,
      });
    } catch { return fail("source_revalidation_unavailable"); }
    if (authorized !== true) fail("source_access_revoked_after_read");
  }
  const evidenceDigest=digestVerifiedSourceBundle(input.scope,snapshots);
  const saved=await input.store.save({
    scope:input.scope,evidenceDigest,snapshots:Object.freeze(snapshots),
  });
  if (!saved || saved.kind!=="stored" ||
    saved.evidenceDigest!==evidenceDigest ||
    saved.sourceCount!==snapshots.length) fail("snapshot_not_durably_stored");
  return Object.freeze({
    evidenceDigest,sourceCount:snapshots.length,
    snapshots:Object.freeze(snapshots),
    status:"stored_for_independent_review" as const,
  });
}
