import { NextRequest, NextResponse } from "next/server";
import { getDemoSitesSupabase, type DemoSitesSupabaseClientLike } from "@/lib/demosites-api-supabase";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type ClaimBody = Record<string, unknown>;
type SupabaseClientLike = DemoSitesSupabaseClientLike;

function getSupabase() {
  return getDemoSitesSupabase();
}

function readToken(body: ClaimBody) {
  const token = String(body.token || body.claim_token || "").trim();
  return token || null;
}

function isValidClaimToken(token: string) {
  return /^[a-zA-Z0-9_-]{12,120}$/.test(token);
}

async function getOrderByToken(supabase: SupabaseClientLike, token: string) {
  const { data, error } = await supabase
    .from("demo_site_orders")
    .select("id, status, company_name, customer_email, claim_token, claimed_at, expires_at")
    .eq("claim_token", token)
    .maybeSingle();

  if (error) throw error;
  return data;
}

function isExpired(expiresAt?: string | null) {
  if (!expiresAt) return false;
  return new Date(expiresAt).getTime() < Date.now();
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as ClaimBody;
    const token = readToken(body);

    if (!token) {
      return NextResponse.json({ error: "token is required" }, { status: 400 });
    }
    if (!isValidClaimToken(token)) {
      return NextResponse.json({ error: "token is invalid" }, { status: 400 });
    }

    const supabase = getSupabase();
    if (!supabase) return NextResponse.json({ error: "Supabase server key is not configured" }, { status: 503 });

    const order = await getOrderByToken(supabase, token);
    if (!order) {
      return NextResponse.json({ error: "Demo request not found" }, { status: 404 });
    }

    if (order.status === "expired" || isExpired(order.expires_at)) {
      return NextResponse.json({ error: "Demo request has expired" }, { status: 410 });
    }

    const claimedAt = order.claimed_at || new Date().toISOString();
    const nextStatus = order.status === "deployed" ? "deployed" : "approved";

    const { data, error } = await supabase
      .from("demo_site_orders")
      .update({
        status: nextStatus,
        claimed_at: claimedAt,
        updated_at: new Date().toISOString(),
      })
      .eq("id", order.id)
      .select("id, status, company_name, customer_email, claimed_at, claim_url, preview_url")
      .single();

    if (error) throw error;

    await supabase.from("demo_site_order_events").insert({
      order_id: order.id,
      event_type: "demo_claimed",
      title: "Demo claimet av kunde",
      description: `${order.company_name || "Demo"} ble claimet fra kundesiden.`,
      metadata: { claimed_at: claimedAt, previous_status: order.status, next_status: nextStatus },
    });

    return NextResponse.json({ ok: true, order: data });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not claim demo request" },
      { status: 500 },
    );
  }
}
