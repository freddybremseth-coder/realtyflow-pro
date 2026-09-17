export const EMAIL_DRAFT_MAX_ATTEMPTS = 5;

const RETRY_MINUTES = [10, 30, 120, 360] as const;

export function sanitizeEmailDraftError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? "Unknown error");
  return message.replace(/\s+/g, " ").trim().slice(0, 500);
}

export function nextEmailDraftRetry(attempt: number, now = new Date()) {
  const normalizedAttempt = Math.max(1, Math.floor(Number(attempt) || 1));
  if (normalizedAttempt >= EMAIL_DRAFT_MAX_ATTEMPTS) {
    return {
      attempt: normalizedAttempt,
      retryAfter: null as string | null,
      quarantinedAt: now.toISOString(),
      quarantined: true,
    };
  }

  const minutes = RETRY_MINUTES[Math.min(normalizedAttempt - 1, RETRY_MINUTES.length - 1)];
  return {
    attempt: normalizedAttempt,
    retryAfter: new Date(now.getTime() + minutes * 60_000).toISOString(),
    quarantinedAt: null as string | null,
    quarantined: false,
  };
}
