export type RemasterWorkerSkeletonStatus = "disabled" | "invalid_config" | "claim_disabled";

export interface RemasterWorkerConfig {
  enabled: boolean;
  workerId: string;
  pollIntervalMs: number;
  leaseSeconds: number;
  heartbeatIntervalMs: number;
  maxConcurrency: number;
  testSongPrefix: string;
  realtyflowApiUrl: string;
  hasServerCredential: boolean;
}

export interface LoadedRemasterWorkerConfig {
  config: RemasterWorkerConfig;
  errors: string[];
}

export interface RemasterWorkerSkeletonResult {
  status: RemasterWorkerSkeletonStatus;
  workerId: string;
  errors: string[];
  message: string;
}

const DEFAULT_TEST_SONG_PREFIX = "REMASTER-WORKER-TEST-";
const CLAIM_DISABLED_MESSAGE = "Worker skeleton loaded, but job claiming is disabled in this PR.";

const SENSITIVE_KEYS = new Set([
  "access_token",
  "accessToken",
  "authorization",
  "connection_string",
  "connectionString",
  "lease_token",
  "leaseToken",
  "migration_secret",
  "migrationSecret",
  "oauth_token",
  "oauthToken",
  "refresh_token",
  "refreshToken",
  "service_role",
  "serviceRole",
]);

function parseBoolean(value: string | undefined) {
  return value === "1" || value === "true" || value === "TRUE" || value === "yes";
}

function parseInteger(value: string | undefined, fallback: number) {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function redactString(value: string) {
  return value
    .replace(/postgres:\/\/[^\s"']+/gi, "[REDACTED_CONNECTION_STRING]")
    .replace(/bearer\s+[a-z0-9._-]+/gi, "Bearer [REDACTED]")
    .replace(/(service_role|migration secret|oauth token|access token|refresh token|lease token)/gi, "[REDACTED]");
}

export function sanitizeWorkerDiagnostics(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((entry) => sanitizeWorkerDiagnostics(entry));
  if (!value || typeof value !== "object") {
    return typeof value === "string" ? redactString(value) : value;
  }

  const sanitized: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    sanitized[key] = SENSITIVE_KEYS.has(key) ? "[REDACTED]" : sanitizeWorkerDiagnostics(entry);
  }
  return sanitized;
}

export function loadRemasterWorkerConfig(env: NodeJS.ProcessEnv = process.env): LoadedRemasterWorkerConfig {
  const config: RemasterWorkerConfig = {
    enabled: parseBoolean(env.REMASTER_WORKER_ENABLED),
    workerId: env.REMASTER_WORKER_ID || "remaster-worker-disabled-local",
    pollIntervalMs: parseInteger(env.REMASTER_WORKER_POLL_INTERVAL_MS, 10_000),
    leaseSeconds: parseInteger(env.REMASTER_WORKER_LEASE_SECONDS, 60),
    heartbeatIntervalMs: parseInteger(env.REMASTER_WORKER_HEARTBEAT_INTERVAL_MS, 20_000),
    maxConcurrency: parseInteger(env.REMASTER_WORKER_MAX_CONCURRENCY, 1),
    testSongPrefix: env.REMASTER_WORKER_TEST_SONG_PREFIX || DEFAULT_TEST_SONG_PREFIX,
    realtyflowApiUrl: (env.REALTYFLOW_API_URL || "").replace(/\/$/, ""),
    hasServerCredential: Boolean(env.REALTYFLOW_MIGRATION_SECRET),
  };

  const errors: string[] = [];
  if (config.pollIntervalMs < 1_000 || config.pollIntervalMs > 300_000) {
    errors.push("REMASTER_WORKER_POLL_INTERVAL_MS must be between 1000 and 300000.");
  }
  if (config.leaseSeconds < 15 || config.leaseSeconds > 900) {
    errors.push("REMASTER_WORKER_LEASE_SECONDS must be between 15 and 900.");
  }
  if (config.heartbeatIntervalMs < 1_000 || config.heartbeatIntervalMs >= config.leaseSeconds * 1_000) {
    errors.push("REMASTER_WORKER_HEARTBEAT_INTERVAL_MS must be shorter than the lease duration.");
  }
  if (config.maxConcurrency !== 1) {
    errors.push("REMASTER_WORKER_MAX_CONCURRENCY must remain 1 in the disabled skeleton phase.");
  }
  if (!config.testSongPrefix.startsWith("REMASTER-WORKER-TEST-")) {
    errors.push("REMASTER_WORKER_TEST_SONG_PREFIX must start with REMASTER-WORKER-TEST-.");
  }
  if (config.enabled && !config.realtyflowApiUrl) {
    errors.push("REALTYFLOW_API_URL is required before the worker can be enabled.");
  }
  if (config.enabled && !config.hasServerCredential) {
    errors.push("REALTYFLOW_MIGRATION_SECRET is required before the worker can be enabled.");
  }

  return { config, errors };
}

export async function runRemasterWorkerSkeleton(
  loaded: LoadedRemasterWorkerConfig = loadRemasterWorkerConfig(),
): Promise<RemasterWorkerSkeletonResult> {
  const { config, errors } = loaded;
  if (!config.enabled) {
    return {
      status: "disabled",
      workerId: config.workerId,
      errors: [],
      message: "Worker is disabled by REMASTER_WORKER_ENABLED.",
    };
  }

  if (errors.length > 0) {
    return {
      status: "invalid_config",
      workerId: config.workerId,
      errors,
      message: "Worker refused to start because configuration is invalid.",
    };
  }

  return {
    status: "claim_disabled",
    workerId: config.workerId,
    errors: [],
    message: CLAIM_DISABLED_MESSAGE,
  };
}
