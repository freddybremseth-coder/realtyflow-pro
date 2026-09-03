import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let personalIntelligenceClient: SupabaseClient | null = null;

export const PERSONAL_INTELLIGENCE_OWNER_CANONICAL_NAME = "freddy_bremseth";

export function getPersonalIntelligenceSupabase(): SupabaseClient {
  if (personalIntelligenceClient) return personalIntelligenceClient;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Personal Intelligence Supabase is not configured");
  }

  personalIntelligenceClient = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return personalIntelligenceClient;
}

export async function getPersonalIntelligenceOwnerUserId(
  supabase: SupabaseClient = getPersonalIntelligenceSupabase(),
): Promise<string> {
  const configuredOwnerUserId = process.env.PERSONAL_INTELLIGENCE_OWNER_USER_ID?.trim();
  if (configuredOwnerUserId) return configuredOwnerUserId;

  const { data, error } = await supabase
    .schema("personal_core")
    .from("entities")
    .select("owner_user_id")
    .eq("entity_type", "person")
    .eq("canonical_name", PERSONAL_INTELLIGENCE_OWNER_CANONICAL_NAME)
    .maybeSingle();

  if (error) {
    throw new Error(`Personal Intelligence owner resolution failed: ${error.message}`);
  }
  if (!data?.owner_user_id) {
    throw new Error("Personal Intelligence owner is not configured or bootstrapped");
  }
  return String(data.owner_user_id);
}
