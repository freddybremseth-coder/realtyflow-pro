import { randomBytes } from "crypto";

export const CORRELATION_ID_HEADER = "x-correlation-id";
export const CORRELATION_ID_PATTERN = /^rf_[0-9a-z]{8,12}_[0-9a-f]{24}$/;
export const REDACTED_VALUE = "[REDACTED]";

const SENSITIVE_KEY_PATTERN =
  /(^|[_-])(authorization|cookie|password|passcode|secret|token|api[_-]?key|service[_-]?role|refresh[_-]?token|access[_-]?token|client[_-]?secret|private[_-]?key)($|[_-])/i;

const SENSITIVE_VALUE_PATTERNS = [
  /\bBearer\s+[A-Za-z0-9._~+/=-]+/gi,
  /\beyJ[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}\b/g,
  /\b(?:sk|pk|rk|sbp)_[A-Za-z0-9_=-]{16,}\b/g,
  /postgres(?:ql)?:\/\/[^@\s]+@/gi,
];

export type RetryableClass = "retryable" | "not_retryable" | "unknown";

export interface ErrorEnvelopeInput {
  correlationId: string;
  code: string;
  message: string;
  retryable?: RetryableClass;
  status?: number;
  details?: Record<string, unknown>;
}

export interface ErrorEnvelope {
  ok: false;
  error: {
    correlationId: string;
    code: string;
    message: string;
    retryable: RetryableClass;
    status?: number;
    details?: Record<string, unknown>;
  };
}

export function generateCorrelationId(now = Date.now()): string {
  return `rf_${now.toString(36)}_${randomBytes(12).toString("hex")}`;
}

export function isCorrelationId(value: unknown): value is string {
  return typeof value === "string" && CORRELATION_ID_PATTERN.test(value);
}

export function getHeaderValue(
  headers: Headers | Record<string, string | string[] | undefined> | undefined,
  name: string,
): string | undefined {
  if (!headers) return undefined;
  if (headers instanceof Headers) return headers.get(name) || undefined;

  const direct = headers[name] ?? headers[name.toLowerCase()];
  if (Array.isArray(direct)) return direct[0];
  return direct;
}

export function getOrCreateCorrelationId(
  headers?: Headers | Record<string, string | string[] | undefined>,
): string {
  const existing =
    getHeaderValue(headers, CORRELATION_ID_HEADER) || getHeaderValue(headers, "x-request-id");
  return isCorrelationId(existing) ? existing : generateCorrelationId();
}

export function sanitizeErrorMessage(value: unknown, fallback = "Internal server error"): string {
  const raw = value instanceof Error ? value.message : typeof value === "string" ? value : fallback;
  const trimmed = raw.replace(/\s+/g, " ").trim();
  return redactSecrets(trimmed || fallback) as string;
}

export function redactSecrets(value: unknown): unknown {
  if (typeof value === "string") {
    return SENSITIVE_VALUE_PATTERNS.reduce(
      (next, pattern) => next.replace(pattern, REDACTED_VALUE),
      value,
    );
  }

  if (Array.isArray(value)) {
    return value.map((item) => redactSecrets(item));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        key,
        SENSITIVE_KEY_PATTERN.test(key) ? REDACTED_VALUE : redactSecrets(entry),
      ]),
    );
  }

  return value;
}

export function createErrorEnvelope(input: ErrorEnvelopeInput): ErrorEnvelope {
  const retryable = input.retryable || "unknown";
  const details = input.details ? (redactSecrets(input.details) as Record<string, unknown>) : undefined;

  return {
    ok: false,
    error: {
      correlationId: input.correlationId,
      code: input.code,
      message: sanitizeErrorMessage(input.message),
      retryable,
      ...(input.status ? { status: input.status } : {}),
      ...(details ? { details } : {}),
    },
  };
}
