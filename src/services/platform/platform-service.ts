import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { PlatformSnapshot } from "@/lib/platform/types";
import type { PlatformCommandInput } from "@/lib/platform/validation";

type RpcClient = Pick<SupabaseClient, "rpc">;

const COMMAND_RPCS: Record<PlatformCommandInput["command"], string> = {
  upsert_tenant: "platform_upsert_tenant",
  upsert_membership: "platform_upsert_membership",
  set_module: "platform_set_tenant_module",
  set_entitlement: "platform_set_entitlement",
  upsert_branding: "platform_upsert_branding",
  upsert_domain: "platform_upsert_domain",
  upsert_subscription: "platform_upsert_subscription",
};

export async function loadPlatformSnapshot(client: RpcClient): Promise<PlatformSnapshot> {
  const { data, error } = await client.rpc("platform_snapshot");
  if (error) throw new Error(error.message);
  if (!data || typeof data !== "object") throw new Error("Platform Core returnerte ingen data.");
  return data as PlatformSnapshot;
}

export async function executePlatformCommand(
  client: RpcClient,
  input: PlatformCommandInput,
  actorEmail: string,
) {
  const { data, error } = await client.rpc(COMMAND_RPCS[input.command], {
    p_payload: input.payload,
    p_actor_email: actorEmail,
  });
  if (error) throw new Error(error.message);
  return data;
}
