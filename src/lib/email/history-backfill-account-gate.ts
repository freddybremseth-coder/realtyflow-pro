export interface EmailHistoryBackfillAccountResultLike {
  email: string;
  error?: string;
}

export interface EmailHistoryBackfillAccountGateResult {
  ok: boolean;
  failedAccounts: Array<{ email: string; error: string }>;
}

export function evaluateEmailHistoryBackfillAccountGate(
  accounts: EmailHistoryBackfillAccountResultLike[]
): EmailHistoryBackfillAccountGateResult {
  const failedAccounts = accounts
    .filter((account) => Boolean(account.error))
    .map((account) => ({
      email: account.email,
      error: String(account.error || "Unknown account fetch error"),
    }));

  return {
    ok: failedAccounts.length === 0,
    failedAccounts,
  };
}
