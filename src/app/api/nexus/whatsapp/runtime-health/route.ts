import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/api-admin";
import { classifyWhatsAppRuntimeHealth } from "@/lib/nexus/whatsapp-runtime-health";
import { getServiceSupabase } from "@/services/marketing/campaign-production";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest) {
  const denied = await requireAdminApi(request);
  if (denied) return denied;

  const supabase = getServiceSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  const now = Date.now();
  const since24h = new Date(now - 24 * 60 * 60 * 1000).toISOString();
  const today = new Date(now).toISOString().slice(0, 10);

  const [logsR, eventsR, referralsR, workR] = await Promise.all([
    supabase.from("automation_logs")
      .select("status,created_at")
      .eq("action", "whatsapp_inbound")
      .gte("created_at", since24h)
      .order("created_at", { ascending: false })
      .limit(200),
    supabase.from("revenue_events")
      .select("id,occurred_at")
      .eq("source_system", "whatsapp")
      .gte("occurred_at", since24h)
      .order("occurred_at", { ascending: false })
      .limit(500),
    supabase.from("work_items")
      .select("id,status")
      .eq("source_type", "whatsapp_referral")
      .in("status", ["TO_DO", "IN_PROGRESS", "OPEN"])
      .limit(500),
    supabase.from("work_items")
      .select("id,status,due_date,source_type")
      .in("source_type", ["whatsapp", "whatsapp_referral"])
      .in("status", ["TO_DO", "IN_PROGRESS", "OPEN"])
      .lt("due_date", today)
      .limit(500),
  ]);

  const sourceErrors = [logsR.error, eventsR.error, referralsR.error, workR.error].filter(Boolean).map((error: any) => error.message);
  const logs = logsR.error ? [] : (logsR.data ?? []);
  const events = eventsR.error ? [] : (eventsR.data ?? []);
  const referrals = referralsR.error ? [] : (referralsR.data ?? []);
  const overdue = workR.error ? [] : (workR.data ?? []);

  const last = logs[0] as any;
  const health = classifyWhatsAppRuntimeHealth({
    lastWebhookAt: last?.created_at ?? null,
    lastWebhookStatus: last?.status ?? null,
    webhookRuns24h: logs.length,
    webhookFailures24h: logs.filter((row: any) => String(row.status).toLowerCase() === "error").length,
    webhookPartial24h: logs.filter((row: any) => String(row.status).toLowerCase() === "partial").length,
    persistedMessages24h: events.length,
    unresolvedReferrals: referrals.length,
    overdueWhatsAppWorkItems: overdue.length,
  });

  return NextResponse.json({
    generatedAt: new Date(now).toISOString(),
    sourceHealthy: sourceErrors.length === 0,
    sourceErrors,
    health,
  });
}
