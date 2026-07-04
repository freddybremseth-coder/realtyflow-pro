import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireAdminApi } from '@/lib/api-admin';

export async function POST(request: NextRequest) {
  const unauthorized = await requireAdminApi(request);
  if (unauthorized) return unauthorized;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return NextResponse.json({ error: 'No DB config' }, { status: 500 });

  const supabase = createClient(url, key);

  const migrations = [
    'ALTER TABLE contacts ADD COLUMN IF NOT EXISTS sale_price REAL',
    'ALTER TABLE contacts ADD COLUMN IF NOT EXISTS commission_amount REAL',
    'ALTER TABLE contacts ADD COLUMN IF NOT EXISTS commission_percent REAL',
    'ALTER TABLE contacts ADD COLUMN IF NOT EXISTS commission_paid_date TIMESTAMPTZ',
    "ALTER TABLE contacts ADD COLUMN IF NOT EXISTS brand_id TEXT DEFAULT 'soleada'",
  ];

  const results: string[] = [];
  for (const sql of migrations) {
    const { error } = await supabase.rpc('exec_sql', { sql_query: sql }).maybeSingle();
    if (error) {
      // Try raw query via postgrest - if rpc doesn't exist, columns may already exist
      results.push(`${sql.split('IF NOT EXISTS ')[1] || sql}: ${error.message}`);
    } else {
      results.push(`OK: ${sql.split('IF NOT EXISTS ')[1] || sql}`);
    }
  }

  return NextResponse.json({ success: true, results });
}
