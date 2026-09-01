import { classifyEmailConfigReadiness, type EmailConfigReadinessInput } from "@/lib/email/config-readiness";

export type EmailHistoryBackfillReadinessConfig = EmailConfigReadinessInput & {
  email_address?: string | null;
};

export type EmailHistoryBackfillBlockedAccount = {
  email: string | null;
  state: string;
  reason: string;
};

export type EmailHistoryBackfillReadinessResult =
  | { ok: true; blockedAccounts: [] }
  | { ok: false; blockedAccounts: EmailHistoryBackfillBlockedAccount[] };

export function evaluateEmailHistoryBackfillReadiness(
  configs: EmailHistoryBackfillReadinessConfig[]
): EmailHistoryBackfillReadinessResult {
  const blockedAccounts = configs.flatMap((config) => {
    const readiness = classifyEmailConfigReadiness(config);
    if (readiness.state === "ready" && readiness.canBackfill) return [];
    return [{
      email: config.email_address?.trim() || null,
      state: readiness.state,
      reason: readiness.reason,
    }];
  });

  return blockedAccounts.length > 0
    ? { ok: false, blockedAccounts }
    : { ok: true, blockedAccounts: [] };
}
