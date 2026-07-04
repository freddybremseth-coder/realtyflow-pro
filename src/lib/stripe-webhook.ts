import { createHmac, timingSafeEqual } from "node:crypto";

export const STRIPE_WEBHOOK_TOLERANCE_SECONDS = 300;

type StripeSignatureCheck =
  | { ok: true }
  | {
      ok: false;
      reason:
        | "missing-secret"
        | "missing-signature"
        | "missing-timestamp"
        | "stale-timestamp"
        | "missing-v1-signature"
        | "signature-mismatch";
    };

function parseStripeSignatureHeader(header: string) {
  const values = new Map<string, string[]>();

  for (const part of header.split(",")) {
    const [rawKey, ...rawValueParts] = part.split("=");
    const key = rawKey?.trim();
    const value = rawValueParts.join("=").trim();
    if (!key || !value) continue;
    values.set(key, [...(values.get(key) || []), value]);
  }

  return values;
}

function safeCompareHex(left: string, right: string) {
  if (!/^[0-9a-f]{64}$/i.test(left) || !/^[0-9a-f]{64}$/i.test(right)) return false;
  const leftBuffer = Buffer.from(left, "hex");
  const rightBuffer = Buffer.from(right, "hex");
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

export function verifyStripeWebhookSignature(
  payload: string,
  signatureHeader: string | null,
  endpointSecret: string | undefined,
  nowMs = Date.now(),
  toleranceSeconds = STRIPE_WEBHOOK_TOLERANCE_SECONDS,
): StripeSignatureCheck {
  if (!endpointSecret) return { ok: false, reason: "missing-secret" };
  if (!signatureHeader) return { ok: false, reason: "missing-signature" };

  const parsed = parseStripeSignatureHeader(signatureHeader);
  const timestamp = Number(parsed.get("t")?.[0]);
  if (!Number.isFinite(timestamp)) return { ok: false, reason: "missing-timestamp" };

  const ageSeconds = Math.abs(Math.floor(nowMs / 1000) - timestamp);
  if (toleranceSeconds > 0 && ageSeconds > toleranceSeconds) return { ok: false, reason: "stale-timestamp" };

  const signatures = parsed.get("v1") || [];
  if (signatures.length === 0) return { ok: false, reason: "missing-v1-signature" };

  const expected = createHmac("sha256", endpointSecret).update(`${timestamp}.${payload}`, "utf8").digest("hex");
  if (!signatures.some((signature) => safeCompareHex(expected, signature))) {
    return { ok: false, reason: "signature-mismatch" };
  }

  return { ok: true };
}
