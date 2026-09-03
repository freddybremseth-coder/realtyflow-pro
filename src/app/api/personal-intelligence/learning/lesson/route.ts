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

    const body = await request.json() as { sessionId?: string };
    if (!body.sessionId) return NextResponse.json({ error: "sessionId is required" }, { status: 400 });

    const supabase = getPersonalIntelligenceSupabase();
    const ownerUserId = await getPersonalIntelligenceOwnerUserId(supabase);
    const { data: subject } = await supabase.schema("personal_core").from("entities")
      .select("id").eq("owner_user_id", ownerUserId).eq("entity_type", "person")
      .eq("canonical_name", PERSONAL_INTELLIGENCE_OWNER_CANONICAL_NAME).single();
    if (!subject?.id) return NextResponse.json({ error: "Personal Intelligence owner is not bootstrapped" }, { status: 409 });

    const { data: session, error: sessionError } = await supabase.schema("learning").from("sessions")
      .select("id,topic_id,subject_entity_id,teaching_mode,input_mode")
      .eq("owner_user_id", ownerUserId).eq("id", body.sessionId).single();
    if (sessionError || !session?.id || String(session.subject_entity_id) !== String(subject.id) || !session.topic_id) {
      return NextResponse.json({ error: "Learning session not found" }, { status: 404 });
    }

    const [{ data: topic, error: topicError }, { data: mastery }] = await Promise.all([
      supabase.schema("knowledge").from("topics")
        .select("id,domain_id,name,description,difficulty_band")
        .eq("owner_user_id", ownerUserId).eq("id", session.topic_id).single(),
      supabase.schema("knowledge").from("mastery")
        .select("exposure_score,understanding_score,retention_score,transfer_score,confidence_score,formal_exposure_score,practical_exposure_score,interest_score,evidence_strength,last_assessed_at")
        .eq("owner_user_id", ownerUserId).eq("subject_entity_id", subject.id).eq("topic_id", session.topic_id).maybeSingle(),
    ]);
    if (topicError || !topic?.id) return NextResponse.json({ error: "Topic not found" }, { status: 404 });

    const masteryContext = mastery
      ? `Evidence-based mastery snapshot: exposure=${mastery.exposure_score ?? "unknown"}, understanding=${mastery.understanding_score ?? "unknown"}, retention=${mastery.retention_score ?? "unknown"}, transfer=${mastery.transfer_score ?? "unknown"}, practical_exposure=${mastery.practical_exposure_score ?? "unknown"}, formal_exposure=${mastery.formal_exposure_score ?? "unknown"}, interest=${mastery.interest_score ?? "unknown"}, evidence_strength=${mastery.evidence_strength ?? "unknown"}.`
      : "No mastery record exists. Treat prior knowledge as unknown, not low.";

    const prompt = `Create one concise adaptive professor lesson about: ${topic.name}.\nTopic description: ${topic.description || "No description stored."}\nDifficulty band: ${topic.difficulty_band ?? "unknown"}.\n${masteryContext}\n\nFollow this sequence: Hook -> Core concept -> Concrete example -> Connection to real-world use -> One check question -> Teach-back prompt. Do not claim the learner knows or does not know something unless the evidence supports it. The lesson should fit roughly 5-10 minutes. Return strict JSON only with keys: hook, explanation, example, connection, checkQuestion, teachBackPrompt, depthReason.`;

    const raw = await askClaude(prompt, {
      model: "haiku",
      systemPrompt: "You are a precise adaptive professor. Teach for understanding, not performance. Unknown evidence remains unknown. Avoid praise inflation and avoid declaring mastery from exposure alone.",
      maxTokens: 1800,
    });

    let lesson: Record<string, string>;
    try {
      const parsed = JSON.parse(cleanJson(raw)) as Record<string, unknown>;
      lesson = {
        hook: String(parsed.hook || ""),
        explanation: String(parsed.explanation || ""),
        example: String(parsed.example || ""),
        connection: String(parsed.connection || ""),
        checkQuestion: String(parsed.checkQuestion || "What is the core mechanism here?"),
        teachBackPrompt: String(parsed.teachBackPrompt || `Explain ${topic.name} in your own words, including why it matters and one practical example.`),
        depthReason: String(parsed.depthReason || "Depth selected from available mastery evidence."),
      };
    } catch {
      lesson = {
        hook: "",
        explanation: raw,
        example: "",
        connection: "",
        checkQuestion: "What is the core mechanism here?",
        teachBackPrompt: `Explain ${topic.name} in your own words, including why it matters and one practical example.`,
        depthReason: mastery ? "Depth selected from available mastery evidence." : "Prior knowledge is unknown, so the lesson starts from a neutral baseline.",
      };
    }

    return NextResponse.json({
      ok: true,
      sessionId: String(session.id),
      topic: { id: String(topic.id), name: String(topic.name) },
      lesson,
      masteryKnown: Boolean(mastery),
    });
  } catch (error) {
    console.error("[Personal Intelligence Learning Lesson]", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Professor lesson failed" }, { status: 500 });
  }
}
