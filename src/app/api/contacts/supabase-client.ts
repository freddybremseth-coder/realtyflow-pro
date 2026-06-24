import { createClient } from "@supabase/supabase-js";

let supabaseFactoryForTests: (() => any) | null = null;

export function setContactsSupabaseFactoryForTests(factory: (() => any) | null) {
  supabaseFactoryForTests = factory;
}

export function getContactsSupabase() {
  if (supabaseFactoryForTests) return supabaseFactoryForTests();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}
