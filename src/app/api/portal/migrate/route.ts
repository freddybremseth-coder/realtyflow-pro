import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return NextResponse.json({ error: "No DB config" }, { status: 500 });

  const supabase = createClient(url, key);
  const statements = [
    `CREATE TABLE IF NOT EXISTS portal_users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      contact_id UUID NOT NULL UNIQUE REFERENCES contacts(id) ON DELETE CASCADE,
      auth_user_id UUID,
      email TEXT NOT NULL,
      name TEXT,
      brand_id TEXT NOT NULL DEFAULT 'zeneco',
      role TEXT NOT NULL DEFAULT 'customer' CHECK (role IN ('customer', 'admin')),
      status TEXT NOT NULL DEFAULT 'invited' CHECK (status IN ('invited', 'active', 'disabled')),
      invited_at TIMESTAMPTZ,
      last_login_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`,
    "CREATE INDEX IF NOT EXISTS idx_portal_users_email ON portal_users (email)",
    "CREATE INDEX IF NOT EXISTS idx_portal_users_brand ON portal_users (brand_id)",
    "CREATE INDEX IF NOT EXISTS idx_portal_users_auth_user ON portal_users (auth_user_id)",
    "ALTER TABLE portal_users ENABLE ROW LEVEL SECURITY",
    `DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow service role on portal_users') THEN
          CREATE POLICY "Allow service role on portal_users"
            ON portal_users
            FOR ALL
            USING (auth.role() = 'service_role')
            WITH CHECK (auth.role() = 'service_role');
        END IF;
      END $$`,
  ];

  const results: string[] = [];
  for (const sql of statements) {
    const { error } = await supabase.rpc("exec_sql", { sql_query: sql }).maybeSingle();
    results.push(error ? `${sql.slice(0, 80)}: ${error.message}` : `OK: ${sql.slice(0, 80)}`);
  }

  return NextResponse.json({ success: true, results });
}
