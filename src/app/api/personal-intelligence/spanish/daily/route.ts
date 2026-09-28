import { NextRequest, NextResponse } from "next/server";
import { getRequestAccessContext } from "@/lib/api-admin";
import { getPersonalIntelligenceOwnerUserId, getPersonalIntelligenceSupabase, PERSONAL_INTELLIGENCE_OWNER_CANONICAL_NAME } from "@/lib/personal-intelligence/supabase";
import { madridDateKey, recommendedSpanishFocus, signSpanishProgressToken, SPANISH_APP_URL, SPANISH_COURSE, SPANISH_PROVIDER } from "@/lib/personal-intelligence/spanish-learning";

export const dynamic = "force-dynamic";
export const revalidate = 0;

async function context() {
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

async function ensureProgress() {
  const { supabase, ownerUserId, subjectEntityId } = await context();
  const existing = await supabase.schema("learning").from("external_course_progress")
    .select("*")
    .eq("owner_user_id", ownerUserId)
    .eq("provider", SPANISH_PROVIDER)
    .eq("course_key", SPANISH_COURSE)
    .maybeSingle();
  if (existing.error) throw existing.error;
  if (existing.data) return { supabase, ownerUserId, subjectEntityId, progress: existing.data };
  const inserted = await supabase.schema("learning").from("external_course_progress").insert({
    owner_user_id: ownerUserId,
    subject_entity_id: subjectEntityId,
    provider: SPANISH_PROVIDER,
    course_key: SPANISH_COURSE,
    current_level: "adaptive",
    next_focus: "Hverdagsfraser: hilse, bestille, spørre og forstå korte svar",
  }).select("*").single();
  if (inserted.error || !inserted.data) throw new Error(inserted.error?.message || "Spanish progress initialization failed");
  return { supabase, ownerUserId, subjectEntityId, progress: inserted.data };
}

function responseShape(ownerUserId: string, subjectEntityId: string, progress: any) {
  const focus = recommendedSpanishFocus(Number(progress.total_sessions || 0), progress.next_focus);
  const today = madridDateKey(new Date());
  const completedToday = madridDateKey(progress.last_completed_at) === today;
  const token = signSpanishProgressToken({ ownerUserId, subjectEntityId, exp: Date.now() + 1000 * 60 * 60 * 12 });
  const app = new URL(SPANISH_APP_URL);
  app.searchParams.set("source", "realtyflow");
  app.searchParams.set("mode", "daily5");
  app.searchParams.set("minutes", "5");
  app.searchParams.set("level", String(progress.current_level || "adaptive"));
  app.searchParams.set("focus", focus);
  app.searchParams.set("return_url", "https://realtyflow.chatgenius.pro/");
  if (token) {
    app.searchParams.set("progress_callback", "https://realtyflow.chatgenius.pro/api/integrations/spanish-learning/progress");
    app.searchParams.set("progress_token", token);
  }
  return {
    ok: true,
    completedToday,
    streakDays: Number(progress.streak_days || 0),
    totalSessions: Number(progress.total_sessions || 0),
    totalMinutes: Number(progress.total_minutes || 0),
    currentLevel: String(progress.current_level || "adaptive"),
    focus,
    lastStartedAt: progress.last_started_at || null,
    lastCompletedAt: progress.last_completed_at || null,
    launchUrl: app.toString(),
    callbackEnabled: Boolean(token),
  };
}

export async function GET(request: NextRequest) {
  try {
    const access = await getRequestAccessContext(request);
    if (!access || access.role !== "OWNER") return NextResponse.json({ error: "Owner session required" }, { status: 401 });
    const state = await ensureProgress();
    return NextResponse.json(responseShape(state.ownerUserId, state.subjectEntityId, state.progress));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Spanish daily status failed" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const access = await getRequestAccessContext(request);
    if (!access || access.role !== "OWNER") return NextResponse.json({ error: "Owner session required" }, { status: 401 });
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const action = body.action === "complete" ? "complete" : "start";
    const minutes = Math.max(1, Math.min(30, Number(body.minutes || 5)));
    const state = await ensureProgress();
    const now = new Date().toISOString();
    if (action === "start") {
      const updated = await state.supabase.schema("learning").from("external_course_progress").update({
        last_started_at: now,
        updated_at: now,
      }).eq("owner_user_id", state.ownerUserId).eq("provider", SPANISH_PROVIDER).eq("course_key", SPANISH_COURSE).select("*").single();
      if (updated.error || !updated.data) throw new Error(updated.error?.message || "Spanish start update failed");
      return NextResponse.json(responseShape(state.ownerUserId, state.subjectEntityId, updated.data));
    }

    const previousDay = madridDateKey(state.progress.last_completed_at);
    const today = madridDateKey(now);
    const yesterday = madridDateKey(new Date(Date.now() - 86400000));
    const alreadyCompleted = previousDay === today;
    const streak = alreadyCompleted ? Number(state.progress.streak_days || 0)
      : previousDay === yesterday ? Number(state.progress.streak_days || 0) + 1
      : 1;
    const sessions = Number(state.progress.total_sessions || 0) + (alreadyCompleted ? 0 : 1);
    const totalMinutes = Number(state.progress.total_minutes || 0) + (alreadyCompleted ? 0 : minutes);
    const updated = await state.supabase.schema("learning").from("external_course_progress").update({
      last_completed_at: now,
      streak_days: streak,
      total_sessions: sessions,
      total_minutes: totalMinutes,
      next_focus: recommendedSpanishFocus(sessions, null),
      last_result: { source: "realtyflow_manual_completion", minutes },
      updated_at: now,
    }).eq("owner_user_id", state.ownerUserId).eq("provider", SPANISH_PROVIDER).eq("course_key", SPANISH_COURSE).select("*").single();
    if (updated.error || !updated.data) throw new Error(updated.error?.message || "Spanish completion update failed");
    return NextResponse.json(responseShape(state.ownerUserId, state.subjectEntityId, updated.data));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Spanish daily update failed" }, { status: 500 });
  }
}
