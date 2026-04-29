import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return NextResponse.json({ error: "No DB config" }, { status: 500 });

  const supabase = createClient(url, key);
  const statements = [
    "ALTER TABLE area_profiles ADD COLUMN IF NOT EXISTS show_on_website BOOLEAN NOT NULL DEFAULT FALSE",
    "CREATE INDEX IF NOT EXISTS idx_area_profiles_show_on_website ON area_profiles (brand_id, show_on_website)",
  ];

  const results: string[] = [];
  for (const sql of statements) {
    const { error } = await supabase.rpc("exec_sql", { sql_query: sql }).maybeSingle();
    results.push(error ? `${sql}: ${error.message}` : `OK: ${sql}`);
  }

  return NextResponse.json({ success: true, results });
}
