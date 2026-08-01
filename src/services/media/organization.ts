import type { SupabaseClient } from "@supabase/supabase-js";
import type { RequestAccessContext } from "@/lib/api-admin";

export const DEFAULT_MEDIA_TENANT_SLUG = "realtyflow";

export interface MediaAccessScope {
  organizationId: string;
  actorEmail: string;
  userId: string | null;
}

export async function getMediaAccessScope(
  supabase: SupabaseClient,
  context: RequestAccessContext,
): Promise<MediaAccessScope> {
  const { data, error } = await supabase
    .schema("core")
    .from("tenants")
    .select("id")
    .eq("slug", DEFAULT_MEDIA_TENANT_SLUG)
    .maybeSingle();

  if (error || !data?.id) {
    throw new Error("Media Studio mangler RealtyFlow tenant. Kjør AI Media Studio-migrasjonen.");
  }

  return {
    organizationId: String(data.id),
    actorEmail: context.email,
    userId: null,
  };
}
