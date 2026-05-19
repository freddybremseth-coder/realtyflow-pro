import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

function timestamp(row: { updated_at?: string | null; created_at?: string | null }) {
  return new Date(row.updated_at || row.created_at || 0).getTime();
}

function dedupeKey(row: {
  brand_id?: string | null;
  source_type?: string | null;
  title?: string | null;
  source_id?: string | null;
  next_action?: string | null;
}) {
  return [
    row.brand_id || "",
    row.source_type || "",
    String(row.title || "").trim().toLowerCase(),
    row.source_id || "",
    String(row.next_action || "").trim().toLowerCase(),
  ].join("|");
}

export async function POST(req: NextRequest) {
  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });

  const body = await req.json().catch(() => ({}));
  const includeDone = body?.includeDone === true;

  const { data, error } = await supabase
    .from("work_items")
    .select("id,title,brand_id,source_type,source_id,next_action,status,updated_at,created_at")
    .order("updated_at", { ascending: false })
    .limit(5000);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = (data || []).filter((row) => includeDone || row.status !== "DONE");
  const deleteIds = new Set<string>();

  for (const row of rows) {
    if (/^TEST HUB\s+/i.test(String(row.title || ""))) deleteIds.add(row.id);
  }

  const groups = new Map<string, typeof rows>();
  for (const row of rows) {
    const key = dedupeKey(row);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(row);
  }

  const groupedValues = Array.from(groups.values());
  for (const group of groupedValues) {
    if (group.length <= 1) continue;
    group.sort((a: any, b: any) => timestamp(b) - timestamp(a));
    for (let i = 1; i < group.length; i += 1) deleteIds.add(group[i].id);
  }

  const ids = Array.from(deleteIds);
  if (!ids.length) return NextResponse.json({ deleted: 0, scanned: rows.length });

  const chunkSize = 200;
  let deleted = 0;
  for (let i = 0; i < ids.length; i += chunkSize) {
    const chunk = ids.slice(i, i + chunkSize);
    const { error: delError } = await supabase.from("work_items").delete().in("id", chunk);
    if (delError) return NextResponse.json({ error: delError.message }, { status: 500 });
    deleted += chunk.length;
  }

  return NextResponse.json({ deleted, scanned: rows.length });
}
