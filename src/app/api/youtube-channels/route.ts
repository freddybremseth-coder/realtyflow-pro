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
 * Compatibility endpoint for the old Settings YouTube tab.
 * Canonical YouTube connections now live in social_channels + oauth_tokens and
 * are managed from Nexus → Channel Connections.
 */
export async function GET(req: NextRequest) {
  const adminError = await requireAdminApi(req, { channels: [] });
  if (adminError) return adminError;

  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ channels: [], canonicalSource: "social_channels" });

  const { data, error } = await supabase
    .from("social_channels")
    .select("id,brand_id,external_id,display_name,is_active,created_at")
    .eq("platform", "youtube")
    .eq("is_active", true)
    .order("created_at");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const channels = (data ?? []).map((row) => ({
    id: row.id,
    name: row.display_name,
    handle: "",
    channel_id: row.external_id,
    api_key: "",
    brand: row.brand_id,
    content_types: [],
    is_active: row.is_active !== false,
    _source: "oauth",
  }));

  return NextResponse.json({
    channels,
    canonicalSource: "social_channels",
    legacyWritesDisabled: true,
    manageAt: "/connections",
  });
}

function retiredWriteResponse() {
  return NextResponse.json({
    error: "LEGACY_YOUTUBE_CHANNEL_WRITE_RETIRED",
    message: "YouTube-kanaler kobles nå via Nexus → Channel Connections. Manuell youtube_channels-konfigurasjon er pensjonert.",
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

export async function PATCH(req: NextRequest) {
  const adminError = await requireAdminApi(req);
  if (adminError) return adminError;
  return retiredWriteResponse();
}
