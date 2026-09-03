import type { SupabaseClient } from "@supabase/supabase-js";
import { allowedPrivacyLevels, type PersonalPrivacyLevel } from "./privacy-policy";

export interface PersonalContextRequest {
  ownerUserId: string;
  subjectEntityId: string;
  sessionScope: PersonalPrivacyLevel;
  explicitSensitivePermission?: boolean;
  claimPredicates?: string[];
  includeGoals?: boolean;
  limit?: number;
}

export interface PersonalContextClaim {
  id: string;
  predicate: string;
  value_text: string | null;
  value_json: unknown;
  claim_type: string;
  status: string;
  confidence: number;
  privacy_level: PersonalPrivacyLevel;
  valid_from: string | null;
  valid_to: string | null;
  source_id: string | null;
}

export interface PersonalContextGoal {
  id: string;
  title: string;
  description: string | null;
  domain: string | null;
  priority: number;
  status: string;
  why_it_matters: string | null;
  success_definition: string | null;
  privacy_level: PersonalPrivacyLevel;
}

export interface PersonalContextPack {
  claims: PersonalContextClaim[];
  goals: PersonalContextGoal[];
  privacyLevels: PersonalPrivacyLevel[];
}

export async function buildPersonalContextPack(
  supabase: SupabaseClient,
  request: PersonalContextRequest,
): Promise<PersonalContextPack> {
  const privacyLevels = allowedPrivacyLevels(request.sessionScope, request.explicitSensitivePermission);
  const limit = Math.min(Math.max(request.limit ?? 30, 1), 100);

  let claimsQuery = supabase
    .schema("personal_core")
    .from("claims")
    .select("id,predicate,value_text,value_json,claim_type,status,confidence,privacy_level,valid_from,valid_to,source_id")
    .eq("owner_user_id", request.ownerUserId)
    .eq("subject_entity_id", request.subjectEntityId)
    .in("status", ["validated", "canonical"])
    .in("privacy_level", privacyLevels)
    .or(`valid_to.is.null,valid_to.gte.${new Date().toISOString()}`)
    .order("confidence", { ascending: false })
    .limit(limit);

  if (request.claimPredicates?.length) {
    claimsQuery = claimsQuery.in("predicate", request.claimPredicates);
  }

  const claimsResult = await claimsQuery;
  if (claimsResult.error) {
    throw new Error(`Personal context claim retrieval failed: ${claimsResult.error.message}`);
  }

  let goals: PersonalContextGoal[] = [];
  if (request.includeGoals !== false) {
    const goalsResult = await supabase
      .schema("personal_core")
      .from("goals")
      .select("id,title,description,domain,priority,status,why_it_matters,success_definition,privacy_level")
      .eq("owner_user_id", request.ownerUserId)
      .eq("subject_entity_id", request.subjectEntityId)
      .in("status", ["active", "idea", "paused"])
      .in("privacy_level", privacyLevels)
      .order("priority", { ascending: true })
      .limit(20);

    if (goalsResult.error) {
      throw new Error(`Personal context goal retrieval failed: ${goalsResult.error.message}`);
    }
    goals = (goalsResult.data || []) as PersonalContextGoal[];
  }

  return {
    claims: (claimsResult.data || []) as PersonalContextClaim[],
    goals,
    privacyLevels,
  };
}
