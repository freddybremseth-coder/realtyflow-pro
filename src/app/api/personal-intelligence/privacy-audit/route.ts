import { NextRequest, NextResponse } from "next/server";
import { getRequestAccessContext } from "@/lib/api-admin";
import { getPersonalIntelligenceOwnerUserId, getPersonalIntelligenceSupabase } from "@/lib/personal-intelligence/supabase";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const EVENT_TYPES = ["sensitive_context_permission_granted", "sensitive_context_permission_denied"];

export async function GET(request: NextRequest) {
  try {
    const access = await getRequestAccessContext(request);
    if (!access || access.role !== "OWNER") {
      return NextResponse.json({ error: "Owner session required" }, { status: 401 });
    }

    const supabase = getPersonalIntelligenceSupabase();
    const ownerUserId = await getPersonalIntelligenceOwnerUserId(supabase);
    const { data, error } = await supabase.schema("mentor").from("audit_events")
      .select("id,session_id,event_type,resource_type,resource_id,details,created_at")
      .eq("owner_user_id", ownerUserId)
      .in("event_type", EVENT_TYPES)
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) throw new Error(error.message);

    return NextResponse.json({
      ok: true,
      events: data || [],
      writesPerformed: 0,
      principles: {
        sensitiveContentRecorded: false,
        hiddenChainOfThoughtExposed: false,
      },
    });
  } catch (error) {
    console.error("[Personal Intelligence Privacy Audit]", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Privacy audit failed" }, { status: 500 });
  }
}
