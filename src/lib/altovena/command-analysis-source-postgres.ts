import type { PrivateAnalysisDb } from "./command-analysis-budget-postgres";
import type { PrivateEvidenceSnapshotStore } from "./command-analysis-source-capture";

/**
 * Adapter for a separately authenticated PRIVATE source-ingest worker.
 * It does not create credentials, expose an endpoint, read source URLs,
 * issue an attestation, or connect to the AI provider.
 */
export function createPrivateEvidenceSnapshotStore(db:PrivateAnalysisDb):
  PrivateEvidenceSnapshotStore {
  if (!db || typeof db.query!=="function")
    throw new Error("ALTOVENA_SOURCE_STORE_NOT_CONFIGURED");
  return {
    async save({scope,evidenceDigest,snapshots}) {
      const payload=snapshots.map(snapshot=>({
        sourceId:snapshot.id,
        sourceRef:snapshot.sourceRef,
        excerpt:snapshot.excerpt,
        excerptDigest:snapshot.excerptDigest,
        capturedAt:snapshot.capturedAt,
      }));
      const result=await db.query<{result:string}>(
        "select altovena.save_analysis_source_bundle("+
        "$1::uuid,$2::uuid,$3::uuid,$4::text,$5::jsonb) as result",
        [scope.tenantId,scope.missionId,scope.verifiedActorId,
          evidenceDigest,JSON.stringify(payload)],
      );
      if(result.rows.length!==1 || result.rows[0].result!==evidenceDigest)
        throw new Error("ALTOVENA_SOURCE_STORE_DURABILITY_UNKNOWN");
      return {kind:"stored" as const,evidenceDigest,sourceCount:snapshots.length};
    },
  };
}
