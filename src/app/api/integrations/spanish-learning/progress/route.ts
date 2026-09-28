import { NextRequest, NextResponse } from "next/server";
import { getPersonalIntelligenceSupabase } from "@/lib/personal-intelligence/supabase";
import { madridDateKey, recommendedSpanishFocus, SPANISH_COURSE, SPANISH_PROVIDER, verifySpanishProgressToken } from "@/lib/personal-intelligence/spanish-learning";

const ALLOW_ORIGIN = "https://spanish.chatgenius.pro";

function cors(response: NextResponse) {
  response.headers.set("Access-Control-Allow-Origin", ALLOW_ORIGIN);
  response.headers.set("Access-Control-Allow-Methods", "POST,OPTIONS");
  response.headers.set("Access-Control-Allow-Headers", "Content-Type,Authorization");
  response.headers.set("Vary", "Origin");
  return response;
}

export async function OPTIONS() {
  return cors(new NextResponse(null, { status: 204 }));
}

export async function POST(request: NextRequest) {
  try {
    const origin = request.headers.get("origin");
    if (origin && origin !== ALLOW_ORIGIN) return cors(NextResponse.json({ error: "Origin not allowed" }, { status: 403 }));
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const token = typeof body.token === "string" ? body.token : request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
    const verified = verifySpanishProgressToken(token);
    if (!verified) return cors(NextResponse.json({ error: "Invalid progress token" }, { status: 401 }));

    const minutes = Math.max(1, Math.min(30, Number(body.minutes || 5)));
    const score = typeof body.score === "number" ? Math.max(0, Math.min(1, body.score)) : null;
    const level = typeof body.level === "string" ? body.level.trim().slice(0, 80) : "adaptive";
    const nextFocus = typeof body.nextFocus === "string" ? body.nextFocus.trim().slice(0, 300) : null;
    const weakAreas = Array.isArray(body.weakAreas) ? body.weakAreas.slice(0, 12).map(String) : [];
    const strongAreas = Array.isArray(body.strongAreas) ? body.strongAreas.slice(0, 12).map(String) : [];

    const supabase = getPersonalIntelligenceSupabase();
    const current = await supabase.schema("learning").from("external_course_progress").select("*")
      .eq("owner_user_id", verified.ownerUserId).eq("provider", SPANISH_PROVIDER).eq("course_key", SPANISH_COURSE).maybeSingle();
    if (current.error) throw current.error;

    const now = new Date().toISOString();
    const previous = current.data || {};
    const previousDay = madridDateKey(previous.last_completed_at);
    const today = madridDateKey(now);
    const yesterday = madridDateKey(new Date(Date.now() - 86400000));
    const alreadyCompleted = previousDay === today;
    const streak = alreadyCompleted ? Number(previous.streak_days || 0)
      : previousDay === yesterday ? Number(previous.streak_days || 0) + 1
      : 1;
    const sessions = Number(previous.total_sessions || 0) + (alreadyCompleted ? 0 : 1);
    const totalMinutes = Number(previous.total_minutes || 0) + (alreadyCompleted ? 0 : minutes);

    const payload = {
      owner_user_id: verified.ownerUserId,
      subject_entity_id: verified.subjectEntityId,
      provider: SPANISH_PROVIDER,
      course_key: SPANISH_COURSE,
      current_level: level,
      streak_days: streak,
      total_sessions: sessions,
      total_minutes: totalMinutes,
      next_focus: nextFocus || recommendedSpanishFocus(sessions, null),
      last_started_at: previous.last_started_at || now,
      last_completed_at: now,
      last_result: { source: "spanish_chatgenius", minutes, score, weakAreas, strongAreas },
      state: { ...(previous.state || {}), weakAreas, strongAreas, score },
      updated_at: now,
    };
    const saved = await supabase.schema("learning").from("external_course_progress").upsert(payload, {
      onConflict: "owner_user_id,provider,course_key",
    }).select("*").single();
    if (saved.error || !saved.data) throw new Error(saved.error?.message || "Spanish progress sync failed");
    return cors(NextResponse.json({ ok: true, progress: saved.data }));
  } catch (error) {
    return cors(NextResponse.json({ error: error instanceof Error ? error.message : "Spanish progress sync failed" }, { status: 500 }));
  }
}
