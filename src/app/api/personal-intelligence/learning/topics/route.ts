import { NextRequest, NextResponse } from "next/server";
import { getRequestAccessContext } from "@/lib/api-admin";
import {
  getPersonalIntelligenceOwnerUserId,
  getPersonalIntelligenceSupabase,
  PERSONAL_INTELLIGENCE_OWNER_CANONICAL_NAME,
} from "@/lib/personal-intelligence/supabase";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type MasteryRow = {
  topic_id: string;
  exposure_score: number | null;
  understanding_score: number | null;
  retention_score: number | null;
  transfer_score: number | null;
  confidence_score: number | null;
  interest_score: number | null;
  evidence_strength: number | null;
  last_assessed_at: string | null;
  next_review_at: string | null;
};

export async function GET(request: NextRequest) {
  try {
    const access = await getRequestAccessContext(request);
    if (!access || access.role !== "OWNER") {
      return NextResponse.json({ error: "Owner session required" }, { status: 401 });
    }

    const supabase = getPersonalIntelligenceSupabase();
    const ownerUserId = await getPersonalIntelligenceOwnerUserId(supabase);
    const { data: subject, error: subjectError } = await supabase.schema("personal_core").from("entities")
      .select("id").eq("owner_user_id", ownerUserId).eq("entity_type", "person")
      .eq("canonical_name", PERSONAL_INTELLIGENCE_OWNER_CANONICAL_NAME).single();
    if (subjectError || !subject?.id) {
      return NextResponse.json({ error: "Personal Intelligence owner is not bootstrapped" }, { status: 409 });
    }

    const [topicsRes, domainsRes, masteryRes, reviewsRes] = await Promise.all([
      supabase.schema("knowledge").from("topics")
        .select("id,domain_id,parent_topic_id,name,description,difficulty_band,created_at")
        .eq("owner_user_id", ownerUserId).order("name", { ascending: true }).limit(300),
      supabase.schema("knowledge").from("domains")
        .select("id,name,description").eq("owner_user_id", ownerUserId).order("name", { ascending: true }).limit(100),
      supabase.schema("knowledge").from("mastery")
        .select("topic_id,exposure_score,understanding_score,retention_score,transfer_score,confidence_score,interest_score,evidence_strength,last_assessed_at,next_review_at")
        .eq("owner_user_id", ownerUserId).eq("subject_entity_id", subject.id).limit(300),
      supabase.schema("learning").from("review_schedule")
        .select("topic_id,review_reason,due_at,priority,status")
        .eq("owner_user_id", ownerUserId).eq("subject_entity_id", subject.id)
        .in("status", ["scheduled", "due"]).order("due_at", { ascending: true }).limit(300),
    ]);

    for (const result of [topicsRes, domainsRes, masteryRes, reviewsRes]) {
      if (result.error) throw new Error(`Learning catalogue failed: ${result.error.message}`);
    }

    const domains = new Map((domainsRes.data || []).map((row) => [String(row.id), row]));
    const mastery = new Map(((masteryRes.data || []) as MasteryRow[]).map((row) => [String(row.topic_id), row]));
    const reviews = new Map((reviewsRes.data || []).map((row) => [String(row.topic_id), row]));
    const now = Date.now();

    const topics = (topicsRes.data || []).map((topic) => {
      const topicId = String(topic.id);
      const m = mastery.get(topicId) || null;
      const review = reviews.get(topicId) || null;
      const dueAt = review?.due_at ? new Date(String(review.due_at)).getTime() : NaN;
      const reviewDue = Number.isFinite(dueAt) && dueAt <= now;
      const unknownUnderstanding = m?.understanding_score == null;
      const interest = m?.interest_score == null ? 0 : Number(m.interest_score);
      const priorityScore = (reviewDue ? 50 : review ? 25 : 0) + (unknownUnderstanding ? 15 : 0) + Math.round(interest * 10);
      const domain = domains.get(String(topic.domain_id)) || null;

      return {
        id: topicId,
        name: String(topic.name),
        description: topic.description ? String(topic.description) : null,
        domain: domain ? { id: String(domain.id), name: String(domain.name) } : null,
        parentTopicId: topic.parent_topic_id ? String(topic.parent_topic_id) : null,
        difficultyBand: topic.difficulty_band == null ? null : Number(topic.difficulty_band),
        mastery: m ? {
          exposure: m.exposure_score,
          understanding: m.understanding_score,
          retention: m.retention_score,
          transfer: m.transfer_score,
          confidence: m.confidence_score,
          interest: m.interest_score,
          evidenceStrength: m.evidence_strength,
          lastAssessedAt: m.last_assessed_at,
          nextReviewAt: m.next_review_at,
        } : null,
        review: review ? {
          reason: String(review.review_reason),
          dueAt: String(review.due_at),
          priority: Number(review.priority),
          status: String(review.status),
        } : null,
        priorityScore,
      };
    }).sort((a, b) => b.priorityScore - a.priorityScore || a.name.localeCompare(b.name));

    return NextResponse.json({ ok: true, topics });
  } catch (error) {
    console.error("[Personal Intelligence Learning Topics]", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Learning catalogue failed" }, { status: 500 });
  }
}
