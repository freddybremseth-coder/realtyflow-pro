export type WhatsAppRuntimeHealthStatus = "HEALTHY" | "DEGRADED" | "AT_RISK" | "UNKNOWN";

export type WhatsAppRuntimeSnapshot = {
  lastWebhookAt: string | null;
  lastWebhookStatus: string | null;
  webhookRuns24h: number;
  webhookFailures24h: number;
  webhookPartial24h: number;
  persistedMessages24h: number;
  unresolvedReferrals: number;
  overdueWhatsAppWorkItems: number;
};

export type WhatsAppRuntimeHealth = WhatsAppRuntimeSnapshot & {
  status: WhatsAppRuntimeHealthStatus;
  score: number;
  reasons: string[];
};

function ageHours(value: string | null, nowMs: number) {
  if (!value) return null;
  const ts = Date.parse(value);
  if (!Number.isFinite(ts)) return null;
  return Math.max(0, (nowMs - ts) / 3_600_000);
}

export function classifyWhatsAppRuntimeHealth(snapshot: WhatsAppRuntimeSnapshot, nowMs = Date.now()): WhatsAppRuntimeHealth {
  const reasons: string[] = [];
  const lastAge = ageHours(snapshot.lastWebhookAt, nowMs);

  if (snapshot.webhookRuns24h === 0 && snapshot.persistedMessages24h === 0 && !snapshot.lastWebhookAt) {
    return { ...snapshot, status: "UNKNOWN", score: 50, reasons: ["No WhatsApp runtime evidence has been recorded yet."] };
  }

  let score = 100;
  if (snapshot.webhookFailures24h > 0) {
    score -= Math.min(45, snapshot.webhookFailures24h * 15);
    reasons.push(`${snapshot.webhookFailures24h} WhatsApp webhook failure(s) in the last 24h.`);
  }
  if (snapshot.webhookPartial24h > 0) {
    score -= Math.min(25, snapshot.webhookPartial24h * 8);
    reasons.push(`${snapshot.webhookPartial24h} partial WhatsApp webhook run(s) in the last 24h.`);
  }
  if (snapshot.unresolvedReferrals > 0) {
    score -= Math.min(30, snapshot.unresolvedReferrals * 10);
    reasons.push(`${snapshot.unresolvedReferrals} unresolved Soleada referral(s) need customer identity.`);
  }
  if (snapshot.overdueWhatsAppWorkItems > 0) {
    score -= Math.min(35, snapshot.overdueWhatsAppWorkItems * 10);
    reasons.push(`${snapshot.overdueWhatsAppWorkItems} overdue WhatsApp sales work item(s).`);
  }
  if (lastAge !== null && lastAge > 72 && snapshot.webhookRuns24h === 0) {
    score -= 15;
    reasons.push("No WhatsApp webhook activity has been recorded for more than 72 hours.");
  }

  score = Math.max(0, score);
  const status: WhatsAppRuntimeHealthStatus = score < 55 ? "AT_RISK" : score < 85 ? "DEGRADED" : "HEALTHY";
  if (reasons.length === 0) reasons.push("Recent WhatsApp runtime evidence shows no detected operational issues.");

  return { ...snapshot, status, score, reasons };
}
