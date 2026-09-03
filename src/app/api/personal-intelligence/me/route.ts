import { NextRequest, NextResponse } from "next/server";
import { getRequestAccessContext } from "@/lib/api-admin";
import {
  getPersonalIntelligenceOwnerUserId,
  getPersonalIntelligenceSupabase,
  PERSONAL_INTELLIGENCE_OWNER_CANONICAL_NAME,
} from "@/lib/personal-intelligence/supabase";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest) {
  try {
    const access = await getRequestAccessContext(request);
    if (!access || access.role !== "OWNER") return NextResponse.json({ error: "Owner session required" }, { status: 401 });

    const supabase = getPersonalIntelligenceSupabase();
    const ownerUserId = await getPersonalIntelligenceOwnerUserId(supabase);
    const { data: subject } = await supabase.schema("personal_core").from("entities")
      .select("id,display_name,canonical_name,privacy_level,created_at,updated_at")
      .eq("owner_user_id", ownerUserId).eq("entity_type", "person")
      .eq("canonical_name", PERSONAL_INTELLIGENCE_OWNER_CANONICAL_NAME).single();
    if (!subject?.id) return NextResponse.json({ error: "Personal Intelligence owner is not bootstrapped" }, { status: 409 });

    const [claimsResult, goalsResult, masteryResult, topicsResult, observationsResult, decisionsResult, sessionsResult] = await Promise.all([
      supabase.schema("personal_core").from("claims")
        .select("id,predicate,value_text,claim_type,status,confidence,privacy_level,requires_confirmation,confirmed_at,source_id,created_at,updated_at")
        .eq("owner_user_id", ownerUserId).eq("subject_entity_id", subject.id)
        .order("updated_at", { ascending: false }).limit(100),
      supabase.schema("personal_core").from("goals")
        .select("id,title,description,domain,goal_type,priority,status,target_date,why_it_matters,success_definition,privacy_level,updated_at")
        .eq("owner_user_id", ownerUserId).eq("subject_entity_id", subject.id)
        .order("priority", { ascending: false }).limit(50),
      supabase.schema("knowledge").from("mastery")
        .select("id,topic_id,exposure_score,understanding_score,retention_score,transfer_score,confidence_score,evidence_strength,last_assessed_at,next_review_at")
        .eq("owner_user_id", ownerUserId).eq("subject_entity_id", subject.id).limit(100),
      supabase.schema("knowledge").from("topics")
        .select("id,name,domain_id,difficulty_band")
        .eq("owner_user_id", ownerUserId).limit(200),
      supabase.schema("mentor").from("observations")
        .select("id,observation,category,confidence,status,requires_confirmation,privacy_level,created_at,updated_at")
        .eq("owner_user_id", ownerUserId).eq("subject_entity_id", subject.id)
        .order("updated_at", { ascending: false }).limit(50),
      supabase.schema("mentor").from("decisions")
        .select("id,status,decision_type,created_at,decided_at")
        .eq("owner_user_id", ownerUserId).eq("subject_entity_id", subject.id).limit(200),
      supabase.schema("mentor").from("sessions")
        .select("id,session_type,input_mode,started_at,ended_at")
        .eq("owner_user_id", ownerUserId).eq("subject_entity_id", subject.id)
        .order("started_at", { ascending: false }).limit(200),
    ]);

    for (const result of [claimsResult, goalsResult, masteryResult, topicsResult, observationsResult, decisionsResult, sessionsResult]) {
      if (result.error) throw new Error(result.error.message);
    }

    const topics = new Map((topicsResult.data || []).map((topic) => [String(topic.id), topic]));
    const mastery = (masteryResult.data || []).map((row) => ({ ...row, topic: topics.get(String(row.topic_id)) || null }));
    const claims = claimsResult.data || [];
    const activeClaims = claims.filter((claim) => ["validated", "canonical"].includes(String(claim.status)));
    const uncertainClaims = claims.filter((claim) => ["captured", "candidate", "disputed"].includes(String(claim.status)));
    const goals = goalsResult.data || [];
    const observations = observationsResult.data || [];
    const decisions = decisionsResult.data || [];
    const sessions = sessionsResult.data || [];

    return NextResponse.json({
      ok: true,
      subject,
      summary: {
        activeClaims: activeClaims.length,
        uncertainClaims: uncertainClaims.length,
        activeGoals: goals.filter((goal) => goal.status === "active").length,
        knowledgeTopics: topics.size,
        masteryRecords: mastery.length,
        candidateObservations: observations.filter((item) => item.status === "candidate").length,
        decisions: decisions.length,
        mentorSessions: sessions.length,
        onboardingState: activeClaims.length === 0 && goals.length === 0 && topics.size === 0 ? "empty" : "learning",
      },
      claims,
      goals,
      mastery,
      observations,
      decisions,
      recentSessions: sessions.slice(0, 20),
      principles: {
        unknownIsUnknown: true,
        observationsAreNotFacts: true,
        rejectedClaimsRemainAuditable: true,
      },
    });
  } catch (error) {
    console.error("[Personal Intelligence ME]", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "ME review failed" }, { status: 500 });
  }
}
