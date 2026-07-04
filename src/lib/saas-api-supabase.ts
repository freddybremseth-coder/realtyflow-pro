import { createClient } from "@supabase/supabase-js";

export type SaasSupabaseClientLike = any;

let supabaseFactoryForTests: (() => SaasSupabaseClientLike | null) | null = null;

export function setSaasSupabaseFactoryForTests(factory: (() => SaasSupabaseClientLike | null) | null) {
  supabaseFactoryForTests = factory;
}

export function getSaasSupabase() {
  if (supabaseFactoryForTests) return supabaseFactoryForTests();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}
