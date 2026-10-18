import type { EvidenceStore } from "./visibility-project-db-writer";
import { PROJECT_EVIDENCE_ACTION } from "./visibility-project-evidence-log";

/**
 * Server-only PostgREST adapter. Requires the scoped unique index on
 * automation_logs(action, details->>'event_id') before enabling writes.
 * Database-backed uniqueness, not a preflight read, handles concurrency.
 */
export type EvidenceDb = {
  from: (table: string) => {
    insert: (row: Record<string, unknown>) => Promise<{data:unknown;error:{code?:string;message:string}|null}>;
    select: (columns: string) => {
      eq: (column: string, value: string) => {
        eq: (column: string, value: string) => {
          maybeSingle: () => Promise<{data:{details:Record<string,unknown>}|null;error:{code?:string;message:string}|null}>;
        };
      };
    };
  };
};
export function createProjectEvidenceStore(db:EvidenceDb):EvidenceStore {
  return {
    async insert(row) {
      return db.from("automation_logs").insert(row);
    },
    async findByEventId(eventId) {
      return db.from("automation_logs").select("details")
        .eq("action",PROJECT_EVIDENCE_ACTION)
        .eq("details->>event_id",eventId).maybeSingle();
    },
  };
}
