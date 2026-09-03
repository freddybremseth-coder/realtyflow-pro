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

    const body = await request.json() as { topicId?: string; inputMode?: string; teachingMode?: string };
    if (!body.topicId) return NextResponse.json({ error: "topicId is required" }, { status: 400 });

    const supabase = getPersonalIntelligenceSupabase();
    const ownerUserId = await getPersonalIntelligenceOwnerUserId(supabase);
    const { data: subject, error: subjectError } = await supabase.schema("personal_core").from("entities")
      .select("id").eq("owner_user_id", ownerUserId).eq("entity_type", "person")
      .eq("canonical_name", PERSONAL_INTELLIGENCE_OWNER_CANONICAL_NAME).single();
    if (subjectError || !subject?.id) return NextResponse.json({ error: "Personal Intelligence owner is not bootstrapped" }, { status: 409 });

    const { data: topic, error: topicError } = await supabase.schema("knowledge").from("topics")
      .select("id,name").eq("owner_user_id", ownerUserId).eq("id", body.topicId).single();
    if (topicError || !topic?.id) return NextResponse.json({ error: "Topic not found" }, { status: 404 });

    const { data: session, error } = await supabase.schema("learning").from("sessions").insert({
      owner_user_id: ownerUserId,
      subject_entity_id: subject.id,
      topic_id: topic.id,
      input_mode: body.inputMode || "text",
      teaching_mode: body.teachingMode || "professor",
      completion_status: "started",
    }).select("id,topic_id,input_mode,teaching_mode,started_at,completion_status").single();
    if (error || !session) throw new Error(`Learning session create failed: ${error?.message || "missing session"}`);

    return NextResponse.json({ ok: true, session, topic: { id: topic.id, name: topic.name } });
  } catch (error) {
    console.error("[Personal Intelligence Learning Session]", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Learning session failed" }, { status: 500 });
  }
}
