export type EmailConfigReadinessState =
  | "ready"
  | "inactive"
  | "missing_credentials"
  | "missing_imap"
  | "paused"
  | "never_verified"
  | "unhealthy";

export interface EmailConfigReadinessInput {
  is_active?: boolean | null;
  imap_host?: string | null;
  encrypted_password?: string | null;
  encryption_iv?: string | null;
  health_status?: string | null;
  health_message?: string | null;
  auto_fetch_paused_by_system?: boolean | null;
  last_success_at?: string | null;
  consecutive_failures?: number | null;
}

export interface EmailConfigReadiness {
  state: EmailConfigReadinessState;
  credentialsConfigured: boolean;
  connectionVerified: boolean;
  canAttemptConnection: boolean;
  canBackfill: boolean;
  reason: string;
}

export function classifyEmailConfigReadiness(
  config: EmailConfigReadinessInput
): EmailConfigReadiness {
  const credentialsConfigured = Boolean(
    config.encrypted_password?.trim() && config.encryption_iv?.trim()
  );
  const hasImap = Boolean(config.imap_host?.trim());
  const active = config.is_active !== false;
  const connectionVerified = Boolean(config.last_success_at);
  const systemPaused = config.auto_fetch_paused_by_system === true;
  const health = (config.health_status || "").trim().toLowerCase();
  const failures = Math.max(0, config.consecutive_failures || 0);

  if (!active) {
    return {
      state: "inactive",
      credentialsConfigured,
      connectionVerified,
      canAttemptConnection: false,
      canBackfill: false,
      reason: "Email configuration is inactive.",
    };
  }

  if (!credentialsConfigured) {
    return {
      state: "missing_credentials",
      credentialsConfigured: false,
      connectionVerified,
      canAttemptConnection: false,
      canBackfill: false,
      reason: "Encrypted mailbox credentials are missing.",
    };
  }

  if (!hasImap) {
    return {
      state: "missing_imap",
      credentialsConfigured,
      connectionVerified,
      canAttemptConnection: false,
      canBackfill: false,
      reason: "IMAP host is missing.",
    };
  }

  if (systemPaused || health === "paused") {
    return {
      state: "paused",
      credentialsConfigured,
      connectionVerified,
      canAttemptConnection: true,
      canBackfill: false,
      reason:
        config.health_message?.trim() ||
        "Mailbox fetching is paused by the system after connection failures.",
    };
  }

  if (!connectionVerified) {
    return {
      state: "never_verified",
      credentialsConfigured,
      connectionVerified: false,
      canAttemptConnection: true,
      canBackfill: false,
      reason: "No successful mailbox connection has been recorded yet.",
    };
  }

  if (health === "error" || health === "unhealthy" || failures > 0) {
    return {
      state: "unhealthy",
      credentialsConfigured,
      connectionVerified: true,
      canAttemptConnection: true,
      canBackfill: false,
      reason:
        config.health_message?.trim() ||
        "Mailbox health is not clean enough for historical backfill.",
    };
  }

  return {
    state: "ready",
    credentialsConfigured,
    connectionVerified: true,
    canAttemptConnection: true,
    canBackfill: true,
    reason: "Mailbox configuration has verified credentials and a successful connection.",
  };
}
