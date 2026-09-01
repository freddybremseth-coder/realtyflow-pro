export const EMAIL_OPERATION_AUDIT_ACTIONS = [
  "email_connection_health_repair",
  "email_history_backfill",
] as const;

export type EmailOperationAuditAction = (typeof EMAIL_OPERATION_AUDIT_ACTIONS)[number];

export interface EmailOperationAuditRow {
  id: string;
  action: string;
  agent_name?: string | null;
  status?: string | null;
  details?: Record<string, unknown> | null;
  created_at: string;
}

function text(value: unknown, max = 300) {
  if (value === null || value === undefined) return null;
  return String(value).slice(0, max);
}

function integer(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : null;
}

export function normalizeEmailOperationAuditRow(row: EmailOperationAuditRow) {
  if (!EMAIL_OPERATION_AUDIT_ACTIONS.includes(row.action as EmailOperationAuditAction)) return null;
  const details = row.details || {};
  const failedAccounts = Array.isArray(details.failed_accounts)
    ? details.failed_accounts.slice(0, 10).map((item) => {
        const entry = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
        return { email: text(entry.email, 200), error: text(entry.error, 300) };
      })
    : [];

  return {
    id: row.id,
    action: row.action as EmailOperationAuditAction,
    status: text(row.status, 50) || "unknown",
    agentName: text(row.agent_name, 100),
    createdAt: row.created_at,
    brandId: text(details.brand_id, 100),
    accountId: text(details.account_id, 100),
    emailAddress: text(details.email_address, 200),
    mode: text(details.mode, 30),
    sinceDays: integer(details.since_days),
    maxMessages: integer(details.max_messages),
    fetched: integer(details.fetched),
    candidates: integer(details.candidates),
    duplicates: integer(details.duplicates),
    skippedMissingMessageId: integer(details.skipped_missing_message_id),
    inserted: integer(details.inserted),
    accountFetchComplete:
      typeof details.account_fetch_complete === "boolean" ? details.account_fetch_complete : null,
    autoFetchPreserved:
      typeof details.auto_fetch_preserved === "boolean" ? details.auto_fetch_preserved : null,
    reason: text(details.reason, 300),
    error: text(details.error, 300),
    failedAccounts,
  };
}

export function filterEmailOperationAuditByBrand<T extends { brandId: string | null }>(rows: T[], brand?: string | null) {
  const normalized = String(brand || "").trim().toLowerCase();
  if (!normalized) return rows;
  return rows.filter((row) => String(row.brandId || "").trim().toLowerCase() === normalized);
}
