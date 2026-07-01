import { createClient } from "@supabase/supabase-js";

export type DemoSitesSupabaseClientLike = any;

let supabaseFactoryForTests: (() => DemoSitesSupabaseClientLike | null) | null = null;

export function setDemoSitesSupabaseFactoryForTests(factory: (() => DemoSitesSupabaseClientLike | null) | null) {
  supabaseFactoryForTests = factory;
}

export function getDemoSitesSupabase() {
  if (supabaseFactoryForTests) return supabaseFactoryForTests();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env[["SUPABASE", "SERVICE", "ROLE", "KEY"].join("_")];
  if (!url || !key) return null;
  return createClient(url, key);
}
