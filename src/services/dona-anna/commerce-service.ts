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
    fulfill_order: "donaanna_fulfill_order",
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
  const [snapshotResult, activityResult] = await Promise.all([
    client.rpc("donaanna_snapshot", { p_workspace_slug: "dona-anna" }),
    client.rpc("donaanna_stock_activity", { p_workspace_slug: "dona-anna", p_limit: 200 }),
  ]);
  if (snapshotResult.error) throw new Error(snapshotResult.error.message);
  if (activityResult.error) throw new Error(activityResult.error.message);
  if (!snapshotResult.data || typeof snapshotResult.data !== "object") {
    throw new Error("Doña Anna returnerte ingen arbeidsdata.");
  }
  return {
    ...(snapshotResult.data as DonaAnnaSnapshot),
    stockMovements: Array.isArray(activityResult.data) ? activityResult.data : [],
  };
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
  } else if (input.command === "fulfill_order") {
    args = {
      p_order_id: input.payload.orderId,
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
