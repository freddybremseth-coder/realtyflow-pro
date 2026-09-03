import { NextRequest, NextResponse } from "next/server";
import { getRequestAccessContext } from "@/lib/api-admin";
import {
  getPersonalIntelligenceOwnerUserId,
  getPersonalIntelligenceSupabase,
  PERSONAL_INTELLIGENCE_OWNER_CANONICAL_NAME,
} from "@/lib/personal-intelligence/supabase";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const DECISION_TYPES = new Set(["trivial", "operational", "strategic", "life"]);
const REVERSIBILITY = new Set(["one_way", "two_way", "mixed", "unknown"]);
const STAKES = new Set(["low", "medium", "high", "critical"]);
const TESTABILITY = new Set(["testable", "partly_testable", "not_testable", "unknown"]);

type OptionInput = {
  label?: string;
  description?: string;
  upside?: string;
  downside?: string;
  opportunityCost?: string;
  complexity?: number | null;
  strategicFit?: number | null;
  lifeFit?: number | null;
};

type AssumptionInput = {
  statement?: string;
  importance?: number | null;
  confidence?: number | null;
  testability?: string;
  testPlan?: string;
};

function bounded01(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > 1) return null;
  return n;
}

async function ownerContext(request: NextRequest) {
  const access = await getRequestAccessContext(request);
  if (!access || access.role !== "OWNER") return null;
  const supabase = getPersonalIntelligenceSupabase();
  const ownerUserId = await getPersonalIntelligenceOwnerUserId(supabase);
  const { data: subject } = await supabase.schema("personal_core").from("entities")
    .select("id").eq("owner_user_id", ownerUserId).eq("entity_type", "person")
    .eq("canonical_name", PERSONAL_INTELLIGENCE_OWNER_CANONICAL_NAME).single();
  if (!subject?.id) throw new Error("Personal Intelligence owner is not bootstrapped");
  return { supabase, ownerUserId, subjectEntityId: String(subject.id) };
}

export async function GET(request: NextRequest) {
  try {
    const context = await ownerContext(request);
    if (!context) return NextResponse.json({ error: "Owner session required" }, { status: 401 });
    const { supabase, ownerUserId, subjectEntityId } = context;

    const { data: decisions, error } = await supabase.schema("mentor").from("decisions")
      .select("id,title,decision_type,description,deadline,reversibility,stakes,status,confidence,chosen_option_id,uncertainty_notes,premortem,scenario_notes,decided_at,created_at,updated_at")
      .eq("owner_user_id", ownerUserId).eq("subject_entity_id", subjectEntityId)
      .order("updated_at", { ascending: false }).limit(100);
    if (error) throw new Error(`Decision Journal read failed: ${error.message}`);

    const ids = (decisions || []).map((decision) => String(decision.id));
    if (!ids.length) return NextResponse.json({ ok: true, decisions: [] });

    const [optionsRes, assumptionsRes, outcomesRes] = await Promise.all([
      supabase.schema("mentor").from("decision_options")
        .select("id,decision_id,label,description,upside,downside,opportunity_cost,complexity_score,strategic_fit,life_fit,position")
        .eq("owner_user_id", ownerUserId).in("decision_id", ids).order("position", { ascending: true }),
      supabase.schema("mentor").from("decision_assumptions")
        .select("id,decision_id,statement,importance,confidence,testability,test_plan,status,created_at")
        .eq("owner_user_id", ownerUserId).in("decision_id", ids).order("created_at", { ascending: true }),
      supabase.schema("mentor").from("decision_outcomes")
        .select("id,decision_id,review_date,actual_outcome,decision_quality,outcome_quality,luck_factor,lesson,belief_update")
        .eq("owner_user_id", ownerUserId).in("decision_id", ids).order("review_date", { ascending: false }),
    ]);
    for (const result of [optionsRes, assumptionsRes, outcomesRes]) {
      if (result.error) throw new Error(`Decision Journal detail read failed: ${result.error.message}`);
    }

    const enriched = (decisions || []).map((decision) => ({
      ...decision,
      options: (optionsRes.data || []).filter((row) => String(row.decision_id) === String(decision.id)),
      assumptions: (assumptionsRes.data || []).filter((row) => String(row.decision_id) === String(decision.id)),
      outcomes: (outcomesRes.data || []).filter((row) => String(row.decision_id) === String(decision.id)),
    }));

    return NextResponse.json({ ok: true, decisions: enriched });
  } catch (error) {
    console.error("[Personal Intelligence Decisions GET]", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Decision Journal read failed" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const context = await ownerContext(request);
    if (!context) return NextResponse.json({ error: "Owner session required" }, { status: 401 });
    const { supabase, ownerUserId, subjectEntityId } = context;
    const body = await request.json() as Record<string, unknown>;

    const title = typeof body.title === "string" ? body.title.trim() : "";
    const description = typeof body.description === "string" ? body.description.trim() : "";
    const decisionType = typeof body.decisionType === "string" && DECISION_TYPES.has(body.decisionType) ? body.decisionType : "operational";
    const reversibility = typeof body.reversibility === "string" && REVERSIBILITY.has(body.reversibility) ? body.reversibility : "unknown";
    const stakes = typeof body.stakes === "string" && STAKES.has(body.stakes) ? body.stakes : "medium";
    const options = Array.isArray(body.options) ? (body.options as OptionInput[]).slice(0, 8) : [];
    const assumptions = Array.isArray(body.assumptions) ? (body.assumptions as AssumptionInput[]).slice(0, 12) : [];

    if (title.length < 4) return NextResponse.json({ error: "A substantive decision title is required" }, { status: 400 });
    const validOptions = options.filter((option) => typeof option?.label === "string" && option.label.trim().length > 0);
    if ((decisionType === "strategic" || decisionType === "life") && validOptions.length < 2) {
      return NextResponse.json({ error: "Strategic and life decisions require at least two explicit alternatives" }, { status: 400 });
    }

    const { data: decision, error: decisionError } = await supabase.schema("mentor").from("decisions").insert({
      owner_user_id: ownerUserId,
      subject_entity_id: subjectEntityId,
      title,
      decision_type: decisionType,
      description: description || null,
      deadline: typeof body.deadline === "string" && body.deadline ? body.deadline : null,
      reversibility,
      stakes,
      status: "open",
      confidence: bounded01(body.confidence),
      uncertainty_notes: typeof body.uncertaintyNotes === "string" ? body.uncertaintyNotes.trim() || null : null,
      premortem: typeof body.premortem === "string" ? body.premortem.trim() || null : null,
      scenario_notes: typeof body.scenarioNotes === "string" ? body.scenarioNotes.trim() || null : null,
      context_snapshot: { captured_at: new Date().toISOString(), source: "owner_decision_journal" },
      evidence_snapshot: [],
    }).select("id,title,decision_type,reversibility,stakes,status,confidence,created_at").single();
    if (decisionError || !decision?.id) throw new Error(`Decision create failed: ${decisionError?.message || "missing decision"}`);

    const decisionId = String(decision.id);
    try {
      if (validOptions.length) {
        const { error: optionsError } = await supabase.schema("mentor").from("decision_options").insert(validOptions.map((option, index) => ({
          owner_user_id: ownerUserId,
          decision_id: decisionId,
          label: option.label!.trim(),
          description: option.description?.trim() || null,
          upside: option.upside?.trim() || null,
          downside: option.downside?.trim() || null,
          opportunity_cost: option.opportunityCost?.trim() || null,
          complexity_score: bounded01(option.complexity),
          strategic_fit: bounded01(option.strategicFit),
          life_fit: bounded01(option.lifeFit),
          position: index,
        })));
        if (optionsError) throw new Error(`Decision options create failed: ${optionsError.message}`);
      }

      const validAssumptions = assumptions.filter((assumption) => typeof assumption?.statement === "string" && assumption.statement.trim().length > 0);
      if (validAssumptions.length) {
        const { error: assumptionsError } = await supabase.schema("mentor").from("decision_assumptions").insert(validAssumptions.map((assumption) => ({
          owner_user_id: ownerUserId,
          decision_id: decisionId,
          statement: assumption.statement!.trim(),
          importance: bounded01(assumption.importance),
          confidence: bounded01(assumption.confidence),
          testability: typeof assumption.testability === "string" && TESTABILITY.has(assumption.testability) ? assumption.testability : "unknown",
          test_plan: assumption.testPlan?.trim() || null,
        })));
        if (assumptionsError) throw new Error(`Decision assumptions create failed: ${assumptionsError.message}`);
      }
    } catch (childError) {
      await supabase.schema("mentor").from("decisions").delete().eq("owner_user_id", ownerUserId).eq("id", decisionId);
      throw childError;
    }

    return NextResponse.json({ ok: true, decision }, { status: 201 });
  } catch (error) {
    console.error("[Personal Intelligence Decisions POST]", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Decision create failed" }, { status: 500 });
  }
}
