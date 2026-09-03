import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let personalIntelligenceClient: SupabaseClient | null = null;

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

export function getPersonalIntelligenceOwnerUserId(): string {
  const ownerUserId = process.env.PERSONAL_INTELLIGENCE_OWNER_USER_ID?.trim();
  if (!ownerUserId) {
    throw new Error("PERSONAL_INTELLIGENCE_OWNER_USER_ID is not configured");
  }
  return ownerUserId;
}
