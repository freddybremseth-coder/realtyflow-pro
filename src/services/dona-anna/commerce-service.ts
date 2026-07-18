import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { DonaAnnaSnapshot } from "@/lib/dona-anna/types";
import type { DonaAnnaCommandInput } from "@/lib/dona-anna/validation";

type RpcClient = Pick<SupabaseClient, "rpc">;

function commandRpc(command: DonaAnnaCommandInput["command"]) {
  const mapping: Record<DonaAnnaCommandInput["command"], string> = {
    upsert_product: "donaanna_upsert_product",
    upsert_price_list: "donaanna_upsert_price_list",
    set_price: "donaanna_set_price",
    upsert_party: "donaanna_upsert_party",
    upsert_warehouse: "donaanna_upsert_warehouse",
    upsert_lot: "donaanna_upsert_lot",
    adjust_inventory: "donaanna_adjust_inventory",
    create_order: "donaanna_create_order",
    order_action: "donaanna_order_action",
    pos_action: "donaanna_pos_action",
    upsert_commission_rule: "donaanna_upsert_commission_rule",
    create_return: "donaanna_create_return",
    create_recall: "donaanna_create_recall",
    record_landed_cost: "donaanna_record_landed_cost",
    link_organization: "donaanna_link_organization",
    create_invoice: "donaanna_create_invoice_draft",
  };
  return mapping[command];
}

export async function loadDonaAnnaSnapshot(client: RpcClient): Promise<DonaAnnaSnapshot> {
  const { data, error } = await client.rpc("donaanna_snapshot", { p_workspace_slug: "dona-anna" });
  if (error) throw new Error(error.message);
  if (!data || typeof data !== "object") throw new Error("Doña Anna returnerte ingen arbeidsdata.");
  return data as DonaAnnaSnapshot;
}

export async function executeDonaAnnaCommand(
  client: RpcClient,
  input: DonaAnnaCommandInput,
  actorEmail: string,
) {
  const rpc = commandRpc(input.command);
  let args: Record<string, unknown>;
  if (input.command === "order_action") {
    args = {
      p_order_id: input.payload.orderId,
      p_action: input.payload.action,
      p_payload: input.payload,
      p_actor_email: actorEmail,
    };
  } else if (input.command === "pos_action") {
    args = { p_action: input.payload.action, p_payload: input.payload, p_actor_email: actorEmail };
  } else if (input.command === "create_invoice") {
    args = { p_order_id: input.payload.orderId, p_actor_email: actorEmail };
  } else {
    args = { p_payload: input.payload, p_actor_email: actorEmail };
  }
  const { data, error } = await client.rpc(rpc, args);
  if (error) throw new Error(error.message);
  return data;
}
