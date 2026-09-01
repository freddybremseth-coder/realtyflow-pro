export interface EmailHistoryBackfillAuditInput {
  brandId: string;
  mode: "preview" | "apply";
  status: "success" | "blocked" | "failed";
  sinceDays: number;
  maxMessages: number;
  includeSent: boolean;
  fetched: number;
  candidates: number;
  duplicates: number;
  skippedMissingMessageId: number;
  inserted: number;
  accountFetchComplete: boolean;
  failedAccounts?: Array<{ email: string; error: string }>;
  reason?: string;
}

export function buildEmailHistoryBackfillAuditDetails(input: EmailHistoryBackfillAuditInput) {
  return {
    brand_id: input.brandId,
    mode: input.mode,
    status: input.status,
    since_days: input.sinceDays,
    max_messages: input.maxMessages,
    include_sent: input.includeSent,
    fetched: input.fetched,
    candidates: input.candidates,
    duplicates: input.duplicates,
    skipped_missing_message_id: input.skippedMissingMessageId,
    inserted: input.inserted,
    account_fetch_complete: input.accountFetchComplete,
    failed_accounts: (input.failedAccounts || []).map((account) => ({
      email: account.email,
      error: account.error.slice(0, 300),
    })),
    reason: input.reason ? input.reason.slice(0, 300) : null,
    message_content_logged: false,
    credentials_logged: false,
    automatic_crm_linking: false,
    email_sent: false,
  };
}
