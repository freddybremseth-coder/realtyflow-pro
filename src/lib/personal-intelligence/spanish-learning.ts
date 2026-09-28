import { createHmac, timingSafeEqual } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

export const SPANISH_APP_URL = "https://spanish.chatgenius.pro/";
export const SPANISH_DOMAIN_NAME = "Spanish Language";
export const SPANISH_TEACHING_MODE = "spanish_chatgenius_daily5";

export type SpanishFocus = {
  topicId: string;
  topicName: string;
  reason: string;
  activityMode: "conversation" | "listening" | "active_recall" | "pattern_drill" | "shadowing";
  inputMode: "text" | "voice_conversation";
  score: number;
};

export type SpanishDailyStatus = {
  todayCompleted: boolean;
  completed30d: number;
  lastCompletedAt: string | null;
  focus: SpanishFocus | null;
  appUrl: string;
};

type TopicRow = { id: string; name: string; description?: string | null };
type MasteryRow = {
  topic_id: string;
  understanding_score: number | null;
  retention_score: number | null;
  evidence_strength: number | null;
  last_assessed_at: string | null;
};
type ReviewRow = { topic_id: string; due_at: string; priority: number; status: string; last_result: number | null };
type SessionRow = {
  topic_id: string | null;
  completion_status: string;
  started_at: string;
  ended_at: string | null;
  engagement_signal: number | null;
  friction_signal: number | null;
};

function madridDateKey(value: string | Date) {
  const date = typeof value === "string" ? new Date(value) : value;
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Madrid",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const byType = new Map(parts.map((part) => [part.type, part.value]));
  return `${byType.get("year")}-${byType.get("month")}-${byType.get("day")}`;
}

function baselinePriority(name: string) {
  const normalized = name.toLowerCase();
  if (normalized.includes("conversation")) return 12;
  if (normalized.includes("listening")) return 9;
  if (normalized.includes("vocabulary")) return 7;
  if (normalized.includes("pronunciation")) return 5;
  if (normalized.includes("grammar")) return 3;
  return 0;
}

function activityForTopic(name: string): Pick<SpanishFocus, "activityMode" | "inputMode"> {
  const normalized = name.toLowerCase();
  if (normalized.includes("listening")) return { activityMode: "listening", inputMode: "voice_conversation" };
  if (normalized.includes("pronunciation")) return { activityMode: "shadowing", inputMode: "voice_conversation" };
  if (normalized.includes("conversation")) return { activityMode: "conversation", inputMode: "voice_conversation" };
  if (normalized.includes("vocabulary")) return { activityMode: "active_recall", inputMode: "text" };
  return { activityMode: "pattern_drill", inputMode: "text" };
}

export function rankSpanishFocus(input: {
  topics: TopicRow[];
  mastery: MasteryRow[];
  reviews: ReviewRow[];
  sessions: SessionRow[];
  now?: Date;
}): SpanishFocus | null {
  const now = input.now ?? new Date();
  const masteryByTopic = new Map(input.mastery.map((row) => [String(row.topic_id), row]));
  const reviewByTopic = new Map(input.reviews.map((row) => [String(row.topic_id), row]));
  const latestByTopic = new Map<string, SessionRow>();

  for (const session of input.sessions) {
    if (!session.topic_id) continue;
    const key = String(session.topic_id);
    if (!latestByTopic.has(key)) latestByTopic.set(key, session);
  }

  const ranked = input.topics.map((topic) => {
    const topicId = String(topic.id);
    const mastery = masteryByTopic.get(topicId) || null;
    const review = reviewByTopic.get(topicId) || null;
    const latest = latestByTopic.get(topicId) || null;

    let score = baselinePriority(topic.name);
    const reasons: string[] = [];

    if (review) {
      const due = new Date(review.due_at).getTime() <= now.getTime();
      if (due) {
        score += 100 + Math.max(0, Math.min(5, Number(review.priority || 0))) * 5;
        reasons.push("Repetisjon er forfalt");
      } else {
        score += 20;
      }
      if (review.last_result != null && Number(review.last_result) < 0.65) {
        score += 15;
        reasons.push("Siste repetisjon trenger styrking");
      }
    }

    if (!mastery) {
      score += 45;
      reasons.push("Vi trenger første læringsevidens");
    } else {
      if (mastery.understanding_score == null) score += 18;
      if (mastery.retention_score == null) score += 22;
      const evidence = mastery.evidence_strength == null ? 0 : Number(mastery.evidence_strength);
      score += Math.round((1 - Math.max(0, Math.min(1, evidence))) * 20);
      if (evidence < 0.4) reasons.push("Lite læringsevidens ennå");
    }

    if (!latest) {
      score += 30;
      reasons.push("Ikke øvd i denne læringsloggen ennå");
    } else {
      const ageDays = Math.max(0, (now.getTime() - new Date(latest.started_at).getTime()) / 86_400_000);
      score += Math.min(25, Math.floor(ageDays));
      if (ageDays >= 5) reasons.push("Det er en stund siden sist");
      if ((latest.friction_signal ?? 0) > 0.7) score -= 4;
      if ((latest.engagement_signal ?? 0) > 0.75) score += 2;
    }

    const activity = activityForTopic(topic.name);
    return {
      topicId,
      topicName: String(topic.name),
      reason: reasons[0] || "Balansert progresjon",
      activityMode: activity.activityMode,
      inputMode: activity.inputMode,
      score,
    } satisfies SpanishFocus;
  });

  ranked.sort((a, b) => b.score - a.score || a.topicName.localeCompare(b.topicName));
  return ranked[0] || null;
}

export async function loadSpanishDailyStatus(
  supabase: SupabaseClient,
  input: { ownerUserId: string; subjectEntityId: string; now?: Date },
): Promise<SpanishDailyStatus> {
  const now = input.now ?? new Date();
  const { data: domain, error: domainError } = await supabase.schema("knowledge").from("domains")
    .select("id")
    .eq("owner_user_id", input.ownerUserId)
    .eq("name", SPANISH_DOMAIN_NAME)
    .maybeSingle();
  if (domainError) throw new Error(`Spanish domain lookup failed: ${domainError.message}`);

  if (!domain?.id) {
    return { todayCompleted: false, completed30d: 0, lastCompletedAt: null, focus: null, appUrl: SPANISH_APP_URL };
  }

  const { data: topics, error: topicsError } = await supabase.schema("knowledge").from("topics")
    .select("id,name,description")
    .eq("owner_user_id", input.ownerUserId)
    .eq("domain_id", domain.id)
    .order("name", { ascending: true });
  if (topicsError) throw new Error(`Spanish topics lookup failed: ${topicsError.message}`);

  const topicIds = (topics || []).map((topic) => String(topic.id));
  if (!topicIds.length) {
    return { todayCompleted: false, completed30d: 0, lastCompletedAt: null, focus: null, appUrl: SPANISH_APP_URL };
  }

  const since = new Date(now.getTime() - 30 * 86_400_000).toISOString();
  const [masteryResult, reviewsResult, sessionsResult] = await Promise.all([
    supabase.schema("knowledge").from("mastery")
      .select("topic_id,understanding_score,retention_score,evidence_strength,last_assessed_at")
      .eq("owner_user_id", input.ownerUserId)
      .eq("subject_entity_id", input.subjectEntityId)
      .in("topic_id", topicIds),
    supabase.schema("learning").from("review_schedule")
      .select("topic_id,due_at,priority,status,last_result")
      .eq("owner_user_id", input.ownerUserId)
      .eq("subject_entity_id", input.subjectEntityId)
      .in("topic_id", topicIds)
      .in("status", ["scheduled", "due"])
      .order("due_at", { ascending: true }),
    supabase.schema("learning").from("sessions")
      .select("topic_id,completion_status,started_at,ended_at,engagement_signal,friction_signal")
      .eq("owner_user_id", input.ownerUserId)
      .eq("subject_entity_id", input.subjectEntityId)
      .eq("teaching_mode", SPANISH_TEACHING_MODE)
      .gte("started_at", since)
      .order("started_at", { ascending: false })
      .limit(100),
  ]);
  if (masteryResult.error) throw new Error(`Spanish mastery lookup failed: ${masteryResult.error.message}`);
  if (reviewsResult.error) throw new Error(`Spanish review lookup failed: ${reviewsResult.error.message}`);
  if (sessionsResult.error) throw new Error(`Spanish session lookup failed: ${sessionsResult.error.message}`);

  const sessions = (sessionsResult.data || []) as SessionRow[];
  const completed = sessions.filter((row) => row.completion_status === "completed");
  const todayKey = madridDateKey(now);
  const todayCompleted = completed.some((row) => madridDateKey(row.ended_at || row.started_at) === todayKey);
  const lastCompletedAt = completed[0]?.ended_at || completed[0]?.started_at || null;

  return {
    todayCompleted,
    completed30d: completed.length,
    lastCompletedAt,
    focus: rankSpanishFocus({
      topics: (topics || []) as TopicRow[],
      mastery: (masteryResult.data || []) as MasteryRow[],
      reviews: (reviewsResult.data || []) as ReviewRow[],
      sessions,
      now,
    }),
    appUrl: SPANISH_APP_URL,
  };
}

export type SpanishBridgeTokenPayload = {
  v: 1;
  sessionId: string;
  ownerUserId: string;
  subjectEntityId: string;
  topicId: string;
  exp: number;
};

function bridgeSecret() {
  const secret = process.env.REALTYFLOW_SESSION_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw new Error("Spanish learning bridge secret is not configured");
  return secret;
}

export function createSpanishBridgeToken(payload: SpanishBridgeTokenPayload) {
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signature = createHmac("sha256", bridgeSecret()).update(body).digest("base64url");
  return `${body}.${signature}`;
}

export function verifySpanishBridgeToken(token: string): SpanishBridgeTokenPayload | null {
  try {
    const [body, signature] = token.split(".");
    if (!body || !signature) return null;
    const expected = createHmac("sha256", bridgeSecret()).update(body).digest("base64url");
    const a = Buffer.from(signature);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as SpanishBridgeTokenPayload;
    if (payload.v !== 1 || !payload.sessionId || !payload.ownerUserId || !payload.subjectEntityId || !payload.topicId) return null;
    if (!Number.isFinite(payload.exp) || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}
