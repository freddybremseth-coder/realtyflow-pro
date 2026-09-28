import { NextRequest, NextResponse } from "next/server";
import {
  getPersonalIntelligenceOwnerUserId,
  getPersonalIntelligenceSupabase,
} from "@/lib/personal-intelligence/supabase";
import { verifySpanishBridgeToken } from "@/lib/personal-intelligence/spanish-learning";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const ALLOWED_ORIGIN = "https://spanish.chatgenius.pro";

function corsHeaders(origin: string | null) {
  const allowOrigin = origin === ALLOWED_ORIGIN ? ALLOWED_ORIGIN : ALLOWED_ORIGIN;
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
    "Cache-Control": "no-store",
    Vary: "Origin",
  };
}

function clampOptional(value: unknown): number | null {
  if (value == null || value === "") return null;
  const raw = Number(value);
  if (!Number.isFinite(raw)) return null;
  const normalized = raw > 1 && raw <= 100 ? raw / 100 : raw;
  return Math.max(0, Math.min(1, normalized));
}

function addDaysIso(days: number) {
  return new Date(Date.now() + days * 86_400_000).toISOString();
}

function blend(previous: number | null | undefined, current: number, weight = 0.25) {
  if (previous == null || !Number.isFinite(Number(previous))) return current;
  return Math.max(0, Math.min(1, Number(previous) * (1 - weight) + current * weight));
}

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(request.headers.get("origin")) });
}

export async function POST(request: NextRequest) {
  const headers = corsHeaders(request.headers.get("origin"));
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
    const token = typeof body.token === "string" ? body.token.trim() : bearer || "";
    const payload = verifySpanishBridgeToken(token);
    if (!payload) return NextResponse.json({ error: "Invalid or expired Spanish bridge token" }, { status: 401, headers });

    const supabase = getPersonalIntelligenceSupabase();
    const canonicalOwnerUserId = await getPersonalIntelligenceOwnerUserId(supabase);
    if (payload.ownerUserId !== canonicalOwnerUserId) {
      return NextResponse.json({ error: "Spanish bridge owner mismatch" }, { status: 403, headers });
    }

    const { data: session, error: sessionError } = await supabase.schema("learning").from("sessions")
      .select("id,topic_id,subject_entity_id,completion_status")
      .eq("owner_user_id", payload.ownerUserId)
      .eq("id", payload.sessionId)
      .maybeSingle();
    if (sessionError) throw new Error(`Spanish session lookup failed: ${sessionError.message}`);
    if (!session?.id || String(session.subject_entity_id) !== payload.subjectEntityId || String(session.topic_id) !== payload.topicId) {
      return NextResponse.json({ error: "Spanish learning session mismatch" }, { status: 404, headers });
    }

    if (session.completion_status === "completed") {
      const { data: existingAssessment, error: existingAssessmentError } = await supabase.schema("learning").from("assessments")
        .select("id,score,feedback")
        .eq("owner_user_id", payload.ownerUserId)
        .eq("session_id", payload.sessionId)
        .eq("assessment_type", "spanish_chatgenius_micro_session")
        .maybeSingle();
      if (existingAssessmentError) throw new Error(`Spanish assessment lookup failed: ${existingAssessmentError.message}`);
      if (existingAssessment?.id) {
        return NextResponse.json({
          ok: true,
          recorded: "already_completed",
          sessionId: payload.sessionId,
          topicId: payload.topicId,
          score: existingAssessment.score,
        }, { headers });
      }
    }

    const completed = body.completed !== false;
    const score = clampOptional(body.score);
    const difficulty = clampOptional(body.difficulty);
    const engagement = clampOptional(body.engagement);
    const friction = clampOptional(body.friction);
    const activityType = typeof body.activityType === "string" ? body.activityType.trim().slice(0, 120) : "daily5";
    const feedback = typeof body.feedback === "string" ? body.feedback.trim().slice(0, 4000) : null;
    const learnerResponse = typeof body.learnerResponse === "string" ? body.learnerResponse.trim().slice(0, 8000) : null;

    const { error: sessionUpdateError } = await supabase.schema("learning").from("sessions").update({
      completion_status: completed ? "completed" : "paused",
      ended_at: completed ? new Date().toISOString() : null,
      difficulty,
      engagement_signal: engagement,
      friction_signal: friction,
    }).eq("owner_user_id", payload.ownerUserId).eq("id", payload.sessionId);
    if (sessionUpdateError) throw new Error(`Spanish session update failed: ${sessionUpdateError.message}`);

    if (!completed) {
      return NextResponse.json({ ok: true, recorded: "paused" }, { headers });
    }

    let assessmentId: string | null = null;
    const { data: existingAssessment, error: assessmentLookupError } = await supabase.schema("learning").from("assessments")
      .select("id")
      .eq("owner_user_id", payload.ownerUserId)
      .eq("session_id", payload.sessionId)
      .eq("assessment_type", "spanish_chatgenius_micro_session")
      .maybeSingle();
    if (assessmentLookupError) throw new Error(`Spanish assessment lookup failed: ${assessmentLookupError.message}`);

    if (existingAssessment?.id) {
      assessmentId = String(existingAssessment.id);
    } else {
      const { data: assessment, error: assessmentError } = await supabase.schema("learning").from("assessments").insert({
        owner_user_id: payload.ownerUserId,
        session_id: payload.sessionId,
        topic_id: payload.topicId,
        assessment_type: "spanish_chatgenius_micro_session",
        prompt: `Spanish ChatGenius 5-minute micro-session · ${activityType}`,
        response: learnerResponse,
        score,
        confidence: score == null ? null : 0.7,
        feedback,
      }).select("id").single();
      if (assessmentError || !assessment?.id) throw new Error(assessmentError?.message || "Spanish assessment write failed");
      assessmentId = String(assessment.id);
    }

    const { data: previousMastery, error: masteryLookupError } = await supabase.schema("knowledge").from("mastery")
      .select("id,exposure_score,understanding_score,retention_score,practical_exposure_score,evidence_strength")
      .eq("owner_user_id", payload.ownerUserId)
      .eq("subject_entity_id", payload.subjectEntityId)
      .eq("topic_id", payload.topicId)
      .maybeSingle();
    if (masteryLookupError) throw new Error(`Spanish mastery lookup failed: ${masteryLookupError.message}`);

    const priorExposure = previousMastery?.exposure_score == null ? 0 : Number(previousMastery.exposure_score);
    const priorPractical = previousMastery?.practical_exposure_score == null ? 0 : Number(previousMastery.practical_exposure_score);
    const priorEvidence = previousMastery?.evidence_strength == null ? 0 : Number(previousMastery.evidence_strength);
    const reviewDays = score == null ? 2 : score < 0.5 ? 1 : score < 0.75 ? 3 : 7;
    const nextReviewAt = addDaysIso(reviewDays);

    const masteryWrite = {
      owner_user_id: payload.ownerUserId,
      subject_entity_id: payload.subjectEntityId,
      topic_id: payload.topicId,
      exposure_score: Math.min(1, priorExposure + 0.08),
      practical_exposure_score: Math.min(1, priorPractical + 0.08),
      understanding_score: score == null ? previousMastery?.understanding_score ?? null : blend(previousMastery?.understanding_score, score, 0.25),
      retention_score: score == null ? previousMastery?.retention_score ?? null : blend(previousMastery?.retention_score, score, 0.2),
      evidence_strength: Math.min(1, priorEvidence + 0.08),
      last_assessed_at: new Date().toISOString(),
      next_review_at: nextReviewAt,
      updated_at: new Date().toISOString(),
    };

    const { data: mastery, error: masteryWriteError } = await supabase.schema("knowledge").from("mastery")
      .upsert(masteryWrite, { onConflict: "owner_user_id,subject_entity_id,topic_id" })
      .select("id")
      .single();
    if (masteryWriteError || !mastery?.id) throw new Error(masteryWriteError?.message || "Spanish mastery write failed");

    const { data: existingEvidence, error: evidenceLookupError } = await supabase.schema("knowledge").from("mastery_evidence")
      .select("id")
      .eq("owner_user_id", payload.ownerUserId)
      .eq("mastery_id", mastery.id)
      .eq("learning_session_id", payload.sessionId)
      .eq("evidence_type", "spanish_chatgenius_micro_session")
      .maybeSingle();
    if (evidenceLookupError) throw new Error(`Spanish evidence lookup failed: ${evidenceLookupError.message}`);

    if (!existingEvidence?.id) {
      const { error: evidenceError } = await supabase.schema("knowledge").from("mastery_evidence").insert({
        owner_user_id: payload.ownerUserId,
        mastery_id: mastery.id,
        evidence_type: "spanish_chatgenius_micro_session",
        learning_session_id: payload.sessionId,
        assessment_id: assessmentId,
        score_effect: score,
        evidence_strength: score == null ? 0.45 : 0.65,
      });
      if (evidenceError) throw new Error(`Spanish evidence write failed: ${evidenceError.message}`);
    }

    const { data: activeReview, error: activeReviewError } = await supabase.schema("learning").from("review_schedule")
      .select("id")
      .eq("owner_user_id", payload.ownerUserId)
      .eq("subject_entity_id", payload.subjectEntityId)
      .eq("topic_id", payload.topicId)
      .in("status", ["scheduled", "due"])
      .order("due_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (activeReviewError) throw new Error(`Spanish review lookup failed: ${activeReviewError.message}`);

    const reviewReason = score == null
      ? "Spanish ChatGenius spaced review after a completed micro-session."
      : score < 0.5
        ? "Spanish ChatGenius: quick reinforcement after a difficult micro-session."
        : score < 0.75
          ? "Spanish ChatGenius: spaced review after partial recall."
          : "Spanish ChatGenius: spaced review to maintain strong recall.";

    if (activeReview?.id) {
      const { error } = await supabase.schema("learning").from("review_schedule").update({
        review_reason: reviewReason,
        due_at: nextReviewAt,
        priority: score != null && score < 0.5 ? 5 : score != null && score < 0.75 ? 4 : 3,
        status: "scheduled",
        last_result: score,
        next_interval: `${reviewDays} days`,
        updated_at: new Date().toISOString(),
      }).eq("owner_user_id", payload.ownerUserId).eq("id", activeReview.id);
      if (error) throw new Error(`Spanish review update failed: ${error.message}`);
    } else {
      const { error } = await supabase.schema("learning").from("review_schedule").insert({
        owner_user_id: payload.ownerUserId,
        subject_entity_id: payload.subjectEntityId,
        topic_id: payload.topicId,
        review_reason: reviewReason,
        due_at: nextReviewAt,
        priority: score != null && score < 0.5 ? 5 : score != null && score < 0.75 ? 4 : 3,
        status: "scheduled",
        last_result: score,
        next_interval: `${reviewDays} days`,
      });
      if (error) throw new Error(`Spanish review write failed: ${error.message}`);
    }

    return NextResponse.json({
      ok: true,
      recorded: "completed",
      sessionId: payload.sessionId,
      topicId: payload.topicId,
      score,
      nextReviewAt,
    }, { headers });
  } catch (error) {
    console.error("[Spanish progress bridge]", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Spanish progress bridge failed" }, { status: 500, headers });
  }
}
