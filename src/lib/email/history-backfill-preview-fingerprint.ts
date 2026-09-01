import { createHash } from "node:crypto";

export interface EmailHistoryBackfillFingerprintInput {
  brandId: string;
  sinceDays: number;
  maxMessages: number;
  includeSent: boolean;
  candidateMessageIds: string[];
}

export function buildEmailHistoryBackfillPreviewFingerprint(input: EmailHistoryBackfillFingerprintInput) {
  const payload = JSON.stringify({
    version: 1,
    brandId: input.brandId,
    sinceDays: input.sinceDays,
    maxMessages: input.maxMessages,
    includeSent: input.includeSent,
    candidateMessageIds: [...new Set(input.candidateMessageIds)].sort(),
  });

  return createHash("sha256").update(payload).digest("hex");
}
