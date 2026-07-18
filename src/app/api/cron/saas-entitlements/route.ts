import { NextRequest, NextResponse } from "next/server";
import { requireCronApi } from "@/lib/api-cron";
import { getSaasSupabase } from "@/lib/saas-api-supabase";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Suspends plan access only after a failed Stripe payment has exhausted its
 * grace period. A later invoice.paid webhook reactivates the same access.
 */
export async function GET(request: NextRequest) {
  const authError = requireCronApi(request);
  if (authError) return authError;

  const supabase = getSaasSupabase();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });
  }

  const { data, error } = await supabase.rpc("saas_enforce_subscription_grace_periods");
  if (error) {
    console.error("[SaaS Entitlements Cron] Error:", error.message);
    return NextResponse.json({ error: "Could not enforce subscription grace periods" }, { status: 500 });
  }

  return NextResponse.json({ success: true, ...(data || {}) });
}
