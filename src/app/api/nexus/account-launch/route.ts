import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/api-admin";
import { getServiceSupabase } from "@/services/marketing/campaign-production";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const denied = await requireAdminApi(request);
  if (denied) return denied;
  const supabase = getServiceSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  const [{ data: plans, error }, { data: channels }] = await Promise.all([
    supabase.from("nexus_account_launch_plans").select("*").order("created_at", { ascending: true }),
    supabase.from("social_channels").select("brand_id,platform,external_id,display_name,is_active").eq("is_active", true),
  ]);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    plans: plans ?? [],
    connectedChannels: channels ?? [],
    policy: {
      canonicalConnections: "/connections",
      externalAccountCreation: "provider_consent_required",
      automaticEngagement: false,
      note: "Nexus may prepare identity, content and automation. Provider account creation/OAuth remains an explicit provider-owned step."
    }
  });
}

export async function POST(request: NextRequest) {
  const denied = await requireAdminApi(request);
  if (denied) return denied;
  const supabase = getServiceSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  const body = await request.json().catch(() => ({}));
  const id = String(body?.id ?? "").trim();
  const status = String(body?.status ?? "").trim();
  if (!id || !["proposed","ready","connected","active","rejected"].includes(status)) {
    return NextResponse.json({ error: "id og gyldig status er påkrevd" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("nexus_account_launch_plans")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, plan: data });
}
