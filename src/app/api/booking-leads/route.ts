import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Attendance = "attended" | "no_show" | "cancelled" | null;

type BookingRow = {
  id: string;
  date: string;
  time: string;
  serviceTitle: string;
  customer: string;
  email: string;
  status: "confirmed" | "pending";
  price: string;
  paid: boolean;
  attendance: Attendance;
};

function normalizeBrand(brandId: string) {
  if (brandId === "zen") return "zeneco";
  if (brandId === "pinoso") return "pinosoecolife";
  if (brandId === "chat") return "chatgenius";
  if (brandId === "freddy") return "freddyb";
  return brandId;
}

function priceFromMeta(meta: Record<string, unknown> | null | undefined) {
  const price = (meta?.appointment_price as string) || "";
  const trimmed = price.trim();
  if (!trimmed) return { price: "Gratis", paid: false };
  if (/gratis/i.test(trimmed)) return { price: "Gratis", paid: false };
  return { price: trimmed, paid: true };
}

function dateKey(date?: string, time?: string) {
  const d = (date || "").trim();
  const t = (time || "00:00").trim();
  if (!d) return "9999-12-31T00:00:00";
  return `${d}T${t.length === 5 ? t : "00:00"}:00`;
}

function formatDateNo(date?: string, time?: string) {
  const d = (date || "").trim();
  const t = (time || "").trim();
  if (!d) return "Uten dato";
  const parsed = new Date(d);
  if (Number.isNaN(parsed.getTime())) return [d, t].filter(Boolean).join(" · ");
  const months = ["jan", "feb", "mar", "apr", "mai", "jun", "jul", "aug", "sep", "okt", "nov", "des"];
  const dayLabel = `${parsed.getDate()}. ${months[parsed.getMonth()]}`;
  return t ? `${dayLabel} · ${t}` : dayLabel;
}

export async function GET(request: NextRequest) {
  const supabase = createServerClient();
  const rawBrand = request.nextUrl.searchParams.get("brand_id") || "";
  const brandId = normalizeBrand(rawBrand);
  const limit = Math.min(Number(request.nextUrl.searchParams.get("limit") || 20), 100);
  const todayKey = new Date().toISOString().slice(0, 10);

  type WorkItemRow = {
    id: string;
    title?: string | null;
    description?: string | null;
    status?: string | null;
    due_date?: string | null;
    brand_id?: string | null;
    metadata?: Record<string, unknown> | null;
    created_at?: string | null;
    attendance?: string | null;
  };

  const buildQuery = (withAttendance: boolean) => {
    const cols = withAttendance
      ? "id,title,description,status,due_date,brand_id,metadata,created_at,attendance"
      : "id,title,description,status,due_date,brand_id,metadata,created_at";
    const q = supabase
      .from("work_items")
      .select(cols)
      .eq("source_type", "website_lead")
      .gte("due_date", todayKey)
      .order("due_date", { ascending: true })
      .limit(limit);
    if (brandId) q.eq("brand_id", brandId);
    return q;
  };

  let { data, error } = await buildQuery(true);
  if (error && /attendance.*does not exist/i.test(error.message)) {
    ({ data, error } = await buildQuery(false));
  }
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rawRows = (data as unknown as WorkItemRow[]) || [];
  const rows: BookingRow[] = rawRows
    .filter((row) => Boolean(row.metadata?.is_web_meeting_booking))
    .map((row) => {
      const meta = (row.metadata || {}) as Record<string, unknown>;
      const apptDate = meta.appointment_date as string | undefined;
      const apptTime = meta.appointment_time as string | undefined;
      const { price, paid } = priceFromMeta(meta);
      const customer = String(row.title || "").replace(/^Ny booking:\s*/i, "").trim() || "Ukjent kunde";
      const description = String(row.description || "");
      const serviceTitle = description.split("·")[0]?.trim() || "Booking";
      const emailMatch = description.match(/[\w.+-]+@[\w-]+\.[\w.-]+/);
      const attendanceRaw = (row as { attendance?: unknown }).attendance;
      const attendance: Attendance = attendanceRaw === "attended" || attendanceRaw === "no_show" || attendanceRaw === "cancelled" ? attendanceRaw : null;
      return {
        id: row.id,
        date: formatDateNo(apptDate, apptTime),
        time: apptTime || "",
        serviceTitle,
        customer,
        email: emailMatch?.[0] || "",
        status: row.status === "DONE" || row.status === "IN_PROGRESS" ? "confirmed" : "pending",
        price,
        paid,
        attendance,
        sortKey: dateKey(apptDate, apptTime),
      } as BookingRow & { sortKey: string };
    })
    .sort((a, b) => a.sortKey.localeCompare(b.sortKey))
    .map(({ sortKey: _sortKey, ...rest }) => rest);

  return NextResponse.json({ bookings: rows });
}
