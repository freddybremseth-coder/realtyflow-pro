import type { SupabaseClient } from "@supabase/supabase-js";
import type { PersonalContextPack } from "./context-router";

export async function logPersonalContextUsage(
  supabase: SupabaseClient,
  input: {
    ownerUserId: string;
    sessionId: string;
    context: PersonalContextPack;
  },
) {
  const rows = [
    ...input.context.claims.map((claim) => ({
      owner_user_id: input.ownerUserId,
      session_id: input.sessionId,
      schema_name: "personal_core",
      resource_type: "claim",
      resource_id: claim.id,
      context_reason: `Relevant validated/canonical personal claim: ${claim.predicate}`,
      sensitivity: claim.privacy_level,
      source_updated_at: null,
      confidence: claim.confidence,
    })),
    ...input.context.goals.map((goal) => ({
      owner_user_id: input.ownerUserId,
      session_id: input.sessionId,
      schema_name: "personal_core",
      resource_type: "goal",
      resource_id: goal.id,
      context_reason: `Relevant ${goal.status} personal goal`,
      sensitivity: goal.privacy_level,
      source_updated_at: null,
      confidence: null,
    })),
  ];

  if (!rows.length) return { logged: 0 };

  const { error } = await supabase.schema("mentor").from("context_usage").insert(rows);
  if (error) throw new Error(`Failed to log personal context usage: ${error.message}`);
  return { logged: rows.length };
}
