import { createHash } from "node:crypto";
import type { EvidenceLogWriter } from "./visibility-project-evidence-log";
import { PROJECT_EVIDENCE_ACTION } from "./visibility-project-evidence-log";

/** Server-only writer backed by the scoped unique index proposed in docs/sql/.
 * Requires the unique index to be deployed first; do not call before that.
 * A duplicate ID is only an idempotent replay when its canonical payload matches.
 */
type DbResult<T> = {data:T|null;error:{code?:string;message:string}|null};
export type EvidenceStore = {
  insert: (row: Record<string,unknown>) => Promise<DbResult<unknown>>;
  findByEventId: (eventId:string)=>Promise<DbResult<{details:Record<string,unknown>}>>;
};
function fingerprint(details:Record<string,unknown>) {
  return createHash("sha256").update(JSON.stringify({
    event_id:details.event_id,brand_id:details.brand_id,project_url:details.project_url,
    claim_key:details.claim_key,event:details.event,actor_id:details.actor_id,
    recorded_at:details.recorded_at,document_id:details.document_id,
    source_title:details.source_title,source_kind:details.source_kind,
    independently_verified:false,publication_authorized:false,approval_granted:false,
  })).digest("hex");
}
export function createProjectEvidenceWriter(store:EvidenceStore):EvidenceLogWriter {
 return {
  async insertIfAbsent(row,eventId) {
    if(row.action!==PROJECT_EVIDENCE_ACTION || row.details.event_id!==eventId)
      return {outcome:"conflict" as const,error:null};
    const written = await store.insert(row);
    if (!written.error) return {outcome:"inserted" as const,error:null};
    // Only the exact unique-index collision is eligible for replay handling.
    if(written.error.code!=="23505" || !written.error.message.includes("ux_visibility_project_claim_event_id"))
      return {outcome:"conflict" as const,error:{message:"Database insert failed"}};
    const existing=await store.findByEventId(eventId);
    if(existing.error || !existing.data)
      return {outcome:"conflict" as const,error:{message:"Duplicate evidence unavailable"}};
    return {outcome:fingerprint(existing.data.details)===fingerprint(row.details)?"already_exists" as const:"conflict" as const,error:null};
  },
 };
}
