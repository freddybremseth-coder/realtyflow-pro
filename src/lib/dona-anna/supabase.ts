import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let clientFactoryForTests: (() => SupabaseClient | null) | null = null;

export function setDonaAnnaSupabaseFactoryForTests(factory: (() => SupabaseClient | null) | null) {
  clientFactoryForTests = factory;
}

export function getDonaAnnaSupabase() {
  if (clientFactoryForTests) return clientFactoryForTests();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
