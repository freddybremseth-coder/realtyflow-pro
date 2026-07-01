import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type RequestBody = Record<string, unknown>;

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env[["SUPABASE", "SERVICE", "ROLE", "KEY"].join("_")];
  if (!url || !key) return null;
  return createClient(url, key);
}

function text(value: unknown, maxLength = 200) {
  const output = String(value || "").trim();
  return output ? output.slice(0, maxLength) : null;
}

function nok(value: unknown) {
  if (value === undefined || value === null || value === "") return undefined;
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) return undefined;
  return Math.max(0, Math.round(numberValue));
}

export async function GET(request: NextRequest) {
  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase server key is not configured" }, { status: 503 });

  const orderId = request.nextUrl.searchParams.get("order_id") || request.nextUrl.searchParams.get("id");
  if (!orderId) return NextResponse.json({ error: "order_id is required" }, { status: 400 });

  const { data, error } = await supabase
    .from("demo_site_orders")
    .select("id, company_name, package_id, setup_fee_nok, monthly_fee_nok, setup_cost_nok, monthly_cost_nok, billing_status, status")
    .eq("id", orderId)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ order: data });
}

export async function PATCH(request: NextRequest) {
  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase server key is not configured" }, { status: 503 });

  try {
    const body = (await request.json().catch(() => ({}))) as RequestBody;
    const orderId = text(body.order_id ?? body.orderId ?? body.id, 80);
    if (!orderId) return NextResponse.json({ error: "order_id is required" }, { status: 400 });

    const patch: Record<string, unknown> = {};
    const setupFee = nok(body.setup_fee_nok ?? body.setupFeeNok ?? body.setup_fee ?? body.setupFee);
    const monthlyFee = nok(body.monthly_fee_nok ?? body.monthlyFeeNok ?? body.monthly_fee ?? body.monthlyFee);
    const setupCost = nok(body.setup_cost_nok ?? body.setupCostNok ?? body.setup_cost ?? body.setupCost);
    const monthlyCost = nok(body.monthly_cost_nok ?? body.monthlyCostNok ?? body.monthly_cost ?? body.monthlyCost);

    if (setupFee !== undefined) patch.setup_fee_nok = setupFee;
    if (monthlyFee !== undefined) patch.monthly_fee_nok = monthlyFee;
    if (setupCost !== undefined) patch.setup_cost_nok = setupCost;
    if (monthlyCost !== undefined) patch.monthly_cost_nok = monthlyCost;

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: "No fee fields supplied" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("demo_site_orders")
      .update(patch)
      .eq("id", orderId)
      .select("id, company_name, package_id, setup_fee_nok, monthly_fee_nok, setup_cost_nok, monthly_cost_nok, billing_status, status")
      .single();

    if (error) throw error;

    await supabase.from("demo_site_order_events").insert({
      order_id: orderId,
      event_type: "fees_updated",
      title: "Priser oppdatert",
      description: "Setup-pris, månedlig pris eller intern kost ble oppdatert.",
      metadata: patch,
    });

    return NextResponse.json({ order: data });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not update fees" }, { status: 500 });
  }
}
