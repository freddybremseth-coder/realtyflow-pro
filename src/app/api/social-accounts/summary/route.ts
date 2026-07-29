import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

function toSummary(row: { brand?: string | null; brand_id?: string | null; platform?: string | null; is_active?: boolean | null }) {
  return {
    brand: row.brand_id || row.brand || null,
    platform: row.platform || null,
    is_active: row.is_active !== false,
  };
}

export async function GET() {
  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ accounts: [] });

  const [legacyRes, modernRes] = await Promise.all([
    supabase.from("social_accounts").select("brand, brand_id, platform, is_active"),
    supabase.from("social_channels").select("brand_id, platform, is_active"),
  ]);

  if (legacyRes.error) return NextResponse.json({ error: legacyRes.error.message }, { status: 500 });
  if (modernRes.error) return NextResponse.json({ error: modernRes.error.message }, { status: 500 });

  const seen = new Set<string>();
  const accounts = [...(legacyRes.data || []), ...(modernRes.data || [])]
    .map(toSummary)
    .filter((account) => {
      if (!account.brand || !account.platform) return false;
      const key = `${account.brand.toLowerCase()}|${account.platform.toLowerCase()}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

  return NextResponse.json({ accounts });
}
