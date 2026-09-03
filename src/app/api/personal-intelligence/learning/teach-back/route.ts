import { NextRequest, NextResponse } from "next/server";
import { getRequestAccessContext } from "@/lib/api-admin";
import {
  getPersonalIntelligenceOwnerUserId,
  getPersonalIntelligenceSupabase,
  PERSONAL_INTELLIGENCE_OWNER_CANONICAL_NAME,
} from "@/lib/personal-intelligence/supabase";
import { evaluateTeachBack, recordTeachBack } from "@/lib/personal-intelligence/learning-service";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(request: NextRequest) {
  try {
    const access = await getRequestAccessContext(request);
    if (!access || access.role !== "OWNER") return NextResponse.json({ error: "Owner session required" }, { status: 401 });

    const body = await request.json() as { sessionId?: string; transcript?: string };
    const transcript = body.transcript?.trim() || "";
    if (!body.sessionId || transcript.length < 20) {
      return NextResponse.json({ error: "sessionId and a substantive teach-back are required" }, { status: 400 });
    }

    const supabase = getPersonalIntelligenceSupabase();
    const ownerUserId = await getPersonalIntelligenceOwnerUserId(supabase);
    const { data: subject } = await supabase.schema("personal_core").from("entities")
      .select("id").eq("owner_user_id", ownerUserId).eq("entity_type", "person")
      .eq("canonical_name", PERSONAL_INTELLIGENCE_OWNER_CANONICAL_NAME).single();
    if (!subject?.id) return NextResponse.json({ error: "Personal Intelligence owner is not bootstrapped" }, { status: 409 });

    const { data: session, error: sessionError } = await supabase.schema("learning").from("sessions")
      .select("id,topic_id,subject_entity_id").eq("owner_user_id", ownerUserId).eq("id", body.sessionId).single();
    if (sessionError || !session?.id || String(session.subject_entity_id) !== String(subject.id) || !session.topic_id) {
      return NextResponse.json({ error: "Learning session not found" }, { status: 404 });
    }

    const { data: topic, error: topicError } = await supabase.schema("knowledge").from("topics")
      .select("id,name").eq("owner_user_id", ownerUserId).eq("id", session.topic_id).single();
    if (topicError || !topic?.id) return NextResponse.json({ error: "Topic not found" }, { status: 404 });

    const assessment = await evaluateTeachBack({ topicName: String(topic.name), transcript });
    const recorded = await recordTeachBack(supabase, {
      ownerUserId,
      subjectEntityId: String(subject.id),
      sessionId: String(session.id),
      topicId: String(topic.id),
      transcript,
      assessment,
    });

    await supabase.schema("learning").from("sessions").update({
      completion_status: "completed",
      ended_at: new Date().toISOString(),
    }).eq("owner_user_id", ownerUserId).eq("id", session.id);

    return NextResponse.json({ ok: true, assessment, recorded });
  } catch (error) {
    console.error("[Personal Intelligence Teach Back]", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Teach-back failed" }, { status: 500 });
  }
}
