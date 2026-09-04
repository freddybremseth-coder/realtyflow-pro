import { askClaude } from "@/services/ai/claude-client";
import type { PersonalContextPack } from "./context-router";

export type ExploreKind = "adjacent" | "stretch" | "wild_card";

export interface ExploreSuggestion {
  kind: ExploreKind;
  title: string;
  whyNow: string;
  connection: string;
  suggestedFirstQuestion: string;
}

interface ExploreEnvelope { suggestions?: ExploreSuggestion[] }

const KINDS = new Set<ExploreKind>(["adjacent", "stretch", "wild_card"]);

function normalizeSuggestion(value: unknown): ExploreSuggestion | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  if (!KINDS.has(raw.kind as ExploreKind)) return null;
  for (const key of ["title", "whyNow", "connection", "suggestedFirstQuestion"] as const) {
    if (typeof raw[key] !== "string" || !raw[key].trim()) return null;
  }
  return {
    kind: raw.kind as ExploreKind,
    title: String(raw.title).trim().slice(0, 120),
    whyNow: String(raw.whyNow).trim().slice(0, 500),
    connection: String(raw.connection).trim().slice(0, 500),
    suggestedFirstQuestion: String(raw.suggestedFirstQuestion).trim().slice(0, 300),
  };
}

export async function generateExploreSuggestions(input: {
  context: PersonalContextPack;
  topics: Array<{ name: string; domainName?: string | null }>;
}): Promise<{ suggestions: ExploreSuggestion[]; insufficientEvidence: boolean }> {
  const claims = input.context.claims.filter((claim) => ["interest", "preference", "fact", "belief"].includes(claim.claim_type));
  const goals = input.context.goals;
  const topics = input.topics;

  if (!claims.length && !goals.length && !topics.length) {
    return { suggestions: [], insufficientEvidence: true };
  }

  const evidence = {
    claims: claims.slice(0, 12).map((claim) => ({ predicate: claim.predicate, value: claim.value_text, type: claim.claim_type, confidence: claim.confidence })),
    goals: goals.slice(0, 8).map((goal) => ({ title: goal.title, domain: goal.domain, status: goal.status, why: goal.why_it_matters })),
    topics: topics.slice(0, 20),
  };

  const prompt = `You are the Curiosity layer of a private Personal Intelligence system. Generate exactly three intellectually worthwhile exploration suggestions from the supplied evidence: one adjacent, one stretch, one wild_card.\n\nRules:\n- Use only the supplied evidence as personalization context.\n- Do not infer personality, identity, health, politics, religion, or other sensitive traits.\n- Adjacent should connect naturally to an existing interest/topic/goal.\n- Stretch should broaden understanding without being random.\n- Wild Card may be surprising, but must still explain a plausible connection to the evidence.\n- Avoid clickbait, productivity pressure, streaks, gamification, shopping, or outbound actions.\n- Do not claim the user knows or believes something unless it is present in evidence.\n- Return JSON only.\n\nShape:\n{"suggestions":[{"kind":"adjacent|stretch|wild_card","title":"...","whyNow":"...","connection":"...","suggestedFirstQuestion":"..."}]}\n\nEVIDENCE:\n${JSON.stringify(evidence)}`;

  const raw = await askClaude(prompt, {
    model: "haiku",
    temperature: 0.4,
    maxTokens: 1400,
    responseMimeType: "application/json",
    validateResponse: (text) => {
      try {
        const parsed = JSON.parse(text) as ExploreEnvelope;
        return Array.isArray(parsed.suggestions);
      } catch { return false; }
    },
    fallbackOnInvalidResponse: true,
  });

  try {
    const parsed = JSON.parse(raw) as ExploreEnvelope;
    const normalized = (parsed.suggestions || []).map(normalizeSuggestion).filter((item): item is ExploreSuggestion => Boolean(item));
    const byKind = new Map<ExploreKind, ExploreSuggestion>();
    for (const item of normalized) if (!byKind.has(item.kind)) byKind.set(item.kind, item);
    return {
      suggestions: (["adjacent", "stretch", "wild_card"] as ExploreKind[]).map((kind) => byKind.get(kind)).filter((item): item is ExploreSuggestion => Boolean(item)),
      insufficientEvidence: false,
    };
  } catch {
    return { suggestions: [], insufficientEvidence: false };
  }
}
