import { NextRequest, NextResponse } from "next/server";
import { getRequestAccessContext } from "@/lib/api-admin";
import {
  getPersonalIntelligenceOwnerUserId,
  getPersonalIntelligenceSupabase,
  PERSONAL_INTELLIGENCE_OWNER_CANONICAL_NAME,
} from "@/lib/personal-intelligence/supabase";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(request: NextRequest) {
  try {
    const access = await getRequestAccessContext(request);
    if (!access || access.role !== "OWNER") return NextResponse.json({ error: "Owner session required" }, { status: 401 });
    const body = await request.json() as { decisionId?: string; optionId?: string; confidence?: number | null };
    if (!body.decisionId || !body.optionId) return NextResponse.json({ error: "decisionId and optionId are required" }, { status: 400 });

    const supabase = getPersonalIntelligenceSupabase();
    const ownerUserId = await getPersonalIntelligenceOwnerUserId(supabase);
    const { data: subject } = await supabase.schema("personal_core").from("entities")
      .select("id").eq("owner_user_id", ownerUserId).eq("entity_type", "person")
      .eq("canonical_name", PERSONAL_INTELLIGENCE_OWNER_CANONICAL_NAME).single();
    if (!subject?.id) return NextResponse.json({ error: "Personal Intelligence owner is not bootstrapped" }, { status: 409 });

    const { data: decision } = await supabase.schema("mentor").from("decisions")
      .select("id,status").eq("owner_user_id", ownerUserId).eq("subject_entity_id", subject.id).eq("id", body.decisionId).single();
    if (!decision?.id) return NextResponse.json({ error: "Decision not found" }, { status: 404 });

    const { data: option } = await supabase.schema("mentor").from("decision_options")
      .select("id,decision_id,label").eq("owner_user_id", ownerUserId).eq("decision_id", decision.id).eq("id", body.optionId).single();
    if (!option?.id) return NextResponse.json({ error: "Decision option not found" }, { status: 404 });

    const confidence = body.confidence == null ? null : Number(body.confidence);
    if (confidence != null && (!Number.isFinite(confidence) || confidence < 0 || confidence > 1)) {
      return NextResponse.json({ error: "confidence must be between 0 and 1" }, { status: 400 });
    }

    const { data: updated, error } = await supabase.schema("mentor").from("decisions").update({
      chosen_option_id: option.id,
      status: "decided",
      confidence,
      decided_at: new Date().toISOString(),
    }).eq("owner_user_id", ownerUserId).eq("id", decision.id)
      .select("id,title,status,chosen_option_id,confidence,decided_at").single();
    if (error || !updated) throw new Error(`Decision choice failed: ${error?.message || "missing decision"}`);

    return NextResponse.json({ ok: true, decision: updated, chosenOption: { id: String(option.id), label: String(option.label) } });
  } catch (error) {
    console.error("[Personal Intelligence Decision Choose]", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Decision choice failed" }, { status: 500 });
  }
}
