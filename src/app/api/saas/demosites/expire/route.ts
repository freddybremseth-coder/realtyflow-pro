import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type SupabaseClientLike = any;

type ExpirableOrder = {
  id: string;
  company_name?: string | null;
  customer_email?: string | null;
  expires_at?: string | null;
  preview_url?: string | null;
  claim_url?: string | null;
};

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env[["SUPABASE", "SERVICE", "ROLE", "KEY"].join("_")];
  if (!url || !key) return null;
  return createClient(url, key);
}

function isAuthorized(request: NextRequest) {
  const expected = process.env.DEMOSITES_CRON_SECRET || process.env.CRON_SECRET;
  if (!expected) return false;
  const header = request.headers.get("x-demosites-cron-secret") || request.headers.get("x-cron-secret");
  const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  return header === expected || bearer === expected;
}

async function findExpiredOrders(supabase: SupabaseClientLike) {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("demo_site_orders")
    .select("id, company_name, customer_email, expires_at, preview_url, claim_url")
    .eq("status", "draft_preview")
    .lt("expires_at", now)
    .order("expires_at", { ascending: true });

  if (error) throw error;
  return (data || []) as ExpirableOrder[];
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized or missing cron secret" }, { status: 401 });
  }

  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase server key is not configured" }, { status: 503 });

  try {
    const expiredOrders = await findExpiredOrders(supabase);
    return NextResponse.json({ expiredCount: expiredOrders.length, expiredOrders });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not check expired demo orders" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized or missing cron secret" }, { status: 401 });
  }

  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase server key is not configured" }, { status: 503 });

  try {
    const expiredOrders = await findExpiredOrders(supabase);
    if (expiredOrders.length === 0) {
      return NextResponse.json({ expiredCount: 0, expiredOrders: [] });
    }

    const expiredIds = expiredOrders.map((order) => order.id);
    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from("demo_site_orders")
      .update({
        status: "expired",
        updated_at: now,
        provisioning_log: [
          {
            at: now,
            type: "demo_expired",
            message: "Midlertidig demo er utløpt fordi kunden ikke kjøpte eller claimet den i tide.",
          },
        ],
      })
      .in("id", expiredIds)
      .select("id, company_name, customer_email, status, expires_at");

    if (error) throw error;

    await supabase.from("demo_site_order_events").insert(
      expiredOrders.map((order) => ({
        order_id: order.id,
        event_type: "demo_expired",
        title: "Demo utløpt",
        description: `${order.company_name || "Demo"} er merket som utløpt.`,
        metadata: { expires_at: order.expires_at, preview_url: order.preview_url, claim_url: order.claim_url },
      })),
    );

    return NextResponse.json({ expiredCount: expiredIds.length, expiredOrders: data || [] });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not expire demo orders" },
      { status: 500 },
    );
  }
}
