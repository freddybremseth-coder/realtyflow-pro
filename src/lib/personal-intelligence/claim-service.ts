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

export interface CreateConfirmedClaimInput {
  ownerUserId: string;
  subjectEntityId: string;
  predicate: string;
  valueText?: string | null;
  valueJson?: unknown;
  claimType?: string;
  confidence?: number;
  privacyLevel?: PersonalPrivacyLevel;
  sourceExcerpt?: string | null;
  sourceName?: string | null;
  sourceSystem?: string | null;
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

export async function createConfirmedClaim(
  supabase: SupabaseClient,
  input: CreateConfirmedClaimInput,
): Promise<{ claimId: string; sourceId: string }> {
  if (input.valueText == null && input.valueJson == null) {
    throw new Error("Confirmed claim requires text or JSON value");
  }

  const { data: source, error: sourceError } = await supabase
    .schema("personal_core")
    .from("sources")
    .insert({
      owner_user_id: input.ownerUserId,
      source_type: "direct_user_statement",
      source_name: input.sourceName ?? "Personal Intelligence memory confirmation",
      source_system: input.sourceSystem ?? "personal_intelligence",
      reliability_class: "direct_current_user_confirmation",
      privacy_level: input.privacyLevel ?? "internal",
      source_date: new Date().toISOString(),
      metadata: { confirmation: true },
    })
    .select("id")
    .single();

  if (sourceError || !source?.id) {
    throw new Error(`Failed to create confirmation source: ${sourceError?.message || "missing source id"}`);
  }

  const sourceId = String(source.id);
  const { data: claim, error: claimError } = await supabase
    .schema("personal_core")
    .from("claims")
    .insert({
      owner_user_id: input.ownerUserId,
      subject_entity_id: input.subjectEntityId,
      predicate: input.predicate,
      value_text: input.valueText ?? null,
      value_json: input.valueJson ?? null,
      claim_type: input.claimType ?? "fact",
      status: "canonical",
      confidence: input.confidence ?? 0.99,
      source_id: sourceId,
      source_excerpt: input.sourceExcerpt ?? null,
      valid_from: new Date().toISOString(),
      privacy_level: input.privacyLevel ?? "internal",
      requires_confirmation: false,
      confirmed_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (claimError || !claim?.id) {
    await supabase.schema("personal_core").from("sources").delete().eq("id", sourceId).eq("owner_user_id", input.ownerUserId);
    throw new Error(`Failed to create confirmed claim: ${claimError?.message || "missing claim id"}`);
  }

  return { claimId: String(claim.id), sourceId };
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
