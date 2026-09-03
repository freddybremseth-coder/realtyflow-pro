import { NextRequest, NextResponse } from "next/server";
import { getRequestAccessContext } from "@/lib/api-admin";
import {
  getPersonalIntelligenceOwnerUserId,
  getPersonalIntelligenceSupabase,
  PERSONAL_INTELLIGENCE_OWNER_CANONICAL_NAME,
} from "@/lib/personal-intelligence/supabase";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function periodFromBody(body: Record<string, unknown>) {
  const end = typeof body.periodEnd === "string" ? new Date(body.periodEnd) : new Date();
  const start = typeof body.periodStart === "string" ? new Date(body.periodStart) : new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= start) throw new Error("Invalid review period");
  if (end.getTime() - start.getTime() > 31 * 24 * 60 * 60 * 1000) throw new Error("Review period cannot exceed 31 days");
  return { start, end };
}

function joinTitles(items: Array<{ title?: string | null }>, limit = 5) {
  return items.slice(0, limit).map((item) => item.title).filter(Boolean).join("; ");
}

export async function GET(request: NextRequest) {
  try {
    const access = await getRequestAccessContext(request);
    if (!access || access.role !== "OWNER") return NextResponse.json({ error: "Owner session required" }, { status: 401 });
    const supabase = getPersonalIntelligenceSupabase();
    const ownerUserId = await getPersonalIntelligenceOwnerUserId(supabase);
    const { data: subject } = await supabase.schema("personal_core").from("entities").select("id")
      .eq("owner_user_id", ownerUserId).eq("entity_type", "person").eq("canonical_name", PERSONAL_INTELLIGENCE_OWNER_CANONICAL_NAME).single();
    if (!subject?.id) return NextResponse.json({ error: "Personal Intelligence owner is not bootstrapped" }, { status: 409 });
    const { data, error } = await supabase.schema("mentor").from("reviews")
      .select("id,review_type,period_start,period_end,status,summary,progress_summary,friction_summary,learning_summary,decision_summary,trajectory_summary,recommendation,confidence,generated_by,presented_at,accepted_at,created_at")
      .eq("owner_user_id", ownerUserId).eq("subject_entity_id", subject.id).eq("review_type", "weekly")
      .order("period_end", { ascending: false }).limit(12);
    if (error) throw error;
    return NextResponse.json({ ok: true, reviews: data || [] });
  } catch (error) {
    console.error("[Personal Intelligence Weekly Review GET]", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Weekly review failed" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const access = await getRequestAccessContext(request);
    if (!access || access.role !== "OWNER") return NextResponse.json({ error: "Owner session required" }, { status: 401 });
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const { start, end } = periodFromBody(body);
    const startIso = start.toISOString();
    const endIso = end.toISOString();
    const supabase = getPersonalIntelligenceSupabase();
    const ownerUserId = await getPersonalIntelligenceOwnerUserId(supabase);
    const { data: subject } = await supabase.schema("personal_core").from("entities").select("id")
      .eq("owner_user_id", ownerUserId).eq("entity_type", "person").eq("canonical_name", PERSONAL_INTELLIGENCE_OWNER_CANONICAL_NAME).single();
    if (!subject?.id) return NextResponse.json({ error: "Personal Intelligence owner is not bootstrapped" }, { status: 409 });

    const [actionsR, learningR, decisionsR, outcomesR, sessionsR, goalsR, observationsR] = await Promise.all([
      supabase.schema("mentor").from("actions").select("id,title,commitment_status,priority,completed_at,outcome,friction_reason,created_at,updated_at")
        .eq("owner_user_id", ownerUserId).eq("subject_entity_id", subject.id).gte("updated_at", startIso).lt("updated_at", endIso).limit(100),
      supabase.schema("learning").from("sessions").select("id,topic_id,completion_status,difficulty,engagement_signal,friction_signal,started_at,ended_at")
        .eq("owner_user_id", ownerUserId).eq("subject_entity_id", subject.id).gte("started_at", startIso).lt("started_at", endIso).limit(100),
      supabase.schema("mentor").from("decisions").select("id,title,status,decision_type,reversibility,stakes,confidence,created_at,decided_at")
        .eq("owner_user_id", ownerUserId).eq("subject_entity_id", subject.id).gte("created_at", startIso).lt("created_at", endIso).limit(100),
      supabase.schema("mentor").from("decision_outcomes").select("id,decision_id,decision_quality,outcome_quality,luck_factor,lesson,review_date")
        .eq("owner_user_id", ownerUserId).gte("review_date", startIso).lt("review_date", endIso).limit(100),
      supabase.schema("mentor").from("sessions").select("id,session_type,input_mode,started_at,ended_at")
        .eq("owner_user_id", ownerUserId).eq("subject_entity_id", subject.id).gte("started_at", startIso).lt("started_at", endIso).limit(200),
      supabase.schema("personal_core").from("goals").select("id,title,status,priority,domain,updated_at")
        .eq("owner_user_id", ownerUserId).eq("subject_entity_id", subject.id).eq("status", "active").limit(50),
      supabase.schema("mentor").from("observations").select("id,observation,status,confidence,created_at")
        .eq("owner_user_id", ownerUserId).eq("subject_entity_id", subject.id).gte("created_at", startIso).lt("created_at", endIso).limit(100),
    ]);
    for (const result of [actionsR, learningR, decisionsR, outcomesR, sessionsR, goalsR, observationsR]) if (result.error) throw result.error;

    const actions = actionsR.data || [];
    const learning = learningR.data || [];
    const decisions = decisionsR.data || [];
    const outcomes = outcomesR.data || [];
    const sessions = sessionsR.data || [];
    const goals = goalsR.data || [];
    const observations = observationsR.data || [];
    const completedActions = actions.filter((item) => item.commitment_status === "done");
    const droppedActions = actions.filter((item) => item.commitment_status === "dropped");
    const frictionActions = actions.filter((item) => Boolean(item.friction_reason));
    const completedLearning = learning.filter((item) => item.completion_status === "completed");
    const decided = decisions.filter((item) => item.status === "decided" || item.decided_at);
    const evidenceCount = actions.length + learning.length + decisions.length + outcomes.length + sessions.length + observations.length;

    if (evidenceCount === 0) {
      return NextResponse.json({ ok: true, generated: false, reason: "No Personal Intelligence evidence exists in this review window.", periodStart: startIso, periodEnd: endIso });
    }

    const evidenceSnapshot = {
      actions: { total: actions.length, completed: completedActions.length, dropped: droppedActions.length, friction: frictionActions.length, completedTitles: completedActions.slice(0, 10).map((x) => x.title) },
      learning: { total: learning.length, completed: completedLearning.length },
      decisions: { total: decisions.length, decided: decided.length, outcomeReviews: outcomes.length },
      mentor: { sessions: sessions.length, observations: observations.length },
      goals: { active: goals.length, titles: goals.slice(0, 10).map((x) => x.title) },
    };

    const progressSummary = completedActions.length
      ? `${completedActions.length} committed action${completedActions.length === 1 ? "" : "s"} reached done: ${joinTitles(completedActions)}.`
      : "No committed Personal Intelligence actions were completed in this period.";
    const frictionSummary = frictionActions.length
      ? `${frictionActions.length} action${frictionActions.length === 1 ? "" : "s"} recorded friction. Review the stated friction reasons before retrying the same intervention.`
      : droppedActions.length ? `${droppedActions.length} action${droppedActions.length === 1 ? "" : "s"} were dropped; no explicit friction reason was recorded for the summary.` : "No explicit action friction was recorded in this period.";
    const learningSummary = learning.length
      ? `${completedLearning.length} of ${learning.length} learning session${learning.length === 1 ? "" : "s"} were completed. This is activity evidence, not proof of mastery.`
      : "No Personal Intelligence learning sessions were recorded in this period.";
    const decisionSummary = decisions.length
      ? `${decisions.length} decision journal entr${decisions.length === 1 ? "y" : "ies"} were created; ${decided.length} reached an explicit decision and ${outcomes.length} outcome review${outcomes.length === 1 ? "" : "s"} were recorded.`
      : "No Decision Journal entries were created in this period.";
    const trajectorySummary = goals.length
      ? `${goals.length} active goal${goals.length === 1 ? "" : "s"} are currently recorded. This review does not infer life trajectory from activity volume alone.`
      : "No active Personal Intelligence goals are recorded, so this review does not infer trajectory.";
    const recommendation = frictionActions.length
      ? "Use the next review/action session to diagnose the recorded friction before adding more commitments."
      : goals.length === 0 ? "Consider confirming one active goal before asking Personal Intelligence to judge direction or alignment." : "Keep the next week focused: choose one meaningful commitment linked to an active goal and preserve room for learning/reflection.";
    const summary = `${progressSummary} ${learningSummary} ${decisionSummary}`;
    const confidence = Math.min(0.95, 0.35 + Math.min(evidenceCount, 12) * 0.05);

    const { data: review, error: insertError } = await supabase.schema("mentor").from("reviews").insert({
      owner_user_id: ownerUserId,
      subject_entity_id: subject.id,
      review_type: "weekly",
      period_start: startIso,
      period_end: endIso,
      status: "presented",
      source_window: { period_start: startIso, period_end: endIso, sources: ["mentor.actions", "learning.sessions", "mentor.decisions", "mentor.decision_outcomes", "mentor.sessions", "personal_core.goals", "mentor.observations"] },
      evidence_snapshot: evidenceSnapshot,
      summary,
      progress_summary: progressSummary,
      friction_summary: frictionSummary,
      learning_summary: learningSummary,
      decision_summary: decisionSummary,
      trajectory_summary: trajectorySummary,
      recommendation,
      confidence,
      generated_by: "system",
      presented_at: new Date().toISOString(),
    }).select("id,review_type,period_start,period_end,status,summary,progress_summary,friction_summary,learning_summary,decision_summary,trajectory_summary,recommendation,confidence,presented_at,created_at").single();
    if (insertError || !review) {
      if (insertError?.code === "23505") return NextResponse.json({ error: "A weekly review already exists for this exact period." }, { status: 409 });
      throw new Error(insertError?.message || "Weekly review insert failed");
    }
    return NextResponse.json({ ok: true, generated: true, review, evidence: evidenceSnapshot });
  } catch (error) {
    console.error("[Personal Intelligence Weekly Review POST]", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Weekly review generation failed" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const access = await getRequestAccessContext(request);
    if (!access || access.role !== "OWNER") return NextResponse.json({ error: "Owner session required" }, { status: 401 });
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const reviewId = typeof body.reviewId === "string" ? body.reviewId : "";
    if (!reviewId) return NextResponse.json({ error: "reviewId is required" }, { status: 400 });
    const supabase = getPersonalIntelligenceSupabase();
    const ownerUserId = await getPersonalIntelligenceOwnerUserId(supabase);
    const { data, error } = await supabase.schema("mentor").from("reviews").update({ status: "accepted", accepted_at: new Date().toISOString() })
      .eq("owner_user_id", ownerUserId).eq("id", reviewId).eq("review_type", "weekly")
      .select("id,status,accepted_at").single();
    if (error || !data) return NextResponse.json({ error: "Weekly review not found" }, { status: 404 });
    return NextResponse.json({ ok: true, review: data });
  } catch (error) {
    console.error("[Personal Intelligence Weekly Review PATCH]", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Weekly review acceptance failed" }, { status: 500 });
  }
}
