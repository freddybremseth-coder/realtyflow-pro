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

  // Split items: those with ref get upserted (dedup), those without get inserted
  const withRef: Record<string, unknown>[] = [];
  const withoutRef: Record<string, unknown>[] = [];
  for (const item of items) {
    const ref = item.ref as string | undefined;
    if (ref && ref.trim()) {
      withRef.push(item);
    } else {
      withoutRef.push(item);
    }
  }

  const chunkSize = 200;
  const allInserted: Record<string, unknown>[] = [];
  let deduplicated = 0;
  const errors: string[] = [];

  // Upsert items with ref - delete matching first, then insert in chunks
  if (withRef.length > 0) {
    // Delete in batches to avoid URL length limits
    for (let i = 0; i < withRef.length; i += chunkSize) {
      const chunkRefs = withRef.slice(i, i + chunkSize).map((item) => item.ref as string);
      const { data: deleted } = await supabase
        .from("properties")
        .delete()
        .in("ref", chunkRefs)
        .select("id");
      deduplicated += deleted?.length || 0;
    }

    // Insert in chunks
    for (let i = 0; i < withRef.length; i += chunkSize) {
      const chunk = withRef.slice(i, i + chunkSize);
      const { data, error } = await supabase.from("properties").insert(chunk).select();
      if (error) {
        errors.push(`Chunk ${i / chunkSize + 1}: ${error.message}`);
        continue; // Don't abort - try remaining chunks
      }
      if (data) allInserted.push(...data);
    }
  }

  // Insert items without ref
  if (withoutRef.length > 0) {
    for (let i = 0; i < withoutRef.length; i += chunkSize) {
      const chunk = withoutRef.slice(i, i + chunkSize);
      const { data, error } = await supabase.from("properties").insert(chunk).select();
      if (error) {
        errors.push(`No-ref chunk ${i / chunkSize + 1}: ${error.message}`);
        continue;
      }
      if (data) allInserted.push(...data);
    }
  }

  if (errors.length > 0 && allInserted.length === 0) {
    return NextResponse.json({ error: errors.join("; ") }, { status: 500 });
  }

  return NextResponse.json({
    data: allInserted,
    deduplicated,
    inserted: allInserted.length,
    errors: errors.length > 0 ? errors : undefined,
  });
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
