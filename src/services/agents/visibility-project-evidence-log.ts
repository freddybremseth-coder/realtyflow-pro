import type { ProjectEvidenceEvent } from "./visibility-project-evidence-history";

/**
 * Server-side event persistence boundary. Target: existing automation_logs,
 * which denies direct anon/authenticated access. Only a separately authorized
 * server caller can supply a writer. This does NOT grant approval or publishing.
 */
export type EvidenceLogWriter = {
  /** Must be implemented by a DB transaction or unique event-id constraint. A preflight SELECT then INSERT is NOT atomic. */
  insertIfAbsent: (row: { action: string; agent_name: string; status: string; details: Record<string, unknown> }, eventId: string) =>
    Promise<{ outcome: "inserted" | "already_exists" | "conflict"; error: { message: string } | null }>;
};
export const PROJECT_EVIDENCE_ACTION = "visibility_project_claim_event";

const eventKinds = new Set(["SOURCE_RECORDED", "REVIEW_REQUESTED", "REVIEW_ATTESTED", "REVIEW_REVOKED"]);
export function prepareProjectEvidenceLog(event: ProjectEvidenceEvent, authenticatedActorId: string) {
  if (!authenticatedActorId || event.actorId !== authenticatedActorId) throw new Error("ACTOR_MISMATCH");
  if (event.brandId !== "zeneco" || !eventKinds.has(event.event)) throw new Error("BRAND_OR_EVENT_NOT_ALLOWED");
  if (!/^[a-zA-Z0-9-]{8,80}$/.test(event.eventId)) throw new Error("INVALID_EVENT_ID");
  const url = new URL(event.projectUrl);
  if (url.protocol !== "https:" || !["www.zenecohomes.com", "zenecohomes.com"].includes(url.hostname) ||
      !new RegExp("^/(?:eiendommer|properties|immobilien|propiedades)/[^/]+/?$", "i").test(url.pathname) ||
      url.search || url.hash || url.username || url.password || url.port) throw new Error("UNSUPPORTED_PROJECT_URL");
  if (!event.recordedAt || !Number.isFinite(Date.parse(event.recordedAt))) throw new Error("INVALID_TIME");
  return {
    action: PROJECT_EVIDENCE_ACTION,
    agent_name: "altovena_visibility",
    status: "success",
    details: {
      event_id: event.eventId, brand_id: event.brandId, project_url: url.href,
      claim_key: event.claimKey, event: event.event, actor_id: authenticatedActorId,
      recorded_at: event.recordedAt,
      // Restrict to metadata, never insert raw contracts or private brochure contents.
      document_id: event.evidence?.documentId ?? null,
      source_title: event.evidence?.sourceTitle?.slice(0, 200) ?? null,
      source_kind: event.evidence?.sourceKind ?? null,
      // A logged event is not independently verified or an approval.
      independently_verified: false, publication_authorized: false, approval_granted: false,
    },
  };
}

/** Caller must enforce owner/brand authorization and event-id idempotency transactionally. */
export async function appendProjectEvidenceLog(writer: EvidenceLogWriter, event: ProjectEvidenceEvent,
  authenticatedActorId: string, authorizationConfirmed: boolean) {
  if (!authorizationConfirmed) throw new Error("AUTHORIZATION_REQUIRED");
  const row = prepareProjectEvidenceLog(event, authenticatedActorId);
  const result = await writer.insertIfAbsent(row, event.eventId);
  if (result.error) throw new Error("EVIDENCE_WRITE_FAILED");
  if (result.outcome === "conflict") throw new Error("EVENT_ID_PAYLOAD_CONFLICT");
  return { recorded: true as const, alreadyRecorded: result.outcome === "already_exists",
    approvalGranted: false as const, publicationEligible: false as const };
}
