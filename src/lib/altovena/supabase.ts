import "server-only";
import { createClient } from "@supabase/supabase-js";
import { getPlatformSupabase } from "@/lib/platform/supabase";
import { assessAltovenaDatabaseIsolation } from "./preview-database-isolation";

/**
 * Exactly one database routing choice for Altovena:
 *
 * Production: preserve the established RealtyFlow platform client.
 * Isolated tests: preserve the existing injected fake platform client.
 * Preview/staging: use ONLY the two Altovena-specific SERVER-ONLY secrets.
 *
 * Other RealtyFlow brands continue using getPlatformSupabase() unchanged.
 */
export function getAltovenaSupabase() {
  const isolation=assessAltovenaDatabaseIsolation();
  if(!isolation.allowed)return null;

  if(isolation.state==="production" || isolation.state==="test")
    return getPlatformSupabase();

  if(isolation.state!=="isolated_preview")return null;
  const url=process.env.ALTOVENA_STAGING_SUPABASE_URL;
  const key=process.env.ALTOVENA_STAGING_SUPABASE_SERVICE_ROLE_KEY;
  if(!url || !key)return null;

  // Avoid process-global caching and any fallback to shared platform secrets.
  return createClient(url,key,{
    auth:{autoRefreshToken:false,persistSession:false},
  });
}
