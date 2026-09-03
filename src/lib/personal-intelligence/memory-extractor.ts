import { askClaude } from "@/services/ai/claude-client";
import type { PersonalPrivacyLevel } from "./privacy-policy";

export type MemoryPersistence = "AUTO" | "CONFIRM" | "SESSION_ONLY" | "REJECT";
export type MemoryCandidateType = "fact" | "goal" | "preference" | "belief" | "interest" | "decision" | "action" | "reflection_insight";

export interface MemoryCandidate {
  type: MemoryCandidateType;
  predicate: string;
  statement: string;
  confidence: number;
  privacyLevel: PersonalPrivacyLevel;
  persistence: MemoryPersistence;
  reason: string;
}

interface ExtractionEnvelope {
  candidates?: MemoryCandidate[];
}

const VALID_TYPES = new Set<MemoryCandidateType>([
  "fact",
  "goal",
  "preference",
  "belief",
  "interest",
  "decision",
  "action",
  "reflection_insight",
]);
const VALID_PRIVACY = new Set<PersonalPrivacyLevel>(["public", "internal", "private", "sensitive", "restricted"]);
const VALID_PERSISTENCE = new Set<MemoryPersistence>(["AUTO", "CONFIRM", "SESSION_ONLY", "REJECT"]);

function normalizeCandidate(value: unknown): MemoryCandidate | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  if (!VALID_TYPES.has(raw.type as MemoryCandidateType)) return null;
  if (!VALID_PRIVACY.has(raw.privacyLevel as PersonalPrivacyLevel)) return null;
  if (!VALID_PERSISTENCE.has(raw.persistence as MemoryPersistence)) return null;
  if (typeof raw.predicate !== "string" || !raw.predicate.trim()) return null;
  if (typeof raw.statement !== "string" || !raw.statement.trim()) return null;
  const confidence = Number(raw.confidence);
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) return null;

  return {
    type: raw.type as MemoryCandidateType,
    predicate: raw.predicate.trim().slice(0, 120),
    statement: raw.statement.trim(),
    confidence,
    privacyLevel: raw.privacyLevel as PersonalPrivacyLevel,
    persistence: raw.persistence as MemoryPersistence,
    reason: typeof raw.reason === "string" ? raw.reason.trim() : "",
  };
}

export async function extractMemoryCandidates(userMessage: string): Promise<MemoryCandidate[]> {
  const prompt = `Extract only information explicitly stated or clearly committed to by the USER in the message below.\n\nDo not infer personality traits. Do not turn the assistant's ideas into user facts. Do not persist transient small talk. If an item is sensitive or an interpretation, choose CONFIRM or SESSION_ONLY rather than AUTO. AUTO should be rare and limited to low-risk explicit activity/state facts.\n\nReturn JSON only in this exact shape:\n{"candidates":[{"type":"fact|goal|preference|belief|interest|decision|action|reflection_insight","predicate":"short_machine_key","statement":"plain-language statement","confidence":0.0,"privacyLevel":"public|internal|private|sensitive|restricted","persistence":"AUTO|CONFIRM|SESSION_ONLY|REJECT","reason":"brief reason"}]}\n\nUSER MESSAGE:\n${userMessage}`;

  const raw = await askClaude(prompt, {
    model: "haiku",
    temperature: 0,
    maxTokens: 1200,
    responseMimeType: "application/json",
    validateResponse: (text) => {
      try {
        const parsed = JSON.parse(text) as ExtractionEnvelope;
        return Array.isArray(parsed.candidates);
      } catch {
        return false;
      }
    },
    fallbackOnInvalidResponse: true,
  });

  try {
    const parsed = JSON.parse(raw) as ExtractionEnvelope;
    return (parsed.candidates || []).map(normalizeCandidate).filter((candidate): candidate is MemoryCandidate => Boolean(candidate));
  } catch {
    return [];
  }
}
