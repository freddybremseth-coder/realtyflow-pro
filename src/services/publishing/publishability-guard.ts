/**
 * Phase 7.1F — delt publishability-guard for LEGACY content_publications-stien.
 * Gjenbruker ÉN felles contentPublishabilityGate (samme som nytt Growth OS —
 * ingen duplisert blacklist).
 *
 *  - assertPublishableForStatus: status-overgangs-guard. En rad kan ikke gå til
 *    review/approved/scheduled/publishing/published uten publishable body
 *    (+ non-empty + gyldig media der påkrevd).
 *  - auditPublications: read-only skann av eksisterende kø for agent/meta/
 *    placeholder-signaler (nøytraliseres kontrollert — sletter aldri).
 */

import { contentPublishabilityGate, type PublishabilityCheck } from "@/lib/marketing/autonomous/publishability";

export { contentPublishabilityGate };

/** Statuser som betyr «på vei ut / ute» — krever publishable innhold. */
export const PUBLISHABLE_STATUSES = ["review", "approved", "scheduled", "publishing", "published"] as const;

export interface TransitionGuardInput {
  content: string | null | undefined;
  targetStatus: string;
  platform?: string | null;
  mediaRequired?: boolean;
  mediaOk?: boolean;
}
export interface TransitionGuardResult {
  ok: boolean;
  reason?: string;
  check?: PublishabilityCheck;
}

const VALID_PLATFORMS = ["instagram", "facebook", "linkedin", "youtube", "tiktok", "pinterest"];

export function assertPublishableForStatus(input: TransitionGuardInput): TransitionGuardResult {
  // Interne statuser (draft/failed/pending/…) er alltid tillatt.
  if (!PUBLISHABLE_STATUSES.includes(input.targetStatus as (typeof PUBLISHABLE_STATUSES)[number])) return { ok: true };

  const body = (input.content ?? "").trim();
  if (!body) return { ok: false, reason: "EMPTY_BODY" };

  const check = contentPublishabilityGate(body);
  if (!check.publishable) return { ok: false, reason: `PUBLISHABILITY_FAILED: ${check.result} — ${check.reason}`, check };

  if (input.platform && !VALID_PLATFORMS.includes(input.platform)) return { ok: false, reason: `INVALID_PLATFORM: ${input.platform}` };
  if (input.mediaRequired && !input.mediaOk) return { ok: false, reason: "MEDIA_REQUIRED" };
  return { ok: true, check };
}

export interface PublicationRowLike {
  id: string;
  brand_id?: string | null;
  platform?: string | null;
  status?: string | null;
  body?: string | null;
  content?: string | null;
  description?: string | null;
  scheduled_for?: string | null;
}
export interface PublicationAuditHit {
  id: string;
  brand: string | null;
  platform: string | null;
  status: string | null;
  result: PublishabilityCheck["result"];
  reason: string;
  scheduledFor: string | null;
  bodyPreview: string;
}

/** Klassifiser én rad. Returnerer et treff kun hvis innholdet IKKE er publishable. */
export function auditPublicationRow(row: PublicationRowLike): PublicationAuditHit | null {
  const body = row.body ?? row.content ?? row.description ?? "";
  const check = contentPublishabilityGate(body);
  if (check.publishable) return null;
  return {
    id: row.id, brand: row.brand_id ?? null, platform: row.platform ?? null, status: row.status ?? null,
    result: check.result, reason: check.reason, scheduledFor: row.scheduled_for ?? null,
    bodyPreview: String(body).slice(0, 200),
  };
}

/** Read-only skann. Sletter/endrer aldri — returnerer liste til kontrollert opprydding. */
export function auditPublications(rows: PublicationRowLike[]): PublicationAuditHit[] {
  return rows.map(auditPublicationRow).filter((h): h is PublicationAuditHit => h !== null);
}
