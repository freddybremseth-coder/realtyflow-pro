import type {
  AnalysisAdmissionRepository,
  AnalysisModelAdmission,
  AnalysisRunSettle,
} from "./command-analysis-openai-adapter";
import type { TrustedAnalysisScope } from "./command-analysis-evidence";

/**
 * PRIVATE PostgreSQL adapter for the Altovena admission contract.
 *
 * Inject ONLY a privileged, server-side private PostgreSQL connection with
 * no browser access. No connection, credential, worker, API route or model
 * call is instantiated here. Public Supabase PostgREST/service_role are not
 * granted access to the underlying SQL functions.
 */
type PgResult<T> = Readonly<{ rows: T[] }>;
export interface PrivateAnalysisDb {
  query<T extends Record<string, unknown> = Record<string, unknown>>(
    sql: string,
    values: readonly unknown[],
  ): Promise<PgResult<T>>;
}

type ReserveRow = {
  result_kind: "reserved" | "duplicate";
  result_reservation_id: string | null;
};
type SettleRow = { result: "settled" | "already_settled" };

const reject = (reason: string): never => {
  throw new Error("ALTOVENA_PRIVATE_BUDGET_DB:" + reason);
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function createPrivateAnalysisAdmissionRepository(db: PrivateAnalysisDb):
  AnalysisAdmissionRepository {
  if (!db || typeof db.query !== "function") reject("missing_private_database");
  return {
    async reserve(input: Readonly<{
      permit: AnalysisModelAdmission;
      scope: TrustedAnalysisScope;
      evidenceDigest: string;
    }>) {
      const {permit,scope,evidenceDigest}=input;
      if (!UUID.test(permit.permitId) ||
        !UUID.test(scope.tenantId) || !UUID.test(scope.verifiedActorId) ||
        permit.tenantId !== scope.tenantId ||
        permit.missionId !== scope.missionId ||
        permit.verifiedActorId !== scope.verifiedActorId ||
        permit.agentId !== scope.agentId ||
        permit.goalDigest !== scope.goalDigest ||
        permit.routingDigest !== scope.routingDigest ||
        !/^[a-f0-9]{64}$/.test(evidenceDigest))
        return {kind:"denied" as const};
      let result:PgResult<ReserveRow>;
      try {
        result=await db.query<ReserveRow>(
          "select result_kind,result_reservation_id from altovena.reserve_analysis_budget("+
          "$1::uuid,$2::uuid,$3::uuid,$4::text,$5::text,$6::text,"+
          "$7::text,$8::text,$9::integer,$10::integer,$11::bigint)",
          [permit.permitId,scope.tenantId,scope.verifiedActorId,evidenceDigest,
           permit.agentId,permit.model,permit.goalDigest,permit.routingDigest,
           permit.maxInputTokens,permit.maxOutputTokens,permit.reservedCostCents],
        );
      } catch(error) {
        // PostgreSQL policy violations deny the call but cannot be retried.
        // Infra failures propagate; the provider adapter will never send.
        if (error && typeof error==="object" && "code" in error &&
          (error.code==="22023" || error.code==="42501")) {
          return {kind:"denied" as const};
        }
        throw error;
      }
      if (result.rows.length!==1) return reject("unexpected_reservation_rows");
      const row=result.rows[0];
      if (row.result_kind==="duplicate" && row.result_reservation_id===null)
        return {kind:"duplicate" as const};
      if (row.result_kind==="reserved" && typeof row.result_reservation_id==="string" &&
        UUID.test(row.result_reservation_id))
        return {kind:"reserved" as const,reservationId:row.result_reservation_id};
      return reject("invalid_reservation_receipt");
    },
    async settle(input:AnalysisRunSettle) {
      if (!UUID.test(input.reservationId)) reject("invalid_reservation_id");
      // Full cost hold remains in PostgreSQL. Incomplete or unverified
      // responses are uncertain; no automatic retry of a provider request.
      const usage=input.usage;
      const result=await db.query<SettleRow>(
        "select altovena.settle_analysis_budget("+
        "$1::uuid,$2::text,$3::integer,$4::integer,$5::integer,$6::text) as result",
        [input.reservationId,input.state,
         usage?.inputTokens ?? null,usage?.outputTokens ?? null,
         usage?.totalTokens ?? null,input.resultDigest],
      );
      if (result.rows.length!==1 ||
        !["settled","already_settled"].includes(result.rows[0].result))
        reject("invalid_settlement_receipt");
    },
  };
}
