import { NextRequest, NextResponse } from "next/server";
import {
  authenticateDonaAnnaIntegration,
  DONA_ANNA_INTEGRATION_CLIENTS,
  type DonaAnnaIntegrationClient,
} from "@/lib/dona-anna/integration-auth";
import { getDonaAnnaSupabase } from "@/lib/dona-anna/supabase";
import { donaAnnaCommandSchema, validationMessage } from "@/lib/dona-anna/validation";
import { executeDonaAnnaCommand, loadDonaAnnaSnapshot } from "@/services/dona-anna/commerce-service";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const WRITE_COMMANDS: Record<DonaAnnaIntegrationClient, Set<string>> = {
  olivia: new Set(["upsert_warehouse", "upsert_lot", "adjust_inventory"]),
  storefront: new Set(["upsert_party", "create_order"]),
};

function resolveClient(value: string): DonaAnnaIntegrationClient | null {
  return DONA_ANNA_INTEGRATION_CLIENTS.includes(value as DonaAnnaIntegrationClient)
    ? value as DonaAnnaIntegrationClient
    : null;
}

function authorize(request: NextRequest, clientValue: string) {
  const client = resolveClient(clientValue);
  if (!client) return { client: null, response: NextResponse.json({ error: "Unknown integration client" }, { status: 404 }) };
  const auth = authenticateDonaAnnaIntegration(request, client);
  if (!auth.configured) return { client: null, response: NextResponse.json({ error: "Integration is not configured" }, { status: 503 }) };
  if (!auth.authenticated) return { client: null, response: NextResponse.json({ error: "Invalid integration credential" }, { status: 401 }) };
  return { client, response: null };
}

export async function GET(request: NextRequest, context: { params: { client: string } }) {
  const auth = authorize(request, context.params.client);
  if (!auth.client) return auth.response;
  const supabase = getDonaAnnaSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase is not configured" }, { status: 503 });
  try {
    const snapshot = await loadDonaAnnaSnapshot(supabase);
    const body = auth.client === "storefront"
      ? {
          workspace: snapshot.workspace,
          products: snapshot.products,
          priceLists: snapshot.priceLists,
          priceItems: snapshot.priceItems,
          stock: snapshot.stock.map((row) => ({
            productId: row.product_id,
            lotId: row.lot_id,
            warehouseId: row.warehouse_id,
            available: row.available,
            bestBeforeDate: row.best_before_date,
            lotStatus: row.lot_status,
          })),
        }
      : {
          workspace: snapshot.workspace,
          products: snapshot.products,
          priceLists: snapshot.priceLists,
          priceItems: snapshot.priceItems,
          warehouses: snapshot.warehouses,
          lots: snapshot.lots,
          stock: snapshot.stock,
        };
    return NextResponse.json({ source: "realtyflow", generatedAt: new Date().toISOString(), ...body }, {
      headers: { "cache-control": "private, no-store" },
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Integration read failed" }, { status: 500 });
  }
}

export async function POST(request: NextRequest, context: { params: { client: string } }) {
  const auth = authorize(request, context.params.client);
  if (!auth.client) return auth.response;
  const parsed = donaAnnaCommandSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: validationMessage(parsed.error) }, { status: 400 });
  if (!WRITE_COMMANDS[auth.client].has(parsed.data.command)) {
    return NextResponse.json({ error: `Command ${parsed.data.command} is not allowed for ${auth.client}` }, { status: 403 });
  }
  const supabase = getDonaAnnaSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase is not configured" }, { status: 503 });
  try {
    const result = await executeDonaAnnaCommand(
      supabase,
      parsed.data,
      `integration-${auth.client}@donaanna.local`,
    );
    return NextResponse.json({ result }, { status: parsed.data.command.startsWith("upsert_") ? 200 : 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Integration write failed" }, { status: 500 });
  }
}
