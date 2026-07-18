import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export type BillingSupabaseClient = SupabaseClient;

let billingSupabaseFactoryForTests: (() => BillingSupabaseClient | null) | null = null;

export function setBillingSupabaseFactoryForTests(factory: (() => BillingSupabaseClient | null) | null) {
  billingSupabaseFactoryForTests = factory;
}

export function getBillingSupabase() {
  if (billingSupabaseFactoryForTests) return billingSupabaseFactoryForTests();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
