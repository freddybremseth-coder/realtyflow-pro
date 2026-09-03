import { NextRequest, NextResponse } from "next/server";
import { getRequestAccessContext } from "@/lib/api-admin";
import {
  getPersonalIntelligenceOwnerUserId,
  getPersonalIntelligenceSupabase,
  PERSONAL_INTELLIGENCE_OWNER_CANONICAL_NAME,
} from "@/lib/personal-intelligence/supabase";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function score(value: unknown) {
  if (value == null || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > 1) return null;
  return n;
}

export async function POST(request: NextRequest) {
  try {
    const access = await getRequestAccessContext(request);
    if (!access || access.role !== "OWNER") return NextResponse.json({ error: "Owner session required" }, { status: 401 });
    const body = await request.json() as Record<string, unknown>;
    const decisionId = typeof body.decisionId === "string" ? body.decisionId : "";
    if (!decisionId) return NextResponse.json({ error: "decisionId is required" }, { status: 400 });

    const supabase = getPersonalIntelligenceSupabase();
    const ownerUserId = await getPersonalIntelligenceOwnerUserId(supabase);
    const { data: subject } = await supabase.schema("personal_core").from("entities")
      .select("id").eq("owner_user_id", ownerUserId).eq("entity_type", "person")
      .eq("canonical_name", PERSONAL_INTELLIGENCE_OWNER_CANONICAL_NAME).single();
    if (!subject?.id) return NextResponse.json({ error: "Personal Intelligence owner is not bootstrapped" }, { status: 409 });

    const { data: decision } = await supabase.schema("mentor").from("decisions")
      .select("id,status,chosen_option_id").eq("owner_user_id", ownerUserId).eq("subject_entity_id", subject.id).eq("id", decisionId).single();
    if (!decision?.id) return NextResponse.json({ error: "Decision not found" }, { status: 404 });
    if (!decision.chosen_option_id) return NextResponse.json({ error: "Choose an option before reviewing the outcome" }, { status: 409 });

    const actualOutcome = typeof body.actualOutcome === "string" ? body.actualOutcome.trim() : "";
    if (actualOutcome.length < 10) return NextResponse.json({ error: "A substantive actualOutcome is required" }, { status: 400 });

    const decisionQuality = score(body.decisionQuality);
    const outcomeQuality = score(body.outcomeQuality);
    const luckFactor = score(body.luckFactor);
    const { data: outcome, error } = await supabase.schema("mentor").from("decision_outcomes").insert({
      owner_user_id: ownerUserId,
      decision_id: decision.id,
      review_date: typeof body.reviewDate === "string" && body.reviewDate ? body.reviewDate : new Date().toISOString(),
      actual_outcome: actualOutcome,
      decision_quality: decisionQuality,
      outcome_quality: outcomeQuality,
      luck_factor: luckFactor,
      lesson: typeof body.lesson === "string" ? body.lesson.trim() || null : null,
      belief_update: typeof body.beliefUpdate === "string" ? body.beliefUpdate.trim() || null : null,
    }).select("id,decision_id,review_date,actual_outcome,decision_quality,outcome_quality,luck_factor,lesson,belief_update").single();
    if (error || !outcome) throw new Error(`Outcome review failed: ${error?.message || "missing outcome"}`);

    const { error: statusError } = await supabase.schema("mentor").from("decisions").update({ status: "reviewed" })
      .eq("owner_user_id", ownerUserId).eq("id", decision.id);
    if (statusError) throw new Error(`Decision review status failed: ${statusError.message}`);

    return NextResponse.json({ ok: true, outcome });
  } catch (error) {
    console.error("[Personal Intelligence Decision Outcome]", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Outcome review failed" }, { status: 500 });
  }
}
