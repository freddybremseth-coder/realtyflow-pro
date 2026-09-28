import { NextRequest, NextResponse } from "next/server";
import { getRequestAccessContext } from "@/lib/api-admin";
import {
  getPersonalIntelligenceOwnerUserId,
  getPersonalIntelligenceSupabase,
  PERSONAL_INTELLIGENCE_OWNER_CANONICAL_NAME,
} from "@/lib/personal-intelligence/supabase";
import {
  createSpanishBridgeToken,
  loadSpanishDailyStatus,
  SPANISH_APP_URL,
  SPANISH_TEACHING_MODE,
} from "@/lib/personal-intelligence/spanish-learning";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const REALTYFLOW_ORIGIN = "https://realtyflow.chatgenius.pro";

async function ownerContext() {
  const supabase = getPersonalIntelligenceSupabase();
  const ownerUserId = await getPersonalIntelligenceOwnerUserId(supabase);
  const { data: subject, error } = await supabase.schema("personal_core").from("entities")
    .select("id")
    .eq("owner_user_id", ownerUserId)
    .eq("entity_type", "person")
    .eq("canonical_name", PERSONAL_INTELLIGENCE_OWNER_CANONICAL_NAME)
    .single();
  if (error || !subject?.id) throw new Error("Personal Intelligence owner is not bootstrapped");
  return { supabase, ownerUserId, subjectEntityId: String(subject.id) };
}

export async function GET(request: NextRequest) {
  try {
    const access = await getRequestAccessContext(request);
    if (!access || access.role !== "OWNER") return NextResponse.json({ error: "Owner session required" }, { status: 401 });
    const { supabase, ownerUserId, subjectEntityId } = await ownerContext();
    const status = await loadSpanishDailyStatus(supabase, { ownerUserId, subjectEntityId });
    return NextResponse.json({ ok: true, ...status });
  } catch (error) {
    console.error("[Spanish daily status]", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Spanish daily status failed" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const access = await getRequestAccessContext(request);
    if (!access || access.role !== "OWNER") return NextResponse.json({ error: "Owner session required" }, { status: 401 });

    const body = (await request.json().catch(() => ({}))) as { returnPath?: unknown };
    const returnPath = typeof body.returnPath === "string" && body.returnPath.startsWith("/") && !body.returnPath.startsWith("//")
      ? body.returnPath.slice(0, 800)
      : "/";

    const { supabase, ownerUserId, subjectEntityId } = await ownerContext();
    const status = await loadSpanishDailyStatus(supabase, { ownerUserId, subjectEntityId });
    if (!status.focus) return NextResponse.json({ error: "Spanish learning topics are not configured" }, { status: 409 });

    const { data: session, error: sessionError } = await supabase.schema("learning").from("sessions").insert({
      owner_user_id: ownerUserId,
      subject_entity_id: subjectEntityId,
      topic_id: status.focus.topicId,
      input_mode: status.focus.inputMode,
      teaching_mode: SPANISH_TEACHING_MODE,
      completion_status: "started",
    }).select("id,started_at").single();
    if (sessionError || !session?.id) throw new Error(sessionError?.message || "Spanish learning session could not start");

    const token = createSpanishBridgeToken({
      v: 1,
      sessionId: String(session.id),
      ownerUserId,
      subjectEntityId,
      topicId: status.focus.topicId,
      exp: Date.now() + 2 * 60 * 60 * 1000,
    });

    const handoff = new URL(SPANISH_APP_URL);
    handoff.searchParams.set("source", "realtyflow");
    handoff.searchParams.set("mode", "daily5");
    handoff.searchParams.set("duration", "5");
    handoff.searchParams.set("focus", status.focus.activityMode);
    handoff.searchParams.set("topic", status.focus.topicName);
    handoff.searchParams.set("rf_session", String(session.id));
    handoff.searchParams.set("rf_bridge", token);
    handoff.searchParams.set("rf_callback", `${REALTYFLOW_ORIGIN}/api/integrations/spanish/progress`);
    handoff.searchParams.set("rf_return", `${REALTYFLOW_ORIGIN}${returnPath}`);

    return NextResponse.json({
      ok: true,
      session: { id: String(session.id), startedAt: String(session.started_at) },
      focus: status.focus,
      handoffUrl: handoff.toString(),
      todayCompletedBeforeStart: status.todayCompleted,
    });
  } catch (error) {
    console.error("[Spanish daily start]", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Spanish daily start failed" }, { status: 500 });
  }
}
