import { NextRequest, NextResponse } from "next/server";
import { getRequestAccessContext } from "@/lib/api-admin";
import { askClaude } from "@/services/ai/claude-client";
import {
  getPersonalIntelligenceOwnerUserId,
  getPersonalIntelligenceSupabase,
  PERSONAL_INTELLIGENCE_OWNER_CANONICAL_NAME,
} from "@/lib/personal-intelligence/supabase";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function cleanJson(raw: string) {
  return raw.trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "").trim();
}

export async function POST(request: NextRequest) {
  try {
    const access = await getRequestAccessContext(request);
    if (!access || access.role !== "OWNER") return NextResponse.json({ error: "Owner session required" }, { status: 401 });
    const body = await request.json() as { decisionId?: string };
    if (!body.decisionId) return NextResponse.json({ error: "decisionId is required" }, { status: 400 });

    const supabase = getPersonalIntelligenceSupabase();
    const ownerUserId = await getPersonalIntelligenceOwnerUserId(supabase);
    const { data: subject } = await supabase.schema("personal_core").from("entities")
      .select("id").eq("owner_user_id", ownerUserId).eq("entity_type", "person")
      .eq("canonical_name", PERSONAL_INTELLIGENCE_OWNER_CANONICAL_NAME).single();
    if (!subject?.id) return NextResponse.json({ error: "Personal Intelligence owner is not bootstrapped" }, { status: 409 });

    const { data: decision, error } = await supabase.schema("mentor").from("decisions")
      .select("id,title,decision_type,description,deadline,reversibility,stakes,status,confidence,uncertainty_notes,premortem,scenario_notes")
      .eq("owner_user_id", ownerUserId).eq("subject_entity_id", subject.id).eq("id", body.decisionId).single();
    if (error || !decision?.id) return NextResponse.json({ error: "Decision not found" }, { status: 404 });

    const [optionsRes, assumptionsRes] = await Promise.all([
      supabase.schema("mentor").from("decision_options")
        .select("id,label,description,upside,downside,opportunity_cost,complexity_score,strategic_fit,life_fit,position")
        .eq("owner_user_id", ownerUserId).eq("decision_id", decision.id).order("position", { ascending: true }),
      supabase.schema("mentor").from("decision_assumptions")
        .select("id,statement,importance,confidence,testability,test_plan,status")
        .eq("owner_user_id", ownerUserId).eq("decision_id", decision.id).order("created_at", { ascending: true }),
    ]);
    if (optionsRes.error || assumptionsRes.error) {
      throw new Error(optionsRes.error?.message || assumptionsRes.error?.message || "Decision detail read failed");
    }

    const prompt = `Analyze this decision journal entry without making the decision for the owner.\n\nDECISION:\n${JSON.stringify(decision)}\n\nOPTIONS:\n${JSON.stringify(optionsRes.data || [])}\n\nASSUMPTIONS:\n${JSON.stringify(assumptionsRes.data || [])}\n\nReturn strict JSON with keys: framing, missingAlternatives (array), strongestCaseForEachOption (array of {option,case}), fragileAssumptions (array), opportunityCost, premortem, scenarios (array), recommendationType, recommendation, confidence, whatWouldChangeMind (array), nextEvidenceToGather (array). recommendationType must be one of go, no_go, pilot, delay, gather_evidence, undetermined. For strategic/life decisions prefer reversible experiments when uncertainty is material. Distinguish evidence from assumptions. Do not diagnose personality. Do not imply the owner must follow the recommendation.`;

    const raw = await askClaude(prompt, {
      model: decision.stakes === "high" || decision.stakes === "critical" || decision.decision_type === "life" ? "sonnet" : "haiku",
      systemPrompt: "You are a rigorous decision analyst. Improve decision quality, not compliance. Separate process quality from outcome. Surface assumptions, alternatives, reversibility, opportunity cost, base-rate gaps and disconfirming evidence. Never present a recommendation as an order.",
      maxTokens: 2600,
    });

    let analysis: Record<string, unknown>;
    try {
      analysis = JSON.parse(cleanJson(raw)) as Record<string, unknown>;
    } catch {
      analysis = {
        framing: raw,
        missingAlternatives: [],
        strongestCaseForEachOption: [],
        fragileAssumptions: [],
        opportunityCost: "",
        premortem: "",
        scenarios: [],
        recommendationType: "undetermined",
        recommendation: "",
        confidence: null,
        whatWouldChangeMind: [],
        nextEvidenceToGather: [],
      };
    }

    return NextResponse.json({
      ok: true,
      decisionId: String(decision.id),
      analysis,
      persisted: false,
      binding: false,
    });
  } catch (error) {
    console.error("[Personal Intelligence Decision Analyze]", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Decision analysis failed" }, { status: 500 });
  }
}
