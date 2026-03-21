import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

export async function GET(req: NextRequest) {
  const supabase = getSupabase();
  const { searchParams } = new URL(req.url);
  const category = searchParams.get("category");

  let query = supabase.from("settings").select("*").order("category").order("key");
  if (category) query = query.eq("category", category);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ settings: data ?? [] });
}

export async function POST(req: NextRequest) {
  const supabase = getSupabase();
  const body = await req.json();
  const { settings } = body as {
    settings: Array<{ key: string; value: string; category?: string; description?: string; is_secret?: boolean }>;
  };

  const { data, error } = await supabase
    .from("settings")
    .upsert(
      settings.map((s) => ({ ...s, updated_at: new Date().toISOString() })),
      { onConflict: "key" }
    )
    .select();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, data });
}
