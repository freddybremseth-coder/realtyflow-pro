export const EMAIL_CONNECTION_REPAIR_CONFIRMATION = "REPAIR_EMAIL_CONNECTION";

export type EmailConnectionRepairRequest = {
  accountId: string;
};

export type EmailConnectionRepairPolicyResult =
  | { ok: true; request: EmailConnectionRepairRequest }
  | { ok: false; error: string };

export function resolveEmailConnectionRepairRequest(body: Record<string, unknown>): EmailConnectionRepairPolicyResult {
  const accountId = String(body.accountId || "").trim();
  if (!accountId) return { ok: false, error: "accountId is required" };
  if (body.confirm !== EMAIL_CONNECTION_REPAIR_CONFIRMATION) {
    return { ok: false, error: `repair requires confirm=${EMAIL_CONNECTION_REPAIR_CONFIRMATION}` };
  }
  return { ok: true, request: { accountId } };
}

export function buildEmailConnectionHealthRepairPatch(now: string) {
  return {
    auto_fetch_paused_by_system: false,
    health_status: "healthy",
    health_message: null,
    consecutive_failures: 0,
    last_error_at: null,
    last_success_at: now,
    updated_at: now,
  } as const;
}
