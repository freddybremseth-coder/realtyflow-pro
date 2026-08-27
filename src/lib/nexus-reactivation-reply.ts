export type ReactivationReplyIntent =
  | "reactivate_now"
  | "update_preferences"
  | "follow_up_later"
  | "stop"
  | "unclear";

export interface ReactivationReplyClassification {
  intent: ReactivationReplyIntent;
  confidence: number;
  reasons: string[];
  suggestedPipelineAction:
    | "move_to_contact"
    | "refresh_buyer_profile"
    | "schedule_future_followup"
    | "suppress_nurture"
    | "manual_review";
  shouldReactivatePipeline: boolean;
  requiresHumanReview: boolean;
}

function normalize(text: string) {
  return text
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function classifyReactivationReply(input: { subject?: string | null; body?: string | null }) {
  const text = normalize(`${input.subject || ""} ${input.body || ""}`);
  const reasons: string[] = [];

  const stop = /\b(stopp|stop|ikke kontakt|ikke interessert|ikke aktuelt|avmeld|unsubscribe|remove me|not interested|do not contact)\b/i.test(text);
  if (stop) {
    reasons.push("Eksplisitt stopp/ikke-interessert-signal funnet.");
    return {
      intent: "stop",
      confidence: 0.99,
      reasons,
      suggestedPipelineAction: "suppress_nurture",
      shouldReactivatePipeline: false,
      requiresHumanReview: false,
    } satisfies ReactivationReplyClassification;
  }

  const later = /\b(senere|neste år|til vinteren|om noen måneder|ikke nå|kanskje senere|later|next year|in a few months|not now)\b/i.test(text);
  const changed = /\b(endret|endrede ønsker|andre ønsker|annet område|annet budsjett|nytt budsjett|ser etter noe annet|changed|different area|different budget|requirements changed)\b/i.test(text);
  const active = /\b(ja|fortsatt aktuelt|fortsatt interessert|interessert|vi ser fortsatt|jeg ser fortsatt|aktuelt|yes|still interested|still looking|interested)\b/i.test(text);

  if (changed && (active || /\b(men|but)\b/i.test(text))) {
    reasons.push("Lead bekrefter fortsatt interesse, men signaliserer endrede behov.");
    return {
      intent: "update_preferences",
      confidence: active ? 0.94 : 0.82,
      reasons,
      suggestedPipelineAction: "refresh_buyer_profile",
      shouldReactivatePipeline: true,
      requiresHumanReview: false,
    } satisfies ReactivationReplyClassification;
  }

  if (later) {
    reasons.push("Lead ber om senere oppfølging eller sier at tidspunktet ikke er riktig nå.");
    return {
      intent: "follow_up_later",
      confidence: 0.9,
      reasons,
      suggestedPipelineAction: "schedule_future_followup",
      shouldReactivatePipeline: false,
      requiresHumanReview: false,
    } satisfies ReactivationReplyClassification;
  }

  if (active) {
    reasons.push("Lead bekrefter aktiv eller fortsatt interesse.");
    return {
      intent: "reactivate_now",
      confidence: 0.9,
      reasons,
      suggestedPipelineAction: "move_to_contact",
      shouldReactivatePipeline: true,
      requiresHumanReview: false,
    } satisfies ReactivationReplyClassification;
  }

  reasons.push("Svaret inneholder ikke et tydelig nok kommersielt signal for automatisk handling.");
  return {
    intent: "unclear",
    confidence: 0.35,
    reasons,
    suggestedPipelineAction: "manual_review",
    shouldReactivatePipeline: false,
    requiresHumanReview: true,
  } satisfies ReactivationReplyClassification;
}
