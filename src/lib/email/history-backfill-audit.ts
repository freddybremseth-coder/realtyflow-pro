export type EmailHistoryBackfillAuditStatus = "preview" | "success" | "stale_preview" | "failed";

export interface EmailHistoryBackfillAuditInput {
  status: EmailHistoryBackfillAuditStatus;
  brandId: string;
  mode: "preview" | "apply";
  sinceDays: number;
  maxMessages: number;
  includeSent: boolean;
  fetched: number;
  candidates: number;
  duplicates: number;
  skippedMissingMessageId: number;
  inserted: number;
  accountCount: number;
  accountErrorCount: number;
  previewFingerprintMatches?: boolean | null;
  error?: string | null;
}

export function buildEmailHistoryBackfillAuditLog(input: EmailHistoryBackfillAuditInput) {
  return {
    action: "email_history_backfill",
    agent_name: "nexus_communications",
    status: input.status,
    details: {
      brand_id: input.brandId,
      mode: input.mode,
      since_days: input.sinceDays,
      max_messages: input.maxMessages,
      include_sent: input.includeSent,
      fetched: input.fetched,
      candidates: input.candidates,
      duplicates: input.duplicates,
      skipped_missing_message_id: input.skippedMissingMessageId,
      inserted: input.inserted,
      account_count: input.accountCount,
      account_error_count: input.accountErrorCount,
      preview_fingerprint_matches: input.previewFingerprintMatches ?? null,
      error: input.error ? input.error.slice(0, 300) : null,
      message_content_logged: false,
      credentials_logged: false,
      automatic_crm_linking: false,
      email_sent: false,
    },
  };
}
