import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminApi } from "@/lib/api-admin";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

/**
 * Compatibility endpoint for older UI callers.
 * Canonical source is social_channels. Legacy social_accounts rows are no longer
 * returned because historical rows contain incorrect/ambiguous brand bindings.
 */
export async function GET(req: NextRequest) {
  const adminError = await requireAdminApi(req, { accounts: [] });
  if (adminError) return adminError;

  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ accounts: [], canonicalSource: "social_channels" });

  const { data: channels, error } = await supabase
    .from("social_channels")
    .select("id, brand_id, platform, external_id, display_name, is_active, created_at, updated_at")
    .eq("is_active", true)
    .order("platform")
    .order("display_name");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const accounts = (channels ?? []).map((row) => ({
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

  return NextResponse.json({
    accounts,
    canonicalSource: "social_channels",
    legacyWritesDisabled: true,
    manageAt: "/connections",
  });
}

function retiredWriteResponse() {
  return NextResponse.json({
    error: "LEGACY_SOCIAL_ACCOUNTS_WRITE_RETIRED",
    message: "Koble, test eller fjern kanaler via Nexus → Channel Connections. social_channels + oauth_tokens er canonical.",
    manageAt: "/connections",
  }, { status: 410 });
}

export async function POST(req: NextRequest) {
  const adminError = await requireAdminApi(req);
  if (adminError) return adminError;
  return retiredWriteResponse();
}

export async function DELETE(req: NextRequest) {
  const adminError = await requireAdminApi(req);
  if (adminError) return adminError;
  return retiredWriteResponse();
}
