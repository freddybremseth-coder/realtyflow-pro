import { NextRequest, NextResponse } from "next/server";
import { getRequestAccessContext } from "@/lib/api-admin";
import { getPersonalIntelligenceOwnerUserId, getPersonalIntelligenceSupabase } from "@/lib/personal-intelligence/supabase";

export async function POST(request: NextRequest) {
  try {
    const access = await getRequestAccessContext(request);
    if (!access || access.role !== "OWNER") return NextResponse.json({ error: "Owner session required" }, { status: 401 });
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const claimId = typeof body.claimId === "string" ? body.claimId.trim() : "";
    if (!claimId) return NextResponse.json({ error: "claimId is required" }, { status: 400 });

    const supabase = getPersonalIntelligenceSupabase();
    const ownerUserId = await getPersonalIntelligenceOwnerUserId(supabase);
    const { data: claim, error: claimError } = await supabase.schema("personal_core").from("claims")
      .select("id,status,predicate,value_text,privacy_level")
      .eq("owner_user_id", ownerUserId).eq("id", claimId).single();
    if (claimError || !claim?.id) return NextResponse.json({ error: "Claim not found" }, { status: 404 });
    if (["superseded", "expired", "rejected"].includes(String(claim.status))) {
      return NextResponse.json({ ok: true, claimId, status: claim.status, changed: false });
    }

    const { data: updated, error: updateError } = await supabase.schema("personal_core").from("claims")
      .update({ status: "rejected" }).eq("owner_user_id", ownerUserId).eq("id", claimId)
      .select("id,status").single();
    if (updateError || !updated?.id) throw new Error(`Claim rejection failed: ${updateError?.message || "missing claim"}`);

    const { error: auditError } = await supabase.schema("mentor").from("audit_events").insert({
      owner_user_id: ownerUserId,
      event_type: "personal_memory_rejected_by_owner",
      resource_schema: "personal_core",
      resource_type: "claim",
      resource_id: claimId,
      details: {
        prior_status: claim.status,
        predicate: claim.predicate,
        privacy_level: claim.privacy_level,
      },
    });
    if (auditError) {
      const { error: rollbackError } = await supabase.schema("personal_core").from("claims")
        .update({ status: claim.status }).eq("owner_user_id", ownerUserId).eq("id", claimId);
      if (rollbackError) throw new Error(`Claim audit failed and rollback failed: ${auditError.message}; ${rollbackError.message}`);
      throw new Error(`Claim audit failed: ${auditError.message}`);
    }

    return NextResponse.json({ ok: true, claimId, status: "rejected", changed: true });
  } catch (error) {
    console.error("[Personal Intelligence Memory Reject]", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Memory rejection failed" }, { status: 500 });
  }
}
