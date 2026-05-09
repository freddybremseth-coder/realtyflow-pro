import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const ALLOWED_ATTENDANCE = ["attended", "no_show", "cancelled"] as const;
type Attendance = (typeof ALLOWED_ATTENDANCE)[number];

function isAttendance(value: unknown): value is Attendance | null {
  return value === null || (typeof value === "string" && ALLOWED_ATTENDANCE.includes(value as Attendance));
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const id = params.id;
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const body = await request.json().catch(() => ({}));
  if (!("attendance" in body) || !isAttendance(body.attendance)) {
    return NextResponse.json(
      { error: "attendance must be one of attended | no_show | cancelled | null" },
      { status: 400 },
    );
  }

  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("work_items")
    .update({ attendance: body.attendance, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("id,attendance")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, work_item: data });
}
