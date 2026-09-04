import { NextRequest, NextResponse } from "next/server";
import { getRequestAccessContext } from "@/lib/api-admin";
import { getPersonalIntelligenceOwnerUserId, getPersonalIntelligenceSupabase, PERSONAL_INTELLIGENCE_OWNER_CANONICAL_NAME } from "@/lib/personal-intelligence/supabase";

const ACTION_STATUSES = new Set(["idea", "considering", "committed", "scheduled", "in_progress", "done", "dropped"]);

async function requireOwner(request: NextRequest) {
  const access = await getRequestAccessContext(request);
  if (!access || access.role !== "OWNER") return null;
  const supabase = getPersonalIntelligenceSupabase();
  const ownerUserId = await getPersonalIntelligenceOwnerUserId(supabase);
  const { data: subject } = await supabase.schema("personal_core").from("entities")
    .select("id")
    .eq("owner_user_id", ownerUserId)
    .eq("entity_type", "person")
    .eq("canonical_name", PERSONAL_INTELLIGENCE_OWNER_CANONICAL_NAME)
    .single();
  if (!subject?.id) throw new Error("Personal Intelligence owner is not bootstrapped");
  return { supabase, ownerUserId, subjectEntityId: String(subject.id) };
}

export async function GET(request: NextRequest) {
  try {
    const context = await requireOwner(request);
    if (!context) return NextResponse.json({ error: "Owner session required" }, { status: 401 });
    const { supabase, ownerUserId, subjectEntityId } = context;
    const [goalsResult, actionsResult] = await Promise.all([
      supabase.schema("personal_core").from("goals")
        .select("id,title,description,domain,priority,status,target_date,why_it_matters,success_definition,privacy_level,created_at,updated_at")
        .eq("owner_user_id", ownerUserId).eq("subject_entity_id", subjectEntityId)
        .order("priority", { ascending: false }).limit(100),
      supabase.schema("mentor").from("actions")
        .select("id,title,description,action_type,commitment_status,priority,scheduled_at,related_goal_id,completed_at,outcome,friction_reason,created_at,updated_at")
        .eq("owner_user_id", ownerUserId).eq("subject_entity_id", subjectEntityId)
        .order("priority", { ascending: false }).limit(200),
    ]);
    if (goalsResult.error) throw new Error(goalsResult.error.message);
    if (actionsResult.error) throw new Error(actionsResult.error.message);
    const goals = goalsResult.data || [];
    const actions = actionsResult.data || [];
    return NextResponse.json({
      ok: true,
      goals,
      actions,
      summary: {
        goalIdeas: goals.filter((goal) => ["idea", "unclear"].includes(String(goal.status))).length,
        activeGoals: goals.filter((goal) => goal.status === "active").length,
        actionIdeas: actions.filter((action) => action.commitment_status === "idea").length,
        considering: actions.filter((action) => action.commitment_status === "considering").length,
        committed: actions.filter((action) => ["committed", "scheduled", "in_progress"].includes(String(action.commitment_status))).length,
      },
      principles: { ideaIsNotCommitment: true, activeGoalIsDirectionNotExecution: true, statusChangesRequireExplicitOwnerAction: true },
      writesPerformed: 0,
    });
  } catch (error) {
    console.error("[Personal Intelligence Commitments GET]", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Commitments review failed" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const context = await requireOwner(request);
    if (!context) return NextResponse.json({ error: "Owner session required" }, { status: 401 });
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const actionId = typeof body.actionId === "string" ? body.actionId.trim() : "";
    const commitmentStatus = typeof body.commitmentStatus === "string" ? body.commitmentStatus.trim() : "";
    if (!actionId || !ACTION_STATUSES.has(commitmentStatus)) return NextResponse.json({ error: "Valid actionId and commitmentStatus are required" }, { status: 400 });
    const { supabase, ownerUserId, subjectEntityId } = context;
    const { data, error } = await supabase.schema("mentor").from("actions")
      .update({ commitment_status: commitmentStatus })
      .eq("id", actionId).eq("owner_user_id", ownerUserId).eq("subject_entity_id", subjectEntityId)
      .select("id,commitment_status,updated_at").maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return NextResponse.json({ error: "Action not found for owner" }, { status: 404 });
    return NextResponse.json({ ok: true, action: data, explicitOwnerAction: true });
  } catch (error) {
    console.error("[Personal Intelligence Commitments PATCH]", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Commitment update failed" }, { status: 500 });
  }
}
