/**
 * Agentic Core — tre distinkte identiteter (Hardening 1.1, punkt 3):
 *  - correlationId: observability-sporing (gjenbruker RealtyFlows rf_-format)
 *  - runId:         unik, persistent Agent Run-ID
 *  - idempotencyKey: stabil SHA-256-nøkkel for retry/dedupe (per operasjon)
 *
 * Den gamle 32-bit meldingshashen skal ALDRI være permanent dedupe-identitet.
 */

import { createHash, randomBytes } from "node:crypto";

export { generateCorrelationId } from "@/lib/observability";

/** Unik Agent Run-ID (egen identitet, ikke lik correlationId eller dedupeKey). */
export function newRunId(now = Date.now()): string {
  return `run_${now.toString(36)}_${randomBytes(9).toString("hex")}`;
}

export function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

/**
 * Stabil, kryptografisk dedupe-nøkkel for et helt intake. Samme kilde/eksternId
 * (eller canonical fingerprint av innholdet) gir alltid samme nøkkel → trygg
 * retry/dedupe på tvers av restart.
 */
export function intakeFingerprint(parts: {
  source: string;
  externalId?: string | null;
  contact?: string | null;
  message?: string | null;
}): string {
  const canonical = [
    parts.source.trim().toLowerCase(),
    (parts.externalId ?? "").trim().toLowerCase(),
    (parts.contact ?? "").trim().toLowerCase(),
    (parts.message ?? "").trim().replace(/\s+/g, " ").toLowerCase(),
  ].join("|");
  return `intake_${sha256(canonical).slice(0, 40)}`;
}

/**
 * Operasjons-scoped idempotency-nøkkel (punkt 4): samme agent-run kan legitimt
 * ha flere drafts/approvals. Correlation/run-ID er IKKE unik nok alene.
 * F.eks. operationIdempotencyKey(runId, "create_draft", "customer") og
 * operationIdempotencyKey(runId, "request_approval", `send:${draftId}`).
 */
export function operationIdempotencyKey(runId: string, operation: string, discriminator = "v1"): string {
  return `op_${sha256(`${runId}:${operation}:${discriminator}`).slice(0, 40)}`;
}
