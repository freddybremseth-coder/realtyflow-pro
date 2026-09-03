import type { SupabaseClient } from "@supabase/supabase-js";
import { askClaude } from "@/services/ai/claude-client";
import { buildPersonalContextPack } from "./context-router";
import { logPersonalContextUsage } from "./context-audit";
import { extractMemoryCandidates } from "./memory-extractor";
import type { PersonalPrivacyLevel } from "./privacy-policy";

export interface RunMentorTurnInput {
  ownerUserId: string;
  subjectEntityId: string;
  message: string;
  privacyScope?: PersonalPrivacyLevel;
  explicitSensitivePermission?: boolean;
  thinkDeeper?: boolean;
  sessionType?: string;
  primaryMode?: string;
  inputMode?: "text" | "dictation" | "voice_conversation" | "reflection";
  persistMessages?: boolean;
  reflectionMode?: boolean;
}

function formatContext(context: Awaited<ReturnType<typeof buildPersonalContextPack>>) {
  const claims = context.claims.length
    ? context.claims.map((claim) => `- [${claim.status.toUpperCase()} | confidence ${claim.confidence}] ${claim.predicate}: ${claim.value_text ?? JSON.stringify(claim.value_json)}`).join("\n")
    : "- None retrieved.";
  const goals = context.goals.length
    ? context.goals.map((goal) => `- [${goal.status.toUpperCase()} | priority ${goal.priority}] ${goal.title}${goal.why_it_matters ? ` — ${goal.why_it_matters}` : ""}`).join("\n")
    : "- None retrieved.";

  return `CANONICAL/VALIDATED PERSONAL CLAIMS:\n${claims}\n\nACTIVE OR RELEVANT GOALS:\n${goals}`;
}

export async function runMentorTurn(supabase: SupabaseClient, input: RunMentorTurnInput) {
  const message = input.message.trim();
  if (!message) throw new Error("Mentor message is required");

  const { data: subject, error: subjectError } = await supabase
    .schema("personal_core")
    .from("entities")
    .select("id,owner_user_id,display_name")
    .eq("id", input.subjectEntityId)
    .eq("owner_user_id", input.ownerUserId)
    .single();
  if (subjectError || !subject) throw new Error("Personal Intelligence subject was not found for owner");

  const privacyScope = input.privacyScope ?? "internal";
  const sessionType = input.sessionType || "conversation";
  const primaryMode = input.primaryMode || "mentor";
  const inputMode = input.inputMode || "text";
  const persistMessages = input.persistMessages !== false;

  const { data: session, error: sessionError } = await supabase
    .schema("mentor")
    .from("sessions")
    .insert({
      owner_user_id: input.ownerUserId,
      subject_entity_id: input.subjectEntityId,
      session_type: sessionType,
      primary_mode: primaryMode,
      input_mode: inputMode,
      think_deeper_enabled: Boolean(input.thinkDeeper),
      privacy_scope: privacyScope,
    })
    .select("id")
    .single();
  if (sessionError || !session?.id) throw new Error(`Failed to create mentor session: ${sessionError?.message || "missing session"}`);

  const sessionId = String(session.id);
  if (persistMessages) {
    const { error: userMessageError } = await supabase.schema("mentor").from("messages").insert({
      owner_user_id: input.ownerUserId,
      session_id: sessionId,
      role: "user",
      content: message,
      input_mode: inputMode,
    });
    if (userMessageError) throw new Error(`Failed to store mentor message: ${userMessageError.message}`);
  }

  const context = await buildPersonalContextPack(supabase, {
    ownerUserId: input.ownerUserId,
    subjectEntityId: input.subjectEntityId,
    sessionScope: privacyScope,
    explicitSensitivePermission: input.explicitSensitivePermission,
    includeGoals: true,
    limit: input.thinkDeeper ? 60 : 30,
  });
  await logPersonalContextUsage(supabase, { ownerUserId: input.ownerUserId, sessionId, context });

  const modePolicy = input.reflectionMode
    ? "This is Reflection Mode. Listen before advising. Reflect the user's own thinking back with clarity. Surface possible patterns only as tentative observations, never as personality diagnoses. Do not force an action or productivity outcome. It is acceptable to end with one thoughtful question."
    : input.thinkDeeper
      ? "This is a Think Deeper turn: examine assumptions, alternatives, contradictions and opportunity cost more carefully."
      : "Use the minimum reasoning needed for a good answer.";

  const systemPrompt = `You are the Personal Intelligence mentor for ${subject.display_name}.\nBe useful, concise and intellectually serious. Truth is more important than agreement. Distinguish established personal facts from tentative interpretation. Never claim expertise merely from exposure. Do not reveal hidden reasoning. When evidence is weak, say so. The supplied context has already passed a privacy gate; do not ask for or infer more sensitive context unless the user explicitly introduces it. ${modePolicy}`;

  const requestLabel = input.reflectionMode ? "USER REFLECTION" : "USER REQUEST";
  const prompt = `${formatContext(context)}\n\n${requestLabel}:\n${message}`;
  const response = await askClaude(prompt, {
    model: input.thinkDeeper ? "sonnet" : "haiku",
    systemPrompt,
    maxTokens: input.thinkDeeper ? 3000 : 1800,
  });

  if (persistMessages) {
    const { error: assistantMessageError } = await supabase.schema("mentor").from("messages").insert({
      owner_user_id: input.ownerUserId,
      session_id: sessionId,
      role: "assistant",
      content: response,
      input_mode: inputMode,
    });
    if (assistantMessageError) throw new Error(`Failed to store mentor response: ${assistantMessageError.message}`);
  }

  const memoryCandidates = await extractMemoryCandidates(message);

  await supabase.schema("mentor").from("audit_events").insert({
    owner_user_id: input.ownerUserId,
    session_id: sessionId,
    event_type: input.reflectionMode ? "reflection_turn_completed" : "mentor_turn_completed",
    resource_schema: "mentor",
    resource_type: "session",
    resource_id: sessionId,
    details: {
      think_deeper: Boolean(input.thinkDeeper),
      reflection_mode: Boolean(input.reflectionMode),
      privacy_scope: privacyScope,
      messages_persisted: persistMessages,
      context_claims: context.claims.length,
      context_goals: context.goals.length,
      memory_candidates: memoryCandidates.length,
    },
  });

  return {
    sessionId,
    response,
    memoryCandidates,
    contextSummary: {
      claimsUsed: context.claims.map((claim) => ({ id: claim.id, predicate: claim.predicate, confidence: claim.confidence })),
      goalsUsed: context.goals.map((goal) => ({ id: goal.id, title: goal.title, status: goal.status })),
      privacyLevels: context.privacyLevels,
    },
    retention: {
      messagesPersisted: persistMessages,
    },
  };
}
