import type { SupabaseClient } from "@supabase/supabase-js";
import { askClaude } from "@/services/ai/claude-client";

export interface TeachBackAssessment {
  understoodConcepts: string[];
  missingConcepts: string[];
  misconceptions: string[];
  clarityScore: number;
  transferSignal: number;
  feedback: string;
}

function clamp01(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function parseTeachBack(raw: string): TeachBackAssessment {
  const parsed = JSON.parse(raw) as Record<string, unknown>;
  return {
    understoodConcepts: Array.isArray(parsed.understoodConcepts) ? parsed.understoodConcepts.map(String).slice(0, 20) : [],
    missingConcepts: Array.isArray(parsed.missingConcepts) ? parsed.missingConcepts.map(String).slice(0, 20) : [],
    misconceptions: Array.isArray(parsed.misconceptions) ? parsed.misconceptions.map(String).slice(0, 20) : [],
    clarityScore: clamp01(parsed.clarityScore),
    transferSignal: clamp01(parsed.transferSignal),
    feedback: String(parsed.feedback || "").slice(0, 4000),
  };
}

export async function evaluateTeachBack(input: {
  topicName: string;
  transcript: string;
}): Promise<TeachBackAssessment> {
  const prompt = [
    "Evaluate a learner's teach-back. Judge conceptual correctness, not writing style.",
    "Return JSON only with keys understoodConcepts, missingConcepts, misconceptions, clarityScore, transferSignal, feedback.",
    "Scores are 0..1. Do not infer mastery from confidence or eloquence.",
    `Topic: ${input.topicName}`,
    `Teach-back: ${input.transcript}`,
  ].join("\n\n");

  const raw = await askClaude(prompt, {
    model: "haiku",
    maxTokens: 1200,
    responseMimeType: "application/json",
    validateResponse: (text) => {
      try {
        const value = JSON.parse(text);
        return value && typeof value === "object" && "feedback" in value;
      } catch {
        return false;
      }
    },
    fallbackOnInvalidResponse: true,
  });
  return parseTeachBack(raw);
}

export async function recordTeachBack(
  supabase: SupabaseClient,
  input: {
    ownerUserId: string;
    subjectEntityId: string;
    sessionId: string;
    topicId: string;
    transcript: string;
    assessment: TeachBackAssessment;
  },
) {
  const { data: mastery, error: masteryError } = await supabase
    .schema("knowledge")
    .from("mastery")
    .select("id")
    .eq("owner_user_id", input.ownerUserId)
    .eq("subject_entity_id", input.subjectEntityId)
    .eq("topic_id", input.topicId)
    .maybeSingle();
  if (masteryError) throw new Error(`Mastery lookup failed: ${masteryError.message}`);

  const { data: teachBack, error: teachBackError } = await supabase
    .schema("learning")
    .from("teach_back")
    .insert({
      owner_user_id: input.ownerUserId,
      session_id: input.sessionId,
      topic_id: input.topicId,
      transcript: input.transcript,
      understood_concepts: input.assessment.understoodConcepts,
      missing_concepts: input.assessment.missingConcepts,
      misconceptions: input.assessment.misconceptions,
      clarity_score: input.assessment.clarityScore,
      transfer_signal: input.assessment.transferSignal,
      mentor_feedback: input.assessment.feedback,
    })
    .select("id")
    .single();
  if (teachBackError || !teachBack?.id) throw new Error(`Teach-back write failed: ${teachBackError?.message || "missing id"}`);

  if (mastery?.id) {
    const evidenceStrength = Math.min(1, 0.55 + input.assessment.clarityScore * 0.25 + input.assessment.transferSignal * 0.2);
    const { error: evidenceError } = await supabase.schema("knowledge").from("mastery_evidence").insert({
      owner_user_id: input.ownerUserId,
      mastery_id: mastery.id,
      evidence_type: "teach_back",
      learning_session_id: input.sessionId,
      score_effect: (input.assessment.clarityScore + input.assessment.transferSignal) / 2,
      evidence_strength: evidenceStrength,
    });
    if (evidenceError) throw new Error(`Mastery evidence write failed: ${evidenceError.message}`);
  }

  return { teachBackId: String(teachBack.id), masteryEvidenceRecorded: Boolean(mastery?.id) };
}
