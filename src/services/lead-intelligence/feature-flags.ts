import { LEAD_INTELLIGENCE_FEATURE_FLAGS } from "./contracts";

export function isLeadIntelligenceEnabled(
  env: Record<string, string | undefined> = process.env,
) {
  const raw = env[LEAD_INTELLIGENCE_FEATURE_FLAGS.leadIntelligence];
  return /^(1|true|yes|on)$/i.test(String(raw || "").trim());
}
