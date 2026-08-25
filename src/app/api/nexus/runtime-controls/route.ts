import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/api-admin";
import { getServiceSupabase } from "@/services/marketing/campaign-production";

export const dynamic = "force-dynamic";

function actorFrom(request: NextRequest) {
  return request.headers.get("x-user-email") || request.headers.get("x-forwarded-user") || "realtyflow-owner";
}

export async function GET(request: NextRequest) {
  const denied = await requireAdminApi(request);
  if (denied) return denied;
  const supabase = getServiceSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  const [{ data: controls, error }, { data: audit }] = await Promise.all([
    supabase.from("nexus_runtime_controls").select("*").order("category").order("label"),
    supabase.from("nexus_runtime_control_audit").select("*").order("created_at", { ascending: false }).limit(50),
  ]);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    controls: controls ?? [],
    audit: audit ?? [],
    note: "Operational switches live here. Provider secrets and OAuth credentials remain in secure environment/token storage."
  });
}

export async function POST(request: NextRequest) {
  const denied = await requireAdminApi(request);
  if (denied) return denied;
  const supabase = getServiceSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  const body = await request.json().catch(() => ({}));
  const controlKey = String(body?.control_key ?? "").trim();
  const enabled = body?.enabled;
  const reason = String(body?.reason ?? "Changed from Nexus Runtime Controls").trim();
  const confirmed = body?.confirmed === true;
  if (!controlKey || typeof enabled !== "boolean") return NextResponse.json({ error: "control_key and enabled are required" }, { status: 400 });

  const { data: current, error: currentError } = await supabase.from("nexus_runtime_controls").select("*").eq("control_key", controlKey).single();
  if (currentError || !current) return NextResponse.json({ error: "Unknown runtime control" }, { status: 404 });
  if ((current.risk_level === "high" || current.risk_level === "critical") && !confirmed) {
    return NextResponse.json({ error: "Explicit confirmation required", requires_confirmation: true, risk_level: current.risk_level }, { status: 409 });
  }

  const actor = actorFrom(request);
  const now = new Date().toISOString();
  const { data: updated, error: updateError } = await supabase
    .from("nexus_runtime_controls")
    .update({ enabled, updated_by: actor, updated_at: now })
    .eq("control_key", controlKey)
    .select("*")
    .single();
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  const { error: auditError } = await supabase.from("nexus_runtime_control_audit").insert({
    control_key: controlKey,
    previous_enabled: Boolean(current.enabled),
    resulting_enabled: enabled,
    previous_config: current.config ?? {},
    resulting_config: updated.config ?? {},
    changed_by: actor,
    reason,
  });
  if (auditError) {
    // Roll back the state change when audit logging fails. Runtime switches
    // must never become unaudited side effects.
    await supabase.from("nexus_runtime_controls").update({ enabled: current.enabled, updated_by: current.updated_by, updated_at: current.updated_at }).eq("control_key", controlKey);
    return NextResponse.json({ error: `Audit failed; change rolled back: ${auditError.message}` }, { status: 500 });
  }

  return NextResponse.json({ ok: true, control: updated });
}
