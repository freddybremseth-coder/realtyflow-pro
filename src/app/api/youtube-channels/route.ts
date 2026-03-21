import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

export async function GET() {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("youtube_channels")
    .select("*")
    .order("created_at");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ channels: data ?? [] });
}

export async function POST(req: NextRequest) {
  const supabase = getSupabase();
  const body = await req.json();
  const { data, error } = await supabase
    .from("youtube_channels")
    .insert(body)
    .select();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ channel: data[0] });
}

export async function DELETE(req: NextRequest) {
  const supabase = getSupabase();
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  const { error } = await supabase.from("youtube_channels").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}

export async function PATCH(req: NextRequest) {
  const supabase = getSupabase();
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  const body = await req.json();
  const { data, error } = await supabase
    .from("youtube_channels")
    .update(body)
    .eq("id", id)
    .select();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ channel: data[0] });
}
