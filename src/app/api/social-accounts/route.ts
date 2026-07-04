import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminApi } from "@/lib/api-admin";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

export async function GET(req: NextRequest) {
  const adminError = await requireAdminApi(req, { accounts: [] });
  if (adminError) return adminError;

  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ accounts: [] });

  const { data, error } = await supabase
    .from("social_accounts")
    .select("*")
    .order("platform")
    .order("account_name");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // New OAuth system (social_channels + oauth_tokens). Content Hub still
  // consumes /api/social-accounts, so expose a merged view for backwards
  // compatibility until all UI callers are migrated.
  const { data: channels, error: channelsError } = await supabase
    .from("social_channels")
    .select("id, brand_id, platform, external_id, display_name, is_active, created_at, updated_at")
    .eq("is_active", true)
    .order("platform")
    .order("display_name");
  if (channelsError) {
    return NextResponse.json({ error: channelsError.message }, { status: 500 });
  }

  const legacy = (data ?? []).map((row) => ({
    ...row,
    _source: "legacy",
  }));
  const modern = (channels ?? []).map((row) => ({
    id: row.id,
    platform: row.platform,
    account_name: row.display_name,
    account_id: row.external_id,
    brand: row.brand_id,
    brand_id: row.brand_id,
    is_active: row.is_active !== false,
    created_at: row.created_at,
    updated_at: row.updated_at,
    _source: "oauth",
  }));

  const merged = [...legacy];
  const seen = new Set(
    legacy.map((r) =>
      `${String(r.brand_id || r.brand || "").toLowerCase()}|${String(r.platform || "").toLowerCase()}|${String(r.account_id || "").toLowerCase()}`,
    ),
  );
  for (const row of modern) {
    const key = `${String(row.brand_id || row.brand || "").toLowerCase()}|${String(row.platform || "").toLowerCase()}|${String(row.account_id || "").toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(row);
  }

  return NextResponse.json({ accounts: merged });
}

export async function POST(req: NextRequest) {
  const adminError = await requireAdminApi(req);
  if (adminError) return adminError;

  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  const body = await req.json();
  const { data, error } = await supabase
    .from("social_accounts")
    .insert(body)
    .select();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ account: data[0] });
}

export async function DELETE(req: NextRequest) {
  const adminError = await requireAdminApi(req);
  if (adminError) return adminError;

  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  const { error } = await supabase.from("social_accounts").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
