import type { SupabaseClient } from "@supabase/supabase-js";

export interface TodayItem {
  id: string;
  type: "action" | "followup" | "learning_review" | "goal";
  title: string;
  reason: string;
  priority: number;
  dueAt?: string | null;
}

export interface TodaySnapshot {
  oneThing: TodayItem | null;
  secondary: TodayItem[];
  learning: TodayItem | null;
  generatedAt: string;
}

function score(item: TodayItem, now: number): number {
  let value = 100 - item.priority * 10;
  if (item.dueAt) {
    const due = new Date(item.dueAt).getTime();
    if (Number.isFinite(due)) {
      const hours = (due - now) / 3_600_000;
      if (hours <= 0) value += 60;
      else if (hours <= 24) value += 40;
      else if (hours <= 72) value += 20;
    }
  }
  if (item.type === "followup") value += 15;
  if (item.type === "action") value += 10;
  return value;
}

export async function buildTodaySnapshot(
  supabase: SupabaseClient,
  ownerUserId: string,
  subjectEntityId: string,
): Promise<TodaySnapshot> {
  const [actionsRes, followupsRes, reviewsRes, goalsRes] = await Promise.all([
    supabase.schema("mentor").from("actions")
      .select("id,title,priority,scheduled_at,commitment_status")
      .eq("owner_user_id", ownerUserId).eq("subject_entity_id", subjectEntityId)
      .in("commitment_status", ["committed", "scheduled", "in_progress"])
      .order("priority", { ascending: true }).limit(20),
    supabase.schema("mentor").from("followups")
      .select("id,followup_at,status,action_id,recommendation_id")
      .eq("owner_user_id", ownerUserId).eq("subject_entity_id", subjectEntityId)
      .in("status", ["open", "due"]).order("followup_at", { ascending: true }).limit(20),
    supabase.schema("learning").from("review_schedule")
      .select("id,due_at,priority,status,topic_id")
      .eq("owner_user_id", ownerUserId).eq("subject_entity_id", subjectEntityId)
      .in("status", ["scheduled", "due"]).order("due_at", { ascending: true }).limit(20),
    supabase.schema("personal_core").from("goals")
      .select("id,title,priority,status")
      .eq("owner_user_id", ownerUserId).eq("subject_entity_id", subjectEntityId)
      .eq("status", "active").order("priority", { ascending: true }).limit(10),
  ]);

  for (const result of [actionsRes, followupsRes, reviewsRes, goalsRes]) {
    if (result.error) throw new Error(`TODAY retrieval failed: ${result.error.message}`);
  }

  const candidates: TodayItem[] = [];
  for (const row of actionsRes.data || []) candidates.push({
    id: String(row.id), type: "action", title: String(row.title),
    reason: "Committed action", priority: Number(row.priority) || 3, dueAt: row.scheduled_at as string | null,
  });
  for (const row of followupsRes.data || []) candidates.push({
    id: String(row.id), type: "followup", title: "Follow up on an open commitment",
    reason: "Follow-up is due or approaching", priority: 2, dueAt: row.followup_at as string | null,
  });
  const learningItems: TodayItem[] = (reviewsRes.data || []).map((row) => ({
    id: String(row.id), type: "learning_review", title: "Review a learned topic",
    reason: "Retention review is due", priority: Number(row.priority) || 3, dueAt: row.due_at as string | null,
  }));
  for (const row of goalsRes.data || []) candidates.push({
    id: String(row.id), type: "goal", title: String(row.title),
    reason: "Active goal without a more specific commitment", priority: Number(row.priority) || 3,
  });

  const now = Date.now();
  candidates.sort((a, b) => score(b, now) - score(a, now));
  learningItems.sort((a, b) => score(b, now) - score(a, now));

  return {
    oneThing: candidates[0] || learningItems[0] || null,
    secondary: candidates.slice(1, 3),
    learning: learningItems[0] || null,
    generatedAt: new Date().toISOString(),
  };
}
