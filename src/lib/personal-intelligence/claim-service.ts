import type { SupabaseClient } from "@supabase/supabase-js";
import type { PersonalPrivacyLevel } from "./privacy-policy";

export interface CreateClaimCandidateInput {
  ownerUserId: string;
  subjectEntityId: string;
  predicate: string;
  valueText?: string | null;
  valueJson?: unknown;
  claimType?: string;
  confidence?: number;
  sourceId?: string | null;
  sourceExcerpt?: string | null;
  privacyLevel?: PersonalPrivacyLevel;
  requiresConfirmation?: boolean;
}

export interface CorrectClaimInput {
  ownerUserId: string;
  claimId: string;
  sourceId?: string | null;
  valueText?: string | null;
  valueJson?: unknown;
  confidence?: number;
  privacyLevel?: PersonalPrivacyLevel | null;
}

export async function createClaimCandidate(
  supabase: SupabaseClient,
  input: CreateClaimCandidateInput,
): Promise<string> {
  if (input.valueText == null && input.valueJson == null) {
    throw new Error("Claim candidate requires text or JSON value");
  }

  const { data, error } = await supabase
    .schema("personal_core")
    .from("claims")
    .insert({
      owner_user_id: input.ownerUserId,
      subject_entity_id: input.subjectEntityId,
      predicate: input.predicate,
      value_text: input.valueText ?? null,
      value_json: input.valueJson ?? null,
      claim_type: input.claimType ?? "fact",
      status: "candidate",
      confidence: input.confidence ?? 0.5,
      source_id: input.sourceId ?? null,
      source_excerpt: input.sourceExcerpt ?? null,
      privacy_level: input.privacyLevel ?? "internal",
      requires_confirmation: input.requiresConfirmation ?? true,
    })
    .select("id")
    .single();

  if (error || !data?.id) {
    throw new Error(`Failed to create claim candidate: ${error?.message || "missing claim id"}`);
  }
  return String(data.id);
}

export async function correctClaim(
  supabase: SupabaseClient,
  input: CorrectClaimInput,
): Promise<string> {
  if (input.valueText == null && input.valueJson == null) {
    throw new Error("Claim correction requires text or JSON value");
  }

  const { data, error } = await supabase.schema("personal_core").rpc("correct_claim", {
    p_owner_user_id: input.ownerUserId,
    p_claim_id: input.claimId,
    p_source_id: input.sourceId ?? null,
    p_value_text: input.valueText ?? null,
    p_value_json: input.valueJson ?? null,
    p_confidence: input.confidence ?? 0.95,
    p_privacy_level: input.privacyLevel ?? null,
  });

  if (error || !data) {
    throw new Error(`Failed to correct claim: ${error?.message || "missing replacement id"}`);
  }
  return String(data);
}
