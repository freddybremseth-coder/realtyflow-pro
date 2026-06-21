import { LEAD_INTELLIGENCE_FEATURE_FLAGS } from "./contracts";

export function isLeadIntelligenceEnabled(
  env: Record<string, string | undefined> = process.env,
) {
  const raw = env[LEAD_INTELLIGENCE_FEATURE_FLAGS.leadIntelligence];
  return /^(1|true|yes|on)$/i.test(String(raw || "").trim());
}

export function isLeadIntelligencePersistenceEnabled(
  env: Record<string, string | undefined> = process.env,
) {
  const raw = env[LEAD_INTELLIGENCE_FEATURE_FLAGS.leadIntelligencePersistence];
  return /^(1|true|yes|on)$/i.test(String(raw || "").trim());
}

export function isLeadIntelligenceConnectExistingEnabled(
  env: Record<string, string | undefined> = process.env,
) {
  const raw = env[LEAD_INTELLIGENCE_FEATURE_FLAGS.leadIntelligenceConnectExisting];
  return /^(1|true|yes|on)$/i.test(String(raw || "").trim());
}

export function isLeadIntelligencePropertyMatchingEnabled(
  env: Record<string, string | undefined> = process.env,
) {
  const raw = env[LEAD_INTELLIGENCE_FEATURE_FLAGS.propertyMatching];
  return /^(1|true|yes|on)$/i.test(String(raw || "").trim());
}
