import type { SupabaseClient } from "@supabase/supabase-js";
import type { RequestAccessContext } from "@/lib/api-admin";

export const DEFAULT_MEDIA_TENANT_SLUG = "realtyflow";

export interface MediaAccessScope {
  organizationId: string;
  actorEmail: string;
  userId: string | null;
}

interface PlatformSnapshotTenant {
  id?: unknown;
  slug?: unknown;
}

const MISSING_MEDIA_TENANT_MESSAGE =
  "Media Studio mangler RealtyFlow tenant. Kjør AI Media Studio-migrasjonen.";

function isCoreSchemaUnavailable(error: { code?: string; message?: string } | null | undefined) {
  return error?.code === "PGRST106" || error?.message?.includes("Invalid schema: core");
}

async function resolveTenantId(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .schema("core")
    .from("tenants")
    .select("id")
    .eq("slug", DEFAULT_MEDIA_TENANT_SLUG)
    .maybeSingle();

  if (!error && data?.id) return String(data.id);
  if (error && !isCoreSchemaUnavailable(error)) throw new Error(MISSING_MEDIA_TENANT_MESSAGE);

  const snapshot = await supabase.rpc("platform_snapshot");
  if (snapshot.error || !snapshot.data || typeof snapshot.data !== "object") {
    throw new Error(MISSING_MEDIA_TENANT_MESSAGE);
  }

  const tenants = (snapshot.data as { tenants?: PlatformSnapshotTenant[] }).tenants;
  const tenant = Array.isArray(tenants)
    ? tenants.find((candidate) => candidate.slug === DEFAULT_MEDIA_TENANT_SLUG)
    : null;

  if (!tenant?.id) throw new Error(MISSING_MEDIA_TENANT_MESSAGE);
  return String(tenant.id);
}

export async function getMediaAccessScope(
  supabase: SupabaseClient,
  context: RequestAccessContext,
): Promise<MediaAccessScope> {
  const organizationId = await resolveTenantId(supabase);

  return {
    organizationId,
    actorEmail: context.email,
    userId: null,
  };
}
