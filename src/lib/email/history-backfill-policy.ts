export const EMAIL_HISTORY_BACKFILL_CONFIRMATION = "BACKFILL_EMAIL_HISTORY";
export const EMAIL_HISTORY_BACKFILL_MAX_DAYS = 730;
export const EMAIL_HISTORY_BACKFILL_MAX_MESSAGES = 500;

export type EmailHistoryBackfillMode = "preview" | "apply";

export interface EmailHistoryBackfillRequest {
  brandId: string;
  sinceDays: number;
  maxMessages: number;
  includeSent: boolean;
  mode: EmailHistoryBackfillMode;
  previewFingerprint?: string;
}

export interface EmailHistoryBackfillPolicyResult {
  ok: boolean;
  request?: EmailHistoryBackfillRequest;
  error?: string;
}

function boundedInteger(value: unknown, fallback: number, min: number, max: number) {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(parsed)));
}

export function resolveEmailHistoryBackfillRequest(body: Record<string, unknown>): EmailHistoryBackfillPolicyResult {
  const brandId = String(body.brand_id || "").trim();
  if (!brandId) return { ok: false, error: "brand_id is required" };

  const mode: EmailHistoryBackfillMode = body.mode === "apply" ? "apply" : "preview";
  const previewFingerprint = String(body.preview_fingerprint || "").trim();
  if (mode === "apply" && body.confirm !== EMAIL_HISTORY_BACKFILL_CONFIRMATION) {
    return { ok: false, error: `apply requires confirm=${EMAIL_HISTORY_BACKFILL_CONFIRMATION}` };
  }
  if (mode === "apply" && !previewFingerprint) {
    return { ok: false, error: "apply requires preview_fingerprint from a successful preview" };
  }

  return {
    ok: true,
    request: {
      brandId,
      sinceDays: boundedInteger(body.since_days, 365, 1, EMAIL_HISTORY_BACKFILL_MAX_DAYS),
      maxMessages: boundedInteger(body.max_messages, 250, 1, EMAIL_HISTORY_BACKFILL_MAX_MESSAGES),
      includeSent: body.include_sent !== false,
      mode,
      previewFingerprint: previewFingerprint || undefined,
    },
  };
}
