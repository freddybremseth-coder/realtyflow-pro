import { NextRequest, NextResponse } from "next/server";
import { getRequestAccessContext } from "@/lib/api-admin";
import { getPersonalIntelligenceOwnerUserId, getPersonalIntelligenceSupabase } from "@/lib/personal-intelligence/supabase";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest) {
  try {
    const access = await getRequestAccessContext(request);
    if (!access || access.role !== "OWNER") return NextResponse.json({ error: "Owner session required" }, { status: 401 });

    const supabase = getPersonalIntelligenceSupabase();
    const ownerUserId = await getPersonalIntelligenceOwnerUserId(supabase);

    const { data, error } = await supabase.schema("mentor").from("context_usage")
      .select("id,session_id,schema_name,resource_type,resource_id,context_reason,sensitivity,source_updated_at,confidence,used_at")
      .eq("owner_user_id", ownerUserId)
      .order("used_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);

    return NextResponse.json({
      ok: true,
      usage: data || [],
      writesPerformed: 0,
      principles: {
        readOnly: true,
        contextUsageIsAuditEvidence: true,
        noHiddenChainOfThought: true,
        sensitiveAccessMustBeJustified: true,
      },
    });
  } catch (error) {
    console.error("[Personal Intelligence context usage]", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Context usage review failed" }, { status: 500 });
  }
}
