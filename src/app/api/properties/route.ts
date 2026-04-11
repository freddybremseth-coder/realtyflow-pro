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
  const id = searchParams.get("id");
  if (id) {
    const { data, error } = await supabase
      .from("properties")
      .select("*")
      .eq("id", id)
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  }
  // Supabase/PostgREST default limit is 1000 rows - paginate to get all
  const allData: Record<string, unknown>[] = [];
  const pageSize = 1000;
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from("properties")
      .select("*")
      .order("created_at", { ascending: false })
      .range(from, from + pageSize - 1);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data || data.length === 0) break;
    allData.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return NextResponse.json(allData);
}

export async function POST(req: NextRequest) {
  const supabase = getSupabase();
  const body = await req.json();
  const items: Record<string, unknown>[] = Array.isArray(body) ? body : [body];

  // Deduplicate: delete existing properties with matching ref before inserting
  const refs = items
    .map((item) => item.ref as string | undefined)
    .filter((r): r is string => Boolean(r && r.trim()));

  let deletedCount = 0;
  if (refs.length > 0) {
    const { data: deleted } = await supabase
      .from("properties")
      .delete()
      .in("ref", refs)
      .select("id");
    deletedCount = deleted?.length || 0;
  }

  // Batch insert in chunks of 500 to avoid Supabase/PostgREST limits
  const chunkSize = 500;
  const allInserted: Record<string, unknown>[] = [];
  for (let i = 0; i < items.length; i += chunkSize) {
    const chunk = items.slice(i, i + chunkSize);
    const { data, error } = await supabase.from("properties").insert(chunk).select();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (data) allInserted.push(...data);
  }
  return NextResponse.json({ data: allInserted, deduplicated: deletedCount });
}

export async function PATCH(req: NextRequest) {
  const supabase = getSupabase();
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const body = await req.json();
  const { data, error } = await supabase
    .from("properties")
    .update(body)
    .eq("id", id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(req: NextRequest) {
  const supabase = getSupabase();
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const { error } = await supabase.from("properties").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
