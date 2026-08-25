import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/api-admin";
import { getServiceSupabase } from "@/services/marketing/campaign-production";

export const dynamic = "force-dynamic";

function actor(request: NextRequest) {
  return request.headers.get("x-user-email") || request.headers.get("x-forwarded-user") || "realtyflow-owner";
}

export async function GET(request: NextRequest) {
  const denied = await requireAdminApi(request);
  if (denied) return denied;
  const supabase = getServiceSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  const { data, error } = await supabase
    .from("nexus_owner_focus")
    .select("*")
    .order("status")
    .order("intensity", { ascending: false })
    .order("updated_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ focus: data ?? [] });
}

export async function POST(request: NextRequest) {
  const denied = await requireAdminApi(request);
  if (denied) return denied;
  const supabase = getServiceSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  const body = await request.json().catch(() => ({}));
  const action = String(body?.action ?? "create");
  const changedBy = actor(request);

  if (action === "create") {
    const brandId = String(body?.brand_id ?? "").trim();
    const focusKey = String(body?.focus_key ?? "").trim();
    const title = String(body?.title ?? "").trim();
    const notes = String(body?.notes ?? "").trim() || null;
    const successDefinition = String(body?.success_definition ?? "").trim() || null;
    const intensity = Math.max(1, Math.min(10, Number(body?.intensity ?? 8) || 8));
    if (!brandId || !focusKey || !title) return NextResponse.json({ error: "brand_id, focus_key and title are required" }, { status: 400 });

    const { data, error } = await supabase
      .from("nexus_owner_focus")
      .insert({ brand_id: brandId, focus_key: focusKey, title, notes, success_definition: successDefinition, intensity, created_by: changedBy, review_due_at: new Date(Date.now() + 7 * 86400000).toISOString() })
      .select("*")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    await supabase.from("nexus_owner_focus_audit").insert({ focus_id: data.id, action: "created", resulting_value: data, changed_by: changedBy });
    return NextResponse.json({ ok: true, focus: data });
  }

  const id = String(body?.id ?? "").trim();
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
  const { data: current, error: currentError } = await supabase.from("nexus_owner_focus").select("*").eq("id", id).single();
  if (currentError || !current) return NextResponse.json({ error: "Focus not found" }, { status: 404 });

  if (action === "status") {
    const status = String(body?.status ?? "");
    if (!["active","paused","completed","cancelled"].includes(status)) return NextResponse.json({ error: "invalid status" }, { status: 400 });
    const { data, error } = await supabase.from("nexus_owner_focus").update({ status, updated_at: new Date().toISOString() }).eq("id", id).select("*").single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    await supabase.from("nexus_owner_focus_audit").insert({ focus_id: id, action: `status:${status}`, previous_value: current, resulting_value: data, changed_by: changedBy });
    return NextResponse.json({ ok: true, focus: data });
  }

  if (action === "update") {
    const patch = {
      title: body?.title !== undefined ? String(body.title).trim() : current.title,
      notes: body?.notes !== undefined ? String(body.notes).trim() || null : current.notes,
      success_definition: body?.success_definition !== undefined ? String(body.success_definition).trim() || null : current.success_definition,
      intensity: body?.intensity !== undefined ? Math.max(1, Math.min(10, Number(body.intensity) || 1)) : current.intensity,
      updated_at: new Date().toISOString(),
    };
    const { data, error } = await supabase.from("nexus_owner_focus").update(patch).eq("id", id).select("*").single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    await supabase.from("nexus_owner_focus_audit").insert({ focus_id: id, action: "updated", previous_value: current, resulting_value: data, changed_by: changedBy });
    return NextResponse.json({ ok: true, focus: data });
  }

  return NextResponse.json({ error: "unsupported action" }, { status: 400 });
}
