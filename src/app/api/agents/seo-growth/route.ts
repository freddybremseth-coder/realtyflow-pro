export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminApi } from "@/lib/api-admin";
import { getSEOObservedSignals } from "@/services/agents/seo-data";

export async function GET(request: NextRequest) {
  const unauthorized = await requireAdminApi(request);
  if (unauthorized) return unauthorized;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });

  try {
    const supabase = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const [signals, saved] = await Promise.all([
      getSEOObservedSignals(),
      supabase.from("automation_logs").select("created_at,status,details")
        .eq("action", "seo_portfolio_growth_review")
        .order("created_at", { ascending: false }).limit(1).maybeSingle(),
    ]);
    if (saved.error) throw new Error(saved.error.message);
    return NextResponse.json({
      signals,
      latest: saved.data
        ? { at: saved.data.created_at, status: saved.data.status,
            report: (saved.data.details as { report?: string } | null)?.report || "" }
        : null,
      nextStep: "The weekly job publishes review-only proposals, never production changes.",
    });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : "SEO data unavailable",
    }, { status: 503 });
  }
}
