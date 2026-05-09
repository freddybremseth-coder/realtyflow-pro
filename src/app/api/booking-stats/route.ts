import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function normalizeBrand(brandId: string) {
  if (brandId === "zen") return "zeneco";
  if (brandId === "pinoso") return "pinosoecolife";
  if (brandId === "chat") return "chatgenius";
  if (brandId === "freddy") return "freddyb";
  return brandId;
}

function parsePrice(value: unknown): number | null {
  const text = String(value || "").trim();
  if (!text) return null;
  if (/gratis|free|kostnadsfritt/i.test(text)) return 0;
  const cleaned = text.replace(/[^0-9.,]/g, "").replace(/\.(?=\d{3}(?:\D|$))/g, "").replace(",", ".");
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : null;
}

function dayKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function startOfMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month, 1)).toISOString();
}

function trend(current: number, previous: number) {
  if (previous === 0) return current === 0 ? "0%" : "+∞";
  const diff = ((current - previous) / previous) * 100;
  const sign = diff >= 0 ? "+" : "−";
  return `${sign}${Math.abs(diff).toFixed(0)}%`;
}

export async function GET(request: NextRequest) {
  const supabase = createServerClient();
  const rawBrand = request.nextUrl.searchParams.get("brand_id") || "";
  const brandId = normalizeBrand(rawBrand);

  const now = new Date();
  const thisMonthStart = startOfMonth(now.getUTCFullYear(), now.getUTCMonth());
  const lastMonthStart = startOfMonth(now.getUTCFullYear(), now.getUTCMonth() - 1);
  const lastMonthEnd = thisMonthStart;
  const sparkSince = new Date(now);
  sparkSince.setUTCDate(now.getUTCDate() - 6);
  sparkSince.setUTCHours(0, 0, 0, 0);

  type WorkItemRow = {
    id: string;
    status?: string | null;
    due_date?: string | null;
    metadata?: Record<string, unknown> | null;
    created_at?: string | null;
    attendance?: string | null;
  };

  const buildQuery = (withAttendance: boolean) => {
    const cols = withAttendance
      ? "id,status,due_date,metadata,created_at,attendance"
      : "id,status,due_date,metadata,created_at";
    const q = supabase
      .from("work_items")
      .select(cols)
      .eq("source_type", "website_lead")
      .gte("created_at", lastMonthStart);
    if (brandId) q.eq("brand_id", brandId);
    return q;
  };

  let { data, error } = await buildQuery(true);
  if (error && /attendance.*does not exist/i.test(error.message)) {
    ({ data, error } = await buildQuery(false));
  }
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rawRows = (data as unknown as WorkItemRow[]) || [];
  const rows = rawRows.filter((row) => Boolean(row.metadata?.is_web_meeting_booking));

  let thisMonthCount = 0;
  let lastMonthCount = 0;
  let thisMonthRevenue = 0;
  let lastMonthRevenue = 0;
  let paidCount = 0;
  let thisMonthNoShow = 0;
  let lastMonthNoShow = 0;
  let thisMonthCompleted = 0;
  let lastMonthCompleted = 0;
  const sparkBuckets: Record<string, number> = {};
  for (let i = 0; i < 7; i += 1) {
    const d = new Date(sparkSince);
    d.setUTCDate(sparkSince.getUTCDate() + i);
    sparkBuckets[dayKey(d)] = 0;
  }

  for (const row of rows) {
    const created = row.created_at ? new Date(row.created_at) : null;
    const meta = (row.metadata || {}) as Record<string, unknown>;
    const price = parsePrice(meta.appointment_price);
    const isPaid = price !== null && price > 0;
    const attendance = (row as { attendance?: string | null }).attendance || null;
    if (!created) continue;

    if (created.toISOString() >= thisMonthStart) {
      thisMonthCount += 1;
      if (price && price > 0) thisMonthRevenue += price;
      if (isPaid) paidCount += 1;
      if (attendance === "no_show") thisMonthNoShow += 1;
      if (attendance === "attended" || attendance === "no_show") thisMonthCompleted += 1;
    } else if (created.toISOString() >= lastMonthStart && created.toISOString() < lastMonthEnd) {
      lastMonthCount += 1;
      if (price && price > 0) lastMonthRevenue += price;
      if (attendance === "no_show") lastMonthNoShow += 1;
      if (attendance === "attended" || attendance === "no_show") lastMonthCompleted += 1;
    }

    const key = dayKey(created);
    if (key in sparkBuckets) sparkBuckets[key] += 1;
  }

  const conversionRate = thisMonthCount === 0 ? 0 : Math.round((paidCount / thisMonthCount) * 100);
  const sparkBookings = Object.keys(sparkBuckets).sort().map((key) => sparkBuckets[key]);
  const noShowRate = thisMonthCompleted === 0 ? null : Math.round((thisMonthNoShow / thisMonthCompleted) * 100);
  const lastNoShowRate = lastMonthCompleted === 0 ? null : (lastMonthNoShow / lastMonthCompleted) * 100;

  return NextResponse.json({
    bookings: {
      value: thisMonthCount,
      trend: trend(thisMonthCount, lastMonthCount),
      up: thisMonthCount >= lastMonthCount,
      spark: sparkBookings,
    },
    revenue: {
      value: thisMonthRevenue,
      trend: trend(thisMonthRevenue, lastMonthRevenue),
      up: thisMonthRevenue >= lastMonthRevenue,
      spark: sparkBookings,
    },
    conversionRate: {
      value: conversionRate,
      trend: null,
      up: conversionRate >= 50,
      spark: sparkBookings,
    },
    noShow: {
      value: noShowRate,
      trend: noShowRate === null || lastNoShowRate === null ? null : trend(noShowRate, lastNoShowRate),
      up: noShowRate !== null && lastNoShowRate !== null ? noShowRate <= lastNoShowRate : false,
      spark: sparkBookings,
    },
    range: { from: lastMonthStart, to: now.toISOString(), brandId },
  });
}
